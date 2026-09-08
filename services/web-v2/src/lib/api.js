const API_BASE = typeof window !== 'undefined' ? '' : (process.env.INTERNAL_API_URL || 'http://api-gateway:3000');

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const res = await fetch(url, config);
    const contentType = res.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      return {
        data: null,
        error: data?.message || data?.error || `HTTP error ${res.status}`,
        status: res.status,
      };
    }

    return { data, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: err.message || 'Network error', status: 500 };
  }
}

export const api = {
  // Accounts
  getAccounts: () => request('/api/accounts'),
  createAccount: (data) => request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
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

  // Categories
  getCategories: (type) => request(`/api/categories${type ? `?type=${type}` : ''}`),
  createCategory: (data) => request('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),

  // Analytics
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
  getCategoryBreakdown: (year, month, type = 'expense', accountId) => {
    const q = new URLSearchParams({ type });
    if (year) q.append('year', year);
    if (month) q.append('month', month);
    if (accountId) q.append('accountId', accountId);
    return request(`/api/analytics/category-breakdown?${q.toString()}`);
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
