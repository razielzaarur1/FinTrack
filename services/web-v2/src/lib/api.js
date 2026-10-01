const API_BASE = typeof window !== 'undefined' ? '' : (process.env.INTERNAL_API_URL || 'http://api-gateway:3000');

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
      let errMsg = data?.detail || ((data?.error && data?.error !== 'Database error') ? data.error : (data?.message || data?.error));
      if (!errMsg && typeof data === 'string' && data.trim().length > 0 && data.length < 200) {
        errMsg = data.trim();
      }
      const diagnostic = typeof data === 'object' && data !== null
        ? data
        : { raw: data, status: res.status, url, stage: 'HTTP_' + res.status };

      return {
        data: null,
        error: errMsg || `שגיאת שרת (HTTP ${res.status})`,
        status: res.status,
        stage: diagnostic?.stage || 'HTTP_' + res.status,
        details: diagnostic?.details || null,
        diagnostic,
      };
    }

    return { data, error: null, status: res.status };
  } catch (err) {
    return {
      data: null,
      error: 'שגיאת רשת: ' + (err.message || 'לא ניתן להתחבר לשרת'),
      status: 0,
      stage: 'CLIENT_NETWORK_ERROR',
      details: err.message,
      diagnostic: {
        stage: 'CLIENT_NETWORK_ERROR',
        error: err.message,
        url,
      },
    };
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
  getAccountDiagnostics: () => request('/api/accounts/diagnostics'),
  createAccount: (data) => request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id, data) => request(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id) => request(`/api/accounts/${id}`, { method: 'DELETE' }),

  getTransactions: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        if (Array.isArray(val)) {
          if (val.length > 0) searchParams.append(key, val.join(','));
        } else {
          searchParams.append(key, val);
        }
      }
    });
    return request(`/api/transactions?${searchParams.toString()}`);
  },
  getTransactionsV2: (params) => api.getTransactions(params),
  getFilterCounts: () => request('/api/transactions/filter-counts'),
  getTransaction: (id) => request(`/api/transactions/${id}`),
  getCurrencies: (params) => request(`/api/transactions/currencies${params?.refresh ? '?refresh=true' : ''}`),
  createTransaction: (data) => request('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => request(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  getSimilarTransactions: (id) => request(`/api/transactions/${id}/similar`),
  getTxFxDetails: (id) => request(`/api/transactions/${id}/fx`),
  bulkUpdateTransactions: (data) => request('/api/transactions/bulk-update', { method: 'POST', body: JSON.stringify(data) }),
  detectCcBillingAnomalies: () => request('/api/transactions/detect-anomalies', { method: 'POST' }),
  exportTransactionsCsv: (data) => request('/api/transactions/export', { method: 'POST', body: JSON.stringify(data || {}) }),
  importCsvTransactions: (data) => request('/api/transactions/import-csv', { method: 'POST', body: JSON.stringify(data || {}) }),

  // Splits
  getSplits: (txId) => request(`/api/transactions/${txId}/splits`),
  saveSplits: (txId, splits) => request(`/api/transactions/${txId}/splits`, { method: 'PUT', body: JSON.stringify({ splits }) }),
  deleteSplits: (txId) => request(`/api/transactions/${txId}/splits`, { method: 'DELETE' }),

  // Notes
  getNotes: (txId) => request(`/api/transactions/${txId}/notes`),
  addNote: (txId, note) => request(`/api/transactions/${txId}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  deleteNote: (noteId) => request(`/api/transactions/notes/${noteId}`, { method: 'DELETE' }),

  // Links
  getLinks: (txId) => request(`/api/transactions/${txId}/links`),
  linkTransaction: (txId, data) => request(`/api/transactions/${txId}/links`, { method: 'POST', body: JSON.stringify(data) }),
  deleteLink: (linkId) => request(`/api/transactions/links/${linkId}`, { method: 'DELETE' }),
  updateLinkFee: (linkId, data) => request(`/api/transactions/links/${linkId}/fee`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Reconciliation & Credit Card Billings
  getReconciliationCandidates: (txId, params) => request(`/api/transactions/${txId}/reconciliation-candidates${params?.minScore ? `?minScore=${params.minScore}` : ''}`),
  reconcileCcAuto: (data) => request('/api/transactions/reconcile-auto', { method: 'POST', body: JSON.stringify(data || {}) }),
  detectCcBillings: (data) => request('/api/transactions/detect-cc-billings', { method: 'POST', body: JSON.stringify(data || {}) }),
  getDetectedCcMerchants: () => request('/api/transactions/detected-cc-merchants'),

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
  reorderCategories: (data) => request('/api/categories/reorder', { method: 'PUT', body: JSON.stringify(data) }),
  resetCategoriesToDefault: () => request('/api/categories/reset-default', { method: 'POST' }),
  classifyTransaction: (data) => request('/api/categories/classify', { method: 'POST', body: JSON.stringify(data) }),
  getCategoryRules: () => request('/api/categories/rules'),
  updateCategoryRule: (id, data) => request(`/api/categories/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategoryRule: (id) => request(`/api/categories/rules/${id}`, { method: 'DELETE' }),
  reclassifyAllTransactions: () => request('/api/categories/reclassify-unreviewed', { method: 'POST' }),
  reclassifyUnreviewedTransactions: () => request('/api/categories/reclassify-unreviewed', { method: 'POST' }),
  getCategorySuggestions: () => request('/api/categories/suggestions'),
  scanCategorySuggestions: () => request('/api/categories/suggestions/scan', { method: 'POST' }),
  approveCategorySuggestion: (id, data = {}) => request(`/api/categories/suggestions/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  dismissCategorySuggestion: (id) => request(`/api/categories/suggestions/${id}/dismiss`, { method: 'POST' }),
  aiSuggestCategory: (data) => request('/api/categories/ai-suggest', { method: 'POST', body: JSON.stringify(data) }),
  aiClassifyTransaction: (id) => request(`/api/transactions/${id}/ai-classify`, { method: 'POST' }),

  // Review Queue
  getReviewQueue: (options = {}) => {
    let tab = 'pending';
    if (typeof options === 'boolean') {
      tab = options ? 'flagged' : 'pending';
    } else if (typeof options === 'string') {
      tab = options;
    } else if (options && options.tab) {
      tab = options.tab;
    }
    return request(`/api/transactions/review-queue?tab=${encodeURIComponent(tab)}`);
  },
  reviewTransaction: (id, payload) => {
    const body = typeof payload === 'string' ? { action: payload } : payload;
    return request(`/api/transactions/${id}/review`, { method: 'POST', body: JSON.stringify(body) });
  },

  // Analytics & Statistics
  getAnalyticsOverview: (arg1, arg2, arg3) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { year: arg1, month: arg2, startDay: arg3 };
    }
    const q = new URLSearchParams();
    if (opts.year) q.append('year', opts.year);
    if (opts.month) q.append('month', opts.month);
    if (opts.startDate) q.append('startDate', opts.startDate);
    if (opts.endDate) q.append('endDate', opts.endDate);
    if (opts.startDay) q.append('startDay', opts.startDay);
    return request(`/api/analytics/overview?${q.toString()}`);
  },
  getMonthlyTrend: (months = 12, accountId, startDay) => {
    let opts = typeof months === 'object' && months !== null ? months : { months, accountId, startDay };
    const q = new URLSearchParams();
    if (opts.months) q.append('months', opts.months);
    if (opts.accountId) q.append('accountId', opts.accountId);
    if (opts.startDay) q.append('startDay', opts.startDay);
    return request(`/api/analytics/monthly-trend?${q.toString()}`);
  },
  getCategoryBreakdown: (arg1, month, type = 'expense', accountId, startDay) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { year: arg1, month, type, accountId, startDay };
    }
    const q = new URLSearchParams();
    if (opts.type) q.append('type', opts.type);
    if (opts.year) q.append('year', opts.year);
    if (opts.month) q.append('month', opts.month);
    if (opts.startDate) q.append('startDate', opts.startDate);
    if (opts.endDate) q.append('endDate', opts.endDate);
    if (opts.startDay) q.append('startDay', opts.startDay);
    if (opts.accountId) q.append('accountId', opts.accountId);
    if (opts.accountIds) q.append('accountIds', Array.isArray(opts.accountIds) ? opts.accountIds.join(',') : opts.accountIds);
    return request(`/api/analytics/category-breakdown?${q.toString()}`);
  },
  getCategoryAverages: (arg1, months, categories) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { startDay: arg1, months, categories };
    }
    const q = new URLSearchParams();
    if (opts.startDay) q.append('startDay', opts.startDay);
    if (opts.months) q.append('months', opts.months);
    if (opts.categories) {
      q.append('categories', Array.isArray(opts.categories) ? JSON.stringify(opts.categories) : String(opts.categories));
    }
    return request(`/api/analytics/category-averages${q.toString() ? `?${q.toString()}` : ''}`);
  },
  getHistoricalBalanceSummary: (arg1) => {
    let opts = typeof arg1 === 'object' && arg1 !== null ? arg1 : { months: arg1 };
    const q = new URLSearchParams();
    if (opts.months) q.append('months', opts.months);
    if (opts.startDay) q.append('startDay', opts.startDay);
    return request(`/api/analytics/historical-balance-summary${q.toString() ? `?${q.toString()}` : ''}`);
  },
  getDeepStats: (arg1) => {
    let opts = typeof arg1 === 'object' && arg1 !== null ? arg1 : {};
    const q = new URLSearchParams();
    if (opts.startDate) q.append('startDate', opts.startDate);
    if (opts.endDate) q.append('endDate', opts.endDate);
    if (opts.startDay) q.append('startDay', opts.startDay);
    return request(`/api/analytics/deep-stats${q.toString() ? `?${q.toString()}` : ''}`);
  },
  generateAiWidget: (data) => request('/api/analytics/ai-widget', { method: 'POST', body: JSON.stringify(data || {}) }),
  getTopExpenses: (arg1, month, limit = 5, startDay) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { year: arg1, month, limit, startDay };
    }
    const q = new URLSearchParams();
    if (opts.limit) q.append('limit', opts.limit);
    if (opts.year) q.append('year', opts.year);
    if (opts.month) q.append('month', opts.month);
    if (opts.startDate) q.append('startDate', opts.startDate);
    if (opts.endDate) q.append('endDate', opts.endDate);
    if (opts.startDay) q.append('startDay', opts.startDay);
    return request(`/api/analytics/top-expenses?${q.toString()}`);
  },
  getTopMerchants: (arg1, month, limit = 10, startDay) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { year: arg1, month, limit, startDay };
    }
    const q = new URLSearchParams();
    if (opts.limit) q.append('limit', opts.limit);
    if (opts.year) q.append('year', opts.year);
    if (opts.month) q.append('month', opts.month);
    if (opts.startDate) q.append('startDate', opts.startDate);
    if (opts.endDate) q.append('endDate', opts.endDate);
    if (opts.startDay) q.append('startDay', opts.startDay);
    return request(`/api/analytics/top-merchants?${q.toString()}`);
  },
  getDailySpending: (arg1, month, startDay) => {
    let opts = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      opts = arg1;
    } else {
      opts = { year: arg1, month, startDay };
    }
    const q = new URLSearchParams();
    if (opts.year) q.append('year', opts.year);
    if (opts.month) q.append('month', opts.month);
    if (opts.startDate) q.append('startDate', opts.startDate);
    if (opts.endDate) q.append('endDate', opts.endDate);
    if (opts.startDay) q.append('startDay', opts.startDay);
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

  // System Settings & Danger Zone
  getSystemSettings: () => request('/api/system/settings'),
  updateSystemSettings: (settings) => request('/api/system/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  deleteAllTransactions: () => request('/api/system/transactions', { method: 'DELETE' }),
  deleteAllData: () => request('/api/system/data', { method: 'DELETE' }),

  // Telegram Integration
  getTelegramStatus: () => request('/api/system/telegram/status'),
  testTelegramConnection: (payload) => {
    const body = typeof payload === 'object' && payload !== null ? payload : { chatId: payload };
    return request('/api/system/telegram/test', { method: 'POST', body: JSON.stringify(body) });
  },

  // TMA (Telegram Mini App) - Scoped Zero-Trust Endpoints
  getTmaTransaction: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  updateTmaTransaction: (id, data, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'PATCH',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: JSON.stringify(data),
    }),
  getTmaCategories: (token, initData = '') =>
    request(`/api/v2/transactions/tma/categories${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  getTmaSimilar: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/similar${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  getTmaSplits: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/splits${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  saveTmaSplits: (id, splits, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/splits${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'PUT',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: JSON.stringify({ splits }),
    }),
  getTmaNotes: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/notes${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  addTmaNote: (id, note, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/notes${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: JSON.stringify({ note }),
    }),
  deleteTmaNote: (id, noteId, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/notes/${noteId}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  getTmaLinks: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/links${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  linkTmaTransaction: (id, data, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/links${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: JSON.stringify(data),
    }),
  deleteTmaLink: (id, linkId, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/links/${linkId}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  updateTmaFeeClassification: (id, linkId, isFeeClassified, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/links/${linkId}/fee${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'PATCH',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: JSON.stringify({ isFeeClassified }),
    }),
  getTmaCandidates: (id, token, initData = '', minScore = 0) =>
    request(`/api/v2/transactions/tma/${id}/candidates?minScore=${minScore}${token ? `&token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  getTmaTxFxDetails: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/fx${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  getTmaLinkable: (id, search = '', token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/linkable?${search ? `search=${encodeURIComponent(search)}&` : ''}${token ? `token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  getTmaReceipts: (id, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/receipts${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),
  addTmaReceiptUrl: (id, url, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/receipts/url${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: JSON.stringify({ url }),
    }),
  uploadTmaReceiptFile: (id, file, token, initData = '') => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/api/v2/transactions/tma/${id}/receipts/upload${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
      body: formData,
    });
  },
  deleteTmaReceipt: (id, receiptId, token, initData = '') =>
    request(`/api/v2/transactions/tma/${id}/receipts/${receiptId}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'x-tma-token': token } : {}),
        ...(initData ? { 'x-telegram-init-data': initData } : {}),
      },
    }),

  // Scraper Trigger
  triggerScrape: (accountId = null, daysBack = null) =>
    request('/api/scraper/trigger', {
      method: 'POST',
      body: JSON.stringify({ accountId, ...(daysBack ? { daysBack } : {}) }),
    }),

  // Receipts & Invoices
  getReceipts: (txId) => request(`/api/transactions/${txId}/receipts`),
  uploadReceipt: (txId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/api/transactions/${txId}/receipts`, {
      method: 'POST',
      body: formData,
    });
  },
  analyzeReceiptUrl: (txId, url) =>
    request(`/api/transactions/${txId}/receipts/url`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  deleteReceipt: (receiptId) =>
    request(`/api/transactions/receipts/${receiptId}`, { method: 'DELETE' }),
  reanalyzeReceipt: (receiptId) =>
    request(`/api/transactions/receipts/${receiptId}/reanalyze`, { method: 'POST' }),
  applyReceiptSplits: (txId, splits) =>
    request(`/api/transactions/${txId}/receipts/apply-splits`, {
      method: 'POST',
      body: JSON.stringify({ splits }),
    }),
  testGeminiApiKey: (apiKey) =>
    request('/api/transactions/receipts/test-ai', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
  moveReceipt: (receiptId, targetTransactionId) =>
    request(`/api/transactions/receipts/${receiptId}/move`, {
      method: 'POST',
      body: JSON.stringify({ targetTransactionId }),
    }),
  getReceiptFileUrl: (filename) => `/api/transactions/receipts/file/${encodeURIComponent(filename)}`,
};


