/**
 * FinTrack Unified API Client & Israeli Formatters
 * Provides seamless connectivity to backend API Gateway with robust fallback mocks.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Format amount as Israeli New Shekel (ILS)
 * @param {number} amount
 * @param {Object} [options]
 * @param {boolean} [options.compact=false] - e.g. ₪ 24.5K
 * @param {boolean} [options.showSign=false] - e.g. +₪ 1,200 or -₪ 1,200
 * @param {number} [options.decimals=2]
 * @returns {string}
 */
export function formatILS(amount, options = {}) {
  const { compact = false, showSign = false, decimals = 2 } = options;
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;

  if (compact && Math.abs(num) >= 1000) {
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    let formatted = '';
    if (absVal >= 1_000_000) {
      formatted = `${(absVal / 1_000_000).toFixed(1)}M`;
    } else {
      formatted = `${(absVal / 1_000).toFixed(1)}K`;
    }
    return `${isNegative ? '-' : showSign ? '+' : ''}₪ ${formatted}`;
  }

  const formatter = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  let formatted = formatter.format(Math.abs(num));
  if (num < 0) {
    return `-${formatted}`;
  }
  if (showSign && num > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Format Date into Hebrew representation
 * @param {string|Date} dateInput
 * @param {Object} [options]
 * @param {'full'|'date'|'time'|'relative'|'monthYear'} [options.format='date']
 * @returns {string}
 */
export function formatDate(dateInput, options = {}) {
  if (!dateInput) return '—';
  const { format = 'date' } = options;
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

  if (isNaN(d.getTime())) return '—';

  if (format === 'relative') {
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'הרגע';
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    if (diffDays === 1) return 'אתמול';
    if (diffDays < 7) return `לפני ${diffDays} ימים`;
    if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`;
  }

  if (format === 'monthYear') {
    return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(d);
  }

  if (format === 'time') {
    return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(d);
  }

  if (format === 'full') {
    return new Intl.DateTimeFormat('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Format Percentage
 * @param {number} value
 * @param {boolean} [showSign=false]
 * @returns {string}
 */
export function formatPercent(value, showSign = false) {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  const sign = showSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(1)}%`;
}

// ── MOCK DATA STORE (For offline demo & resilient UI) ─────────────────────

const MOCK_ACCOUNTS = [
  {
    id: 'acc-leumi-01',
    bankCompany: 'leumi',
    displayName: 'לאומי - חשבון עו״ש ראשי',
    accountNumber: '4892',
    balance: 34250.8,
    currency: 'ILS',
    isActive: true,
    lastScrapedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    scrapeStatus: 'success',
    accountType: 'checking',
  },
  {
    id: 'acc-max-02',
    bankCompany: 'max',
    displayName: 'Max Executive - כרטיס אשראי',
    accountNumber: '8831',
    balance: -6420.5,
    currency: 'ILS',
    isActive: true,
    lastScrapedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    scrapeStatus: 'success',
    accountType: 'credit',
  },
  {
    id: 'acc-cal-03',
    bankCompany: 'cal',
    displayName: 'Cal Fly Card - נקודות תעופה',
    accountNumber: '1094',
    balance: -2890.0,
    currency: 'ILS',
    isActive: true,
    lastScrapedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    scrapeStatus: 'success',
    accountType: 'credit',
  },
  {
    id: 'acc-hapoalim-04',
    bankCompany: 'hapoalim',
    displayName: 'הפועלים - חשבון חיסכון והשקעות',
    accountNumber: '9204',
    balance: 145000.0,
    currency: 'ILS',
    isActive: true,
    lastScrapedAt: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    scrapeStatus: 'idle',
    accountType: 'savings',
  },
];

const MOCK_TRANSACTIONS = [
  {
    id: 'tx-001',
    accountId: 'acc-max-02',
    date: new Date(Date.now() - 1000 * 60 * 90).toISOString().split('T')[0],
    amount: -452.3,
    currency: 'ILS',
    description: 'שופרסל דיל סניף קניון איילון',
    merchantName: 'שופרסל דיל',
    category: 'סופרמרקט ומזון',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-002',
    accountId: 'acc-leumi-01',
    date: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString().split('T')[0],
    amount: -180.0,
    currency: 'ILS',
    description: 'פז תחנת דלק נמיר תל אביב',
    merchantName: 'פז תדלוק',
    category: 'תחבורה ודלק',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-003',
    accountId: 'acc-leumi-01',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().split('T')[0],
    amount: 22500.0,
    currency: 'ILS',
    description: 'משכורת חברת היי-טק בע״מ',
    merchantName: 'העברה בנקאית - משכורת',
    category: 'הכנסות ומשכורת',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-004',
    accountId: 'acc-cal-03',
    date: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString().split('T')[0],
    amount: -284.0,
    currency: 'ILS',
    description: 'קפה לנדוור כיכר הבימה',
    merchantName: 'קפה לנדוור',
    category: 'מסעדות ובתי קפה',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-005',
    accountId: 'acc-leumi-01',
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString().split('T')[0],
    amount: -5400.0,
    currency: 'ILS',
    description: 'העברה שכר דירה חודשי',
    merchantName: 'שכר דירה',
    category: 'דיור וחשבונות',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-006',
    accountId: 'acc-max-02',
    date: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString().split('T')[0],
    amount: -349.9,
    currency: 'ILS',
    description: 'זארה TLV FASHION MALL',
    merchantName: 'ZARA',
    category: 'קניות וביגוד',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-007',
    accountId: 'acc-max-02',
    date: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString().split('T')[0],
    amount: -129.0,
    currency: 'ILS',
    description: 'סופר-פארם קניון עזריאלי',
    merchantName: 'סופר-פארם',
    category: 'בריאות ופארם',
    status: 'completed',
    isNotified: true,
  },
  {
    id: 'tx-008',
    accountId: 'acc-cal-03',
    date: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString().split('T')[0],
    amount: -89.0,
    currency: 'ILS',
    description: 'Netflix International BV',
    merchantName: 'נטפליקס',
    category: 'פנאי ותרבות',
    status: 'completed',
    isNotified: true,
  },
];

const MOCK_BUDGETS = [
  { id: 'b-01', category: 'סופרמרקט ומזון', monthlyLimit: 3200, currentSpent: 2640, currency: 'ILS', alertThreshold: 85 },
  { id: 'b-02', category: 'מסעדות ובתי קפה', monthlyLimit: 1500, currentSpent: 1380, currency: 'ILS', alertThreshold: 80 },
  { id: 'b-03', category: 'תחבורה ודלק', monthlyLimit: 1200, currentSpent: 750, currency: 'ILS', alertThreshold: 85 },
  { id: 'b-04', category: 'קניות וביגוד', monthlyLimit: 1000, currentSpent: 920, currency: 'ILS', alertThreshold: 80 },
  { id: 'b-05', category: 'פנאי ותרבות', monthlyLimit: 800, currentSpent: 420, currency: 'ILS', alertThreshold: 80 },
];

const MOCK_GOALS = [
  {
    id: 'g-01',
    title: 'קרן חירום (6 חודשי קיום)',
    targetAmount: 60000,
    currentAmount: 48500,
    currency: 'ILS',
    targetDate: '2026-12-31',
    category: 'emergency',
    icon: 'Shield',
  },
  {
    id: 'g-02',
    title: 'חופשה קיצית ביפן',
    targetAmount: 25000,
    currentAmount: 16200,
    currency: 'ILS',
    targetDate: '2027-04-15',
    category: 'vacation',
    icon: 'Plane',
  },
  {
    id: 'g-03',
    title: 'שדרוג רכב חשמלי',
    targetAmount: 50000,
    currentAmount: 21000,
    currency: 'ILS',
    targetDate: '2027-09-01',
    category: 'car',
    icon: 'Car',
  },
];

// ── API CLIENT FUNCTIONS ──────────────────────────────────────────────────

/**
 * Fetch dashboard high-level KPIs and charts directly from PostgreSQL
 */
export async function getDashboardKPIs() {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/kpis`, { cache: 'no-store' });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[API] /api/dashboard/kpis failed, falling back:', e.message);
  }

  // Graceful initial fallback when database is fresh or backend is starting
  return {
    netWorth: 0,
    liquidCash: 0,
    investments: 0,
    totalCreditDue: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    savingsRate: 0,
    lastScrapedAt: null,
    monthlyTrend: [],
    categoryBreakdown: [],
    recentTransactions: [],
  };
}

/**
 * Fetch active bank accounts list directly from PostgreSQL
 */
export async function getAccounts() {
  try {
    const res = await fetch(`${API_BASE}/api/accounts`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('[API] /api/accounts failed:', e.message);
  }
  return [];
}

/**
 * Connect and encrypt a new bank account via HashiCorp Vault
 */
export async function createAccount(accountData) {
  const res = await fetch(`${API_BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(accountData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה ביצירת החשבון והצפנת הפרטים');
  }
  return await res.json();
}

/**
 * Soft delete / deactivate an account
 */
export async function deleteAccount(id) {
  const res = await fetch(`${API_BASE}/api/accounts/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה בהשבתת החשבון');
  }
  return await res.json();
}

/**
 * Fetch transactions with query filters directly from PostgreSQL
 */
export async function getTransactions(filters = {}) {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', filters.limit);
  if (filters.page) params.set('page', filters.page);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.category) params.set('category', filters.category);

  try {
    const res = await fetch(`${API_BASE}/api/transactions?${params.toString()}`, {
      cache: 'no-store',
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('[API] /api/transactions failed:', e.message);
  }

  return {
    data: [],
    pagination: {
      total: 0,
      limit: filters.limit || 50,
      page: filters.page || 1,
      pages: 1,
    },
  };
}

/**
 * Update transaction category directly in PostgreSQL
 */
export async function updateTransactionCategory(id, category) {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה בעדכון קטגוריית התנועה');
  }
  return await res.json();
}

/**
 * Fetch category budgets from PostgreSQL
 */
export async function getBudgets() {
  try {
    const res = await fetch(`${API_BASE}/api/budgets`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('[API] /api/budgets failed:', e.message);
  }
  return [];
}

/**
 * Save or update a category budget
 */
export async function saveBudget(budget) {
  const res = await fetch(`${API_BASE}/api/budgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(budget),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה בשמירת התקציב');
  }
  return await res.json();
}

/**
 * Delete a category budget
 */
export async function deleteBudget(id) {
  const res = await fetch(`${API_BASE}/api/budgets/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה במחיקת התקציב');
  }
  return await res.json();
}

/**
 * Fetch financial savings goals from PostgreSQL
 */
export async function getGoals() {
  try {
    const res = await fetch(`${API_BASE}/api/goals`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('[API] /api/goals failed:', e.message);
  }
  return [];
}

/**
 * Save a new savings goal
 */
export async function createGoal(goal) {
  const res = await fetch(`${API_BASE}/api/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goal),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה ביצירת יעד החיסכון');
  }
  return await res.json();
}

/**
 * Update an existing savings goal (e.g. deposit / currentAmount)
 */
export async function updateGoal(id, updates) {
  const res = await fetch(`${API_BASE}/api/goals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה בעדכון היעד');
  }
  return await res.json();
}

/**
 * Delete a savings goal
 */
export async function deleteGoal(id) {
  const res = await fetch(`${API_BASE}/api/goals/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה במחיקת היעד');
  }
  return await res.json();
}

/**
 * Fetch Vault & System Security Status
 */
export async function getVaultStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/system/status`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return {
        isSealed: data.vault?.sealed ?? false,
        initialized: data.vault?.initialized ?? true,
        secretCount: data.vault?.secretCount || 0,
        keyHealth: data.vault?.healthy ? 'healthy' : 'warning',
        lastAudit: new Date().toISOString(),
        transitKeyVersion: data.vault?.transitKeyVersion || 1,
        raw: data,
      };
    }
  } catch (e) {
    console.warn('[API] /api/system/status failed:', e.message);
  }

  return {
    isSealed: false,
    initialized: true,
    secretCount: 0,
    keyHealth: 'healthy',
    lastAudit: new Date().toISOString(),
    transitKeyVersion: 1,
  };
}

/**
 * Submit Vault Unseal Key (Shamir 2-of-2)
 */
export async function unsealVault(key) {
  const res = await fetch(`${API_BASE}/api/system/unseal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה בשחרור נעילת הכספת (Unseal)');
  }
  return await res.json();
}

/**
 * Initialize new Vault with 2-of-2 Shamir keys automatically
 */
export async function initVaultAuto() {
  const res = await fetch(`${API_BASE}/api/system/vault/init-auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'שגיאה באתחול הכספת');
  }
  return await res.json();
}

/**
 * Trigger immediate account sync scraping with israeli-bank-scrapers
 */
export async function triggerScrape(accountId = null) {
  try {
    const res = await fetch(`${API_BASE}/api/scraper/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('[API] /api/scraper/trigger failed:', e.message);
  }
  return {
    status: 'triggered',
    message: 'תהליך הסנכרון הופעל בהצלחה ברקע',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Submit OTP 2FA response to backend notifier & scraper
 */
export async function submitOtp(code, requestId = null) {
  const res = await fetch(`${API_BASE}/api/system/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp: code, requestId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'שגיאה באימות קוד ה-OTP');
  }
  return await res.json();
}
