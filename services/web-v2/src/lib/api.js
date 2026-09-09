const API_BASE = typeof window !== 'undefined' ? '' : (process.env.INTERNAL_API_URL || 'http://api-gateway:3000');

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fintrack_auth_token');
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const res = await fetch(url, config);
    const contentType = res.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      let errMsg = data?.message || data?.error;
      if (!errMsg && typeof data === 'string' && data.trim().length > 0 && data.length < 200) {
        errMsg = data.trim();
      }
      return {
        data: null,
        error: errMsg || `שגיאת שרת (HTTP ${res.status})`,
        status: res.status,
      };
    }

    return { data, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: 'שגיאת רשת: ' + (err.message || 'לא ניתן להתחבר לשרת'), status: 500 };
  }
}

export const api = {
  // Auth & Master Passcode
  getAuthStatus: () => request('/api/auth/status'),
  setupPasscode: (passcode) => request('/api/auth/setup', { method: 'POST', body: JSON.stringify({ passcode }) }),
  verifyPasscode: (passcode) => request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ passcode }) }),
  changePasscode: (currentPasscode, newPasscode) => request('/api/auth/change', { method: 'POST', body: JSON.stringify({ currentPasscode, newPasscode }) }),

  // Accounts
  getAccounts: () => request('/api/accounts'),
  createAccount: (data) => request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id, data) => request(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id) => request(`/api/accounts/${id}`, { method: 'DELETE' }),

  // Transactions (v2 with cursor pagination)
  getTransactionsV2: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    return request(`/api/v2/transactions?${searchParams.toString()}`);
  },
  updateTransaction: (id, data) => request(`/api/v2/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  bulkUpdateTransactions: (data) => request('/api/v2/transactions/bulk-update', { method: 'POST', body: JSON.stringify(data) }),

  // Splits
  getSplits: (txId) => request(`/api/v2/transactions/${txId}/splits`),
  saveSplits: (txId, splits) => request(`/api/v2/transactions/${txId}/splits`, { method: 'PUT', body: JSON.stringify({ splits }) }),
  deleteSplits: (txId) => request(`/api/v2/transactions/${txId}/splits`, { method: 'DELETE' }),

  // Notes
  getNotes: (txId) => request(`/api/v2/transactions/${txId}/notes`),
  addNote: (txId, note) => request(`/api/v2/transactions/${txId}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  deleteNote: (noteId) => request(`/api/v2/transactions/notes/${noteId}`, { method: 'DELETE' }),

  // Links
  getLinks: (txId) => request(`/api/v2/transactions/${txId}/links`),
  linkTransaction: (txId, data) => request(`/api/v2/transactions/${txId}/links`, { method: 'POST', body: JSON.stringify(data) }),
  deleteLink: (linkId) => request(`/api/v2/transactions/links/${linkId}`, { method: 'DELETE' }),

  // Categories & Learning
  getCategories: (arg1, arg2) => {
    let type = arg1;
    let tree = arg2;
    if (typeof arg1 === 'object' && arg1 !== null) {
      type = arg1.type;
      tree = arg1.tree;
    }
    const q = new URLSearchParams();
    if (type) q.append('type', type);
    if (tree) q.append('tree', 'true');
    const qs = q.toString();
    return request(`/api/categories${qs ? `?${qs}` : ''}`);
  },
  createCategory: (data) => request('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),
  classifyTransaction: (data) => request('/api/categories/classify', { method: 'POST', body: JSON.stringify(data) }),
  getCategoryRules: () => request('/api/categories/rules'),
  saveCategoryRule: (data) => request('/api/categories/rules', { method: 'POST', body: JSON.stringify(data) }),
  reclassifyAllTransactions: () => request('/api/categories/reclassify-all', { method: 'POST' }),

  // Review Queue
  getReviewQueue: (flaggedOnly = false) => request(`/api/v2/transactions/review-queue${flaggedOnly ? '?flaggedOnly=true' : ''}`),
  reviewTransaction: (id, action, category) => request(`/api/v2/transactions/${id}/review`, { method: 'POST', body: JSON.stringify({ action, category }) }),

  // Analytics & Statistics
  getAnalyticsOverview: (year, month) => {
    const q = new URLSearchParams();
    if (year) q.append('year', year);
    if (month) q.append('month', month);
    return request(`/api/analytics/overview?${q.toString()}`);
  },
  getMonthlyTrend: (months = 12, accountId) => {
    const q = new URLSearchParams({ months });
    if (accountId) q.append('accountId', accountId);
    return request(`/api/analytics/monthly-trend?${q.toString()}`);
  },
  getCategoryBreakdown: (arg1, month, type = 'expense', accountId) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { year: arg1, month, type, accountId };
    }
    const q = new URLSearchParams();
    if (opts.type) q.append('type', opts.type);
    if (opts.year) q.append('year', opts.year);
    if (opts.month) q.append('month', opts.month);
    if (opts.accountId) q.append('accountId', opts.accountId);
    if (opts.accountIds) q.append('accountIds', Array.isArray(opts.accountIds) ? opts.accountIds.join(',') : opts.accountIds);
    return request(`/api/analytics/category-breakdown?${q.toString()}`);
  },
  getCategoryAverages: () => request('/api/analytics/category-averages'),
  getTopExpenses: (year, month, limit = 5) => {
    const q = new URLSearchParams({ limit });
    if (year) q.append('year', year);
    if (month) q.append('month', month);
    return request(`/api/analytics/top-expenses?${q.toString()}`);
  },
  getTopMerchants: (year, month, limit = 10) => {
    const q = new URLSearchParams({ limit });
    if (year) q.append('year', year);
    if (month) q.append('month', month);
    return request(`/api/analytics/top-merchants?${q.toString()}`);
  },
  getDailySpending: (year, month) => {
    const q = new URLSearchParams();
    if (year) q.append('year', year);
    if (month) q.append('month', month);
    return request(`/api/analytics/daily-spending?${q.toString()}`);
  },

  // Budgets & Goals
  getBudgets: () => request('/api/budgets'),
  saveBudget: (data) => request('/api/budgets', { method: 'POST', body: JSON.stringify(data) }),
  deleteBudget: (id) => request(`/api/budgets/${id}`, { method: 'DELETE' }),
  getGoals: () => request('/api/goals'),
  createGoal: (data) => request('/api/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id, data) => request(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteGoal: (id) => request(`/api/goals/${id}`, { method: 'DELETE' }),

  // System Settings
  getSystemSettings: () => request('/api/system/settings'),
  updateSystemSettings: (settings) => request('/api/system/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),

  // Scraper Trigger
  triggerScrape: (accountId = null, daysBack = null) =>
    request('/api/scraper/trigger', {
      method: 'POST',
      body: JSON.stringify({ accountId, ...(daysBack ? { daysBack } : {}) }),
    }),
};
