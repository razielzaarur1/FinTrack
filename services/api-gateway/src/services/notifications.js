import { pool } from '../db.js';
import { signTmaToken } from '../crypto.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
const NOTIFIER_URL = (process.env.NOTIFIER_URL || 'http://notifier:3001').replace(/\/$/, '');

const INCOME_CATEGORIES = new Set([
  'משכורת',
  'הכנסה',
  'הכנסות',
  'זיכוי',
  'העברה',
  'השקעות',
  'Salary',
  'Income',
  'Refund',
  'קצבה או מלגה',
  'הכנסה מנכס',
  'דיווידנדים ורווחים'
]);

/**
 * Full History Anomaly Engine:
 * Analyzes the user's entire historical transactions to detect truly abnormal spending.
 * Evaluates vendor novelty, frequency, and historical baseline averages.
 */
export async function analyzeAnomalyForTransaction(client, userId, tx, anomalyMinAmount = 300) {
  const rawAmount = parseFloat(tx.amount || 0);
  const absAmount = Math.abs(rawAmount);

  // If it's an income, skip expense anomaly detection
  if (rawAmount > 0 && INCOME_CATEGORIES.has(tx.category)) {
    return { isAnomaly: false };
  }

  // Small purchases are within normal routine noise
  if (absAmount < anomalyMinAmount) {
    return { isAnomaly: false };
  }

  const merchantName = (tx.merchant_name || '').trim();
  const description = (tx.description || '').trim();

  // Search full historical data across all accounts of this user
  const historyQuery = `
    SELECT
      COUNT(*)::INT AS total_count,
      COALESCE(AVG(ABS(amount)), 0)::FLOAT AS avg_amount,
      COALESCE(MAX(ABS(amount)), 0)::FLOAT AS max_amount,
      MIN(date) AS first_seen,
      MAX(date) AS last_seen,
      COUNT(DISTINCT DATE_TRUNC('month', date))::INT AS distinct_months
    FROM transactions t
    JOIN bank_accounts b ON t.account_id = b.id
    WHERE b.user_id = $1
      AND t.id != $2
      AND t.amount < 0
      AND (
        (NULLIF($3, '') IS NOT NULL AND t.merchant_name = $3)
        OR (NULLIF($4, '') IS NOT NULL AND t.description ILIKE '%' || $4 || '%')
      )
  `;

  try {
    const res = await client.query(historyQuery, [
      userId,
      tx.id,
      merchantName || null,
      description.slice(0, 30) || null,
    ]);

    const stats = res.rows[0] || { total_count: 0, avg_amount: 0, max_amount: 0, distinct_months: 0 };
    const { total_count, avg_amount, max_amount, distinct_months } = stats;

    // Case 1: Completely Brand New Vendor in the entire recorded history
    if (total_count === 0) {
      return {
        isAnomaly: true,
        anomalyReason: 'תנועה ראשונה מבית עסק זה שלא נצפה מעולם בכל היסטוריית החשבון',
        details: { total_count, absAmount, baseline: 'none' },
      };
    }

    // Case 2: Extreme Surge/Spike compared to the full historical baseline
    if (total_count >= 2) {
      if (absAmount >= (2.5 * avg_amount) && absAmount > max_amount && (absAmount - avg_amount >= 200)) {
        const ratio = (absAmount / (avg_amount || 1)).toFixed(1);
        return {
          isAnomaly: true,
          anomalyReason: `סכום חריג ביותר: פי ${ratio} מהממוצע ההיסטורי בבית עסק זה (ממוצע: ₪${Math.round(avg_amount).toLocaleString()})`,
          details: { total_count, avg_amount, max_amount, absAmount, ratio },
        };
      }
    }

    // Case 3: Rare/Dormant Vendor (seen once or twice, but not seen in a long time)
    if (distinct_months <= 1 && absAmount >= (anomalyMinAmount * 1.5)) {
      return {
        isAnomaly: true,
        anomalyReason: 'הוצאה חריגה מבית עסק שאינו שגרתי',
        details: { total_count, distinct_months, absAmount },
      };
    }

    // Routine recurring transaction (e.g. monthly ATM withdrawal, subscriptions, recurring shops)
    return { isAnomaly: false };
  } catch (err) {
    return { isAnomaly: false, error: err.message };
  }
}

/**
 * Checks if a transaction pushes the monthly category budget over limit
 */
export async function checkBudgetExceeded(client, userId, category, notifiedBudgetsMap = {}) {
  if (!category || typeof category !== 'string' || !category.trim()) {
    return null;
  }

  try {
    const budgetRes = await client.query(
      `SELECT monthly_limit FROM budgets WHERE user_id = $1 AND category = $2`,
      [userId, category]
    );

    if (budgetRes.rows.length === 0) {
      return null;
    }

    const monthlyLimit = parseFloat(budgetRes.rows[0].monthly_limit);
    if (isNaN(monthlyLimit) || monthlyLimit <= 0) {
      return null;
    }

    const spentRes = await client.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::FLOAT AS spent
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.id
       WHERE b.user_id = $1
         AND t.category = $2
         AND t.is_ignored = false
         AND t.amount < 0
         AND t.date >= DATE_TRUNC('month', CURRENT_DATE)
         AND t.date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')`,
      [userId, category]
    );

    const spent = parseFloat(spentRes.rows[0]?.spent || 0);
    if (spent > monthlyLimit) {
      const currentMonthStr = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      if (notifiedBudgetsMap[category] === currentMonthStr) {
        // Already notified this month
        return null;
      }

      return {
        category,
        monthlyLimit,
        currentSpent: spent,
        excessAmount: spent - monthlyLimit,
        percent: Math.round((spent / monthlyLimit) * 100),
        monthStr: currentMonthStr,
      };
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Main processor: processes unnotified transactions and sends real-time Telegram alerts
 */
export async function processPendingNotifications(logger = console) {
  const client = await pool.connect();
  try {
    // 1. Fetch system settings
    const settingsRes = await client.query(
      `SELECT settings FROM system_settings WHERE user_id = $1`,
      [DEFAULT_USER_ID]
    );
    const settings = settingsRes.rows[0]?.settings || {};

    const telegramEnabled = settings.telegramNotificationsEnabled !== false;
    const notifyOnNew = settings.notifyOnNewTransactions !== false;
    const notifyOnAnomaly = settings.notifyOnAnomaly !== false;
    const notifyOnBudget = settings.notifyOnBudgetExceeded !== false;
    const anomalyMinAmount = parseInt(settings.anomalyMinAmount, 10) || 300;
    const notifyMaxAgeDays = Math.max(1, parseInt(settings.notifyMaxAgeDays, 10) || 7);
    const tmaBaseUrl = (settings.tmaBaseUrl || '').trim();
    const notifiedBudgets = settings.notified_budgets || {};

    if (!telegramEnabled) {
      // Auto-mark all transactions as notified if notifications are disabled
      await client.query(
        `UPDATE transactions t
         SET is_notified = true
         FROM bank_accounts b
         WHERE t.account_id = b.id AND b.user_id = $1 AND t.is_notified = false`,
        [DEFAULT_USER_ID]
      );
      return { processed: 0, message: 'Telegram notifications disabled' };
    }

    // 2. Proactive Cleanup: Auto-mark all historical transactions older than notifyMaxAgeDays as notified
    const cutoffDate = new Date(Date.now() - notifyMaxAgeDays * 24 * 60 * 60 * 1000);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const cleanupRes = await client.query(
      `UPDATE transactions t
       SET is_notified = true
       FROM bank_accounts b
       WHERE t.account_id = b.id
         AND b.user_id = $1
         AND t.is_notified = false
         AND t.date < $2::date`,
      [DEFAULT_USER_ID, cutoffDateStr]
    );

    if (cleanupRes.rowCount > 0) {
      logger.info?.(`[NotifierEngine] Auto-marked ${cleanupRes.rowCount} historical transactions older than ${notifyMaxAgeDays} days (${cutoffDateStr}) as notified.`);
    }

/**
 * Extracts installment details from transaction and raw_data
 */
function extractInstallmentDetails(tx) {
  let raw = tx.raw_data;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
  }
  if (!raw || typeof raw !== 'object') raw = {};

  const inst = raw.installments;
  if (inst) {
    if (typeof inst === 'object' && inst !== null) {
      const num = parseInt(inst.number ?? inst.current ?? inst.num ?? 1, 10);
      const total = parseInt(inst.total ?? inst.count ?? 1, 10);
      if (total > 1) {
        return {
          isInstallment: true,
          number: num,
          total: total,
          text: `תשלום ${num} מתוך ${total}`,
          totalAmount: Math.abs(parseFloat(raw.originalAmount || 0)),
        };
      }
    }
  }

  const candidates = [tx.description, tx.merchant_name, raw.description, raw.memo, raw.originalDescription].filter(Boolean);
  for (const str of candidates) {
    const cleanStr = String(str).replace(/\s+/g, ' ');
    const match = cleanStr.match(/(?:תשלום|תשלומים|עסקה)?\s*\(?(\d{1,2})\s*(?:מתוך|\/)\s*(\d{1,2})\)?/);
    if (match) {
      const num = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (total > 1 && total <= 120 && num <= total) {
        return {
          isInstallment: true,
          number: num,
          total: total,
          text: `תשלום ${num} מתוך ${total}`,
          totalAmount: Math.abs(parseFloat(raw.originalAmount || 0)),
        };
      }
    }
  }

  const origAmt = Math.abs(parseFloat(raw.originalAmount || 0));
  const chargedAmt = Math.abs(parseFloat(raw.chargedAmount || tx.amount || 0));
  if (origAmt > 0 && chargedAmt > 0 && origAmt > chargedAmt * 1.5) {
    const ratio = Math.round(origAmt / chargedAmt);
    if (ratio >= 2 && ratio <= 60 && Math.abs(origAmt - chargedAmt * ratio) < (chargedAmt * 0.15)) {
      return {
        isInstallment: true,
        number: 1,
        total: ratio,
        text: `עסקת תשלומים (תשלום 1 מתוך ${ratio})`,
        totalAmount: origAmt,
      };
    }
  }

  return { isInstallment: false };
}

    // 3. Fetch only unnotified transactions within the active window (t.date >= cutoffDate)
    const unnotifiedRes = await client.query(
      `SELECT
         t.id, t.amount, t.date, t.currency, t.merchant_name, t.description,
         t.category, t.status, t.user_description, t.is_ignored, t.raw_data, t.created_at,
         b.display_name, b.bank_company, b.account_number
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.id
       WHERE b.user_id = $1
         AND t.is_notified = false
         AND t.date >= $2::date
       ORDER BY t.date DESC, t.created_at DESC`,
      [DEFAULT_USER_ID, cutoffDateStr]
    );

    const rows = unnotifiedRes.rows;
    if (rows.length === 0) {
      return { processed: 0, message: 'No unnotified transactions in active window' };
    }

    logger.info?.(`[NotifierEngine] Found ${rows.length} unnotified transactions within last ${notifyMaxAgeDays} days.`);

    // Rate-limit safeguard: send at most 10 most recent notifications per batch to prevent flooding
    let toNotify = rows;
    if (rows.length > 10) {
      toNotify = rows.slice(0, 10);
      const excessIds = rows.slice(10).map((r) => r.id);
      if (excessIds.length > 0) {
        await client.query(`UPDATE transactions SET is_notified = true WHERE id = ANY($1)`, [excessIds]);
        logger.info?.(`[NotifierEngine] Auto-marked ${excessIds.length} excess transactions as notified to prevent flood.`);
      }
    }

    let notifiedCount = 0;
    const updatedNotifiedBudgets = { ...notifiedBudgets };

    for (const tx of toNotify) {
      // 1. Anomaly check using full history
      const anomalyResult = await analyzeAnomalyForTransaction(client, DEFAULT_USER_ID, tx, anomalyMinAmount);
      const isAnomaly = Boolean(anomalyResult.isAnomaly);
      const anomalyReason = anomalyResult.anomalyReason || null;
      const installmentInfo = extractInstallmentDetails(tx);

      // 2. Build secure scoped TMA link (Least-Privilege Token)
      let tmaUrl = null;
      if (tmaBaseUrl && tmaBaseUrl.startsWith('https://')) {
        const token = signTmaToken(tx.id);
        tmaUrl = `${tmaBaseUrl.replace(/\/$/, '')}/tma/transaction/${tx.id}?token=${encodeURIComponent(token)}`;
      }

      // 3. Send Telegram notification if enabled
      if (notifyOnNew || (isAnomaly && notifyOnAnomaly)) {
        try {
          const payload = {
            transaction: {
              id: tx.id,
              amount: parseFloat(tx.amount),
              date: tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).slice(0, 10),
              merchantName: tx.merchant_name,
              description: tx.description,
              category: tx.category,
              currency: tx.currency || 'ILS',
              installments: installmentInfo,
            },
            account: {
              displayName: tx.display_name,
              bankCompany: tx.bank_company,
            },
            tmaUrl,
            isAnomaly,
            anomalyReason,
          };

          const notifyRes = await fetch(`${NOTIFIER_URL}/api/notify/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(6000),
          });

          if (notifyRes.ok) {
            notifiedCount++;
          }
        } catch (postErr) {
          logger.warn?.(`[NotifierEngine] Failed to dispatch transaction notification: ${postErr.message}`);
        }
      }

      // 4. Budget Exceeded Check
      if (notifyOnBudget && tx.category) {
        const budgetAlert = await checkBudgetExceeded(client, DEFAULT_USER_ID, tx.category, updatedNotifiedBudgets);
        if (budgetAlert) {
          try {
            let budgetTmaUrl = null;
            if (tmaBaseUrl && tmaBaseUrl.startsWith('https://')) {
              budgetTmaUrl = `${tmaBaseUrl.replace(/\/$/, '')}/budgets`;
            }

            await fetch(`${NOTIFIER_URL}/api/notify/budget`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...budgetAlert, tmaUrl: budgetTmaUrl }),
              signal: AbortSignal.timeout(6000),
            });

            updatedNotifiedBudgets[budgetAlert.category] = budgetAlert.monthStr;
          } catch (budgetErr) {
            logger.warn?.(`[NotifierEngine] Failed to dispatch budget alert: ${budgetErr.message}`);
          }
        }
      }

      // 5. Mark transaction as notified
      await client.query(`UPDATE transactions SET is_notified = true WHERE id = $1`, [tx.id]);

      // Small pause between messages to avoid Telegram rate limits
      await new Promise((r) => setTimeout(r, 400));
    }

    // Save updated budget notification tracking
    await client.query(
      `UPDATE system_settings
       SET settings = jsonb_set(settings, '{notified_budgets}', $1::jsonb, true),
           updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(updatedNotifiedBudgets), DEFAULT_USER_ID]
    );

    return { processed: toNotify.length, notified: notifiedCount };
  } catch (err) {
    logger.error?.(`[NotifierEngine] Error in processPendingNotifications: ${err.message}`);
    return { error: err.message };
  } finally {
    client.release();
  }
}

export default {
  analyzeAnomalyForTransaction,
  checkBudgetExceeded,
  processPendingNotifications,
};
