/**
 * Utility to extract amounts and currencies from transaction 'memo' fields.
 * Used when a transaction has amount 0 or missing in original/charged fields,
 * especially in temporary/pending transactions where the bank or scraper
 * recorded the amount inside the memo text.
 */

export function parseAmountFromMemo(memo) {
  if (!memo || typeof memo !== 'string') return null;

  const cleanMemo = memo.trim();
  if (!cleanMemo) return null;

  // Check if text indicates a credit, refund or deposit
  const creditKeywords = /(?:זיכוי|החזר|הפקדה|העברה\s*נכנסת|ביטול\s*חיוב|credit|refund|deposit)/i;
  const isCredit = creditKeywords.test(cleanMemo);

  // Currency detection
  let currency = 'ILS';
  if (/(\$|USD|דולר)/i.test(cleanMemo)) currency = 'USD';
  else if (/(€|EUR|אירו|יורו)/i.test(cleanMemo)) currency = 'EUR';
  else if (/(£|GBP|פאונד|ליש"ט)/i.test(cleanMemo)) currency = 'GBP';

  // Patterns for Israeli bank & credit card memo texts:
  // 1. Explicit labels: סכום, סך, בסך, עסקה, אישור זמני, סכום מקורי, סכום חיוב, זיכוי, החזר, הפקדה
  const labeledRegex = /(?:סכום\s*עסקה|סכום\s*חיוב|סכום\s*מקורי|סכום|בסך|סך\s*הכל|סך|אישור\s*זמני|עסקה\s*זמנית|עסקה|זיכוי|החזר|הפקדה)\s*[:=]?\s*(?:₪|ש"ח|שח|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
  
  // 2. Currency symbol / code right before number: ₪ 150.00, $ 45.50
  const prefixCurrencyRegex = /(?:₪|ש"ח|שח|\$|USD|€|EUR|£|GBP|ILS|NIS)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;

  // 3. Number followed by currency: 150.00 ₪, 120 ש"ח
  const postfixCurrencyRegex = /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:₪|ש"ח|שח|שקלים|דולר|אירו|יורו|USD|EUR|GBP|ILS|NIS)(?:\b|[\s,\.]|$)/i;

  // 4. Standalone decimal number pattern in short memo or after hyphen/dash: "- 120.50"
  const dashDecimalRegex = /(?:-|–|—|\/)\s*([0-9]+(?:\.[0-9]{1,2}))/i;

  let match = cleanMemo.match(labeledRegex);
  if (!match) match = cleanMemo.match(prefixCurrencyRegex);
  if (!match) match = cleanMemo.match(postfixCurrencyRegex);
  if (!match) match = cleanMemo.match(dashDecimalRegex);

  if (!match || !match[1]) {
    // 5. Fallback: If memo contains a number
    const genericNumber = cleanMemo.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/);
    if (genericNumber && genericNumber[1]) {
      match = genericNumber;
    }
  }

  if (match && match[1]) {
    const rawNumStr = match[1].replace(/,/g, '');
    const num = parseFloat(rawNumStr);
    if (!isNaN(num) && num > 0) {
      const signedAmount = isCredit ? num : -num;
      return {
        amount: signedAmount,
        rawAmount: num,
        isCredit,
        currency,
      };
    }
  }

  return null;
}
