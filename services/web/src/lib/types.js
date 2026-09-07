/**
 * FinTrack Core Types & Metadata Definitions
 */

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} bankCompany - e.g. 'leumi', 'hapoalim', 'discount', 'isracard', 'max', 'cal'
 * @property {string} displayName - User readable title, e.g. "לאומי - חשבון עו״ש ראשי"
 * @property {string} [accountNumber] - Last 4 digits, e.g. "4892"
 * @property {number} balance - Current account balance or credit card due
 * @property {string} currency - 'ILS' | 'USD' | 'EUR'
 * @property {boolean} isActive
 * @property {string|null} lastScrapedAt - ISO Date string
 * @property {'idle'|'running'|'error'|'success'} scrapeStatus
 * @property {string|null} [errorReason]
 * @property {'checking'|'credit'|'savings'|'investment'} accountType
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} accountId
 * @property {string} [externalId]
 * @property {string} date - ISO Date string (YYYY-MM-DD)
 * @property {number} amount - Negative for expense, positive for income
 * @property {string} currency - Default 'ILS'
 * @property {string} description - Raw bank description
 * @property {string} [merchantName] - Parsed merchant title
 * @property {string} category - Category name in Hebrew
 * @property {'completed'|'pending'} status
 * @property {boolean} [isNotified]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Budget
 * @property {string} id
 * @property {string} category - Category name in Hebrew
 * @property {number} monthlyLimit - Monthly spending cap in ILS
 * @property {number} currentSpent - Amount spent this month in ILS
 * @property {string} currency
 * @property {number} alertThreshold - Percentage to trigger warning (e.g. 85%)
 */

/**
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} title - Goal name in Hebrew, e.g. "קרן חירום", "חופשה משפחתית"
 * @property {number} targetAmount - Target sum in ILS
 * @property {number} currentAmount - Current accumulated sum in ILS
 * @property {string} currency
 * @property {string} targetDate - Target ISO Date (YYYY-MM-DD)
 * @property {string} category - e.g. 'savings' | 'vacation' | 'car' | 'emergency'
 * @property {string} [icon]
 */

/**
 * @typedef {Object} VaultStatus
 * @property {boolean} isSealed
 * @property {boolean} initialized
 * @property {number} secretCount
 * @property {'healthy'|'warning'|'critical'} keyHealth
 * @property {string} lastAudit
 * @property {number} transitKeyVersion
 */

/**
 * @typedef {Object} OtpRequest
 * @property {string} requestId
 * @property {string} bank
 * @property {string} [phoneHint]
 * @property {string} [accountId]
 * @property {string} [prompt]
 * @property {number} timeoutSeconds
 * @property {number} expiresAt - Timestamp ms
 */

/**
 * Metadata for Supported Israeli Financial Institutions
 */
export const ISRAELI_INSTITUTIONS = {
  leumi: {
    id: 'leumi',
    name: 'בנק לאומי',
    type: 'bank',
    color: '#00529b',
    badgeBg: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    logoText: 'לאומי',
    hasOtp: true,
  },
  hapoalim: {
    id: 'hapoalim',
    name: 'בנק הפועלים',
    type: 'bank',
    color: '#dc2626',
    badgeBg: 'bg-red-900/40 text-red-300 border-red-700/50',
    logoText: 'הפועלים',
    hasOtp: true,
  },
  discount: {
    id: 'discount',
    name: 'בנק דיסקונט',
    type: 'bank',
    color: '#059669',
    badgeBg: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
    logoText: 'דיסקונט',
    hasOtp: true,
  },
  mizrahi: {
    id: 'mizrahi',
    name: 'מזרחי טפחות',
    type: 'bank',
    color: '#d97706',
    badgeBg: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    logoText: 'מזרחי',
    hasOtp: true,
  },
  fibi: {
    id: 'fibi',
    name: 'הבנק הבינלאומי',
    type: 'bank',
    color: '#2563eb',
    badgeBg: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    logoText: 'הבינלאומי',
    hasOtp: false,
  },
  yahav: {
    id: 'yahav',
    name: 'בנק יהב',
    type: 'bank',
    color: '#4f46e5',
    badgeBg: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50',
    logoText: 'יהב',
    hasOtp: false,
  },
  onezero: {
    id: 'onezero',
    name: 'ONE ZERO',
    type: 'bank',
    color: '#06b6d4',
    badgeBg: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
    logoText: '1ZERO',
    hasOtp: true,
  },
  max: {
    id: 'max',
    name: 'Max (לאומי קארד)',
    type: 'credit',
    color: '#ea580c',
    badgeBg: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
    logoText: 'MAX',
    hasOtp: true,
  },
  cal: {
    id: 'cal',
    name: 'כאל - Cal',
    type: 'credit',
    color: '#e11d48',
    badgeBg: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
    logoText: 'CAL',
    hasOtp: true,
  },
  isracard: {
    id: 'isracard',
    name: 'ישראכרט',
    type: 'credit',
    color: '#2563eb',
    badgeBg: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    logoText: 'ישראכרט',
    hasOtp: true,
  },
};

/**
 * Standard Israeli Expense & Income Categories
 */
export const CATEGORIES = [
  { id: 'groceries', name: 'סופרמרקט ומזון', color: '#10b981', icon: 'ShoppingCart' },
  { id: 'dining', name: 'מסעדות ובתי קפה', color: '#f59e0b', icon: 'Utensils' },
  { id: 'housing', name: 'דיור וחשבונות', color: '#3b82f6', icon: 'Home' },
  { id: 'transport', name: 'תחבורה ודלק', color: '#6366f1', icon: 'Car' },
  { id: 'health', name: 'בריאות ופארם', color: '#ec4899', icon: 'HeartPulse' },
  { id: 'shopping', name: 'קניות וביגוד', color: '#8b5cf6', icon: 'ShoppingBag' },
  { id: 'leisure', name: 'פנאי ותרבות', color: '#14b8a6', icon: 'Film' },
  { id: 'education', name: 'חינוך וחוגים', color: '#06b6d4', icon: 'GraduationCap' },
  { id: 'insurance', name: 'ביטוח ופיננסים', color: '#64748b', icon: 'ShieldCheck' },
  { id: 'salary', name: 'הכנסות ומשכורת', color: '#22c55e', icon: 'BadgeDollarSign' },
  { id: 'other', name: 'שונות', color: '#94a3b8', icon: 'MoreHorizontal' },
];
