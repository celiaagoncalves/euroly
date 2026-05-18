// Thin fetch wrapper around the FastAPI backend.
//
// All paths are relative to /api — Vite's dev server proxies that prefix
// to http://localhost:8000 (see vite.config.js), so this works without
// CORS in development. In production the backend would serve the built
// frontend from the same origin, so the same paths keep working.
//
// Errors are surfaced as thrown Error instances with the server's
// response body as the message, which the pages display directly.

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  // 204 No Content has no body to parse — return null so callers can
  // still `await` the request without a JSON-parse error.
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // dashboard
  summary: (params) => request(`/dashboard/summary${qs(params)}`),
  byMonth: (params) => request(`/dashboard/by-month${qs(params)}`),
  byCategory: (params) => request(`/dashboard/by-category${qs(params)}`),
  savingsEvolution: (params) => request(`/dashboard/savings-evolution${qs(params)}`),

  // transactions
  listTransactions: (params) => request(`/transactions${qs(params)}`),
  listPending: () => request('/transactions/pending'),
  updateTransaction: (id, body) =>
    request(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  bulkDeleteTransactions: (ids) =>
    request('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  transferSuggestions: (params) =>
    request(`/transactions/transfer-suggestions${qs(params)}`),
  bulkMarkTransfer: (ids, isTransfer = true) =>
    request('/transactions/bulk-mark-transfer', {
      method: 'POST',
      body: JSON.stringify({ ids, is_transfer: isTransfer }),
    }),
  // Multipart upload — bypasses the JSON `request` helper because we need
  // FormData and no Content-Type header (the browser sets the boundary).
  importTransactions: async (file, accountId) => {
    const form = new FormData();
    form.append('file', file);
    form.append('account_id', String(accountId));
    const res = await fetch(`${BASE}/transactions/import`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // accounts
  listAccounts: (params) => request(`/accounts${qs(params)}`),
  createAccount: (body) => request('/accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateAccount: (id, body) =>
    request(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),

  // credits
  listCredits: (params) => request(`/credits${qs(params)}`),
  getCredit: (id) => request(`/credits/${id}`),
  creditTransactions: (id) => request(`/credits/${id}/transactions`),
  createCredit: (body) => request('/credits', { method: 'POST', body: JSON.stringify(body) }),
  updateCredit: (id, body) =>
    request(`/credits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCredit: (id) => request(`/credits/${id}`, { method: 'DELETE' }),

  // categories
  listCategories: (params) => request(`/categories${qs(params)}`),
  createCategory: (body) =>
    request('/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id, body) =>
    request(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  // rules
  listRules: () => request('/rules'),
  createRule: (body) => request('/rules', { method: 'POST', body: JSON.stringify(body) }),
  updateRule: (id, body) =>
    request(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRule: (id) => request(`/rules/${id}`, { method: 'DELETE' }),
  previewRule: (body) =>
    request('/rules/preview', { method: 'POST', body: JSON.stringify(body) }),
  exportRules: () => request('/rules/export'),
  applyAllRules: () => request('/rules/apply', { method: 'POST' }),
};

// Single source of truth for currency formatting across the UI — always
// pt-PT / EUR. If you ever need multi-currency support, this is where to
// branch on account.currency.
export function fmtEUR(n) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

// Build a `?a=1&b=2` string from a plain object, skipping empty values so
// the backend doesn't have to handle `?month=` as "month is unset".
function qs(params) {
  if (!params) return '';
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') usp.append(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
}
