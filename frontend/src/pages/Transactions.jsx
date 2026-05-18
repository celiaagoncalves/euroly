// Transações page — the searchable / filterable / editable ledger.
//
// Filters are mirrored into the URL via useSearchParams, so links like
// /transactions?account_id=3 from the Contas page deep-link straight into
// a pre-filtered view. Inline edits (category picker, transfer toggle)
// PATCH the backend and refetch; we don't try to be clever with optimistic
// updates because the list is small and reads are cheap.
//
// Upload UX: user picks a file → modal asks which account this file
// belongs to → confirm → POST multipart. The backend rejects the import
// if the account doesn't exist, but we also block client-side and surface
// a clearer message.

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, fmtEUR } from '../api.js';
import { Section } from '../components/Card.jsx';
import { Upload, X } from 'lucide-react';

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [credits, setCredits] = useState([]);

  const [filters, setFilters] = useState(() => ({
    month: searchParams.get('month') || '',
    year: searchParams.get('year') || '',
    account_id: searchParams.get('account_id') || '',
    category_id: searchParams.get('category_id') || '',
    credit_id: searchParams.get('credit_id') || '',
    type: searchParams.get('type') || '',
    validated: searchParams.get('validated') || '',
    search: searchParams.get('search') || '',
  }));

  const [importStatus, setImportStatus] = useState(null);
  const [importDialog, setImportDialog] = useState(null); // {file, account_id}
  const [loading, setLoading] = useState(false);

  async function loadMeta() {
    const [cats, accs, crs] = await Promise.all([
      api.listCategories(),
      api.listAccounts(),
      api.listCredits(),
    ]);
    setCategories(cats);
    setAccounts(accs);
    setCredits(crs);
  }

  async function load() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      setRows(await api.listTransactions(params));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMeta(); }, []);
  // Re-fetch whenever filters change AND mirror them into the URL.
  // `replace: true` so back/forward navigation isn't polluted by every
  // keystroke in the search input. JSON.stringify dedupes on value, not
  // identity, so unchanged objects don't trigger refetches.
  useEffect(() => {
    load();
    const next = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (accounts.length === 0) {
      setImportStatus({ state: 'error', error: 'Cria primeiro uma conta em Backoffice → Contas.' });
      return;
    }
    setImportDialog({ file, account_id: accounts[0].id });
  }

  async function confirmImport() {
    if (!importDialog) return;
    setImportStatus({ state: 'loading' });
    try {
      const result = await api.importTransactions(importDialog.file, importDialog.account_id);
      setImportStatus({ state: 'done', result });
      setImportDialog(null);
      load();
      loadMeta();
    } catch (err) {
      setImportStatus({ state: 'error', error: err.message });
    }
  }

  async function updateCategory(id, categoryId) {
    await api.updateTransaction(id, {
      category_id: categoryId ? parseInt(categoryId, 10) : null,
      is_validated: !!categoryId,
    });
    load();
  }

  async function toggleTransfer(tx) {
    await api.updateTransaction(tx.id, { is_transfer: !tx.is_transfer });
    load();
  }

  function clearFilters() {
    setFilters({ month: '', year: '', account_id: '', category_id: '', credit_id: '', type: '', validated: '', search: '' });
  }

  const hasFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Transações</h1>
          <p className="text-sm text-slate-500">Pesquise, filtre e edite movimentos.</p>
        </div>
        <label className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer">
          <Upload size={16} />
          Importar Excel / CSV
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onPickFile} />
        </label>
      </header>

      {importDialog && (
        <ImportDialog
          file={importDialog.file}
          accounts={accounts}
          accountId={importDialog.account_id}
          onChangeAccount={(id) => setImportDialog((d) => ({ ...d, account_id: id }))}
          onConfirm={confirmImport}
          onCancel={() => setImportDialog(null)}
          loading={importStatus?.state === 'loading'}
        />
      )}

      {importStatus?.state === 'done' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-sm">
          Importadas {importStatus.result.new} novas transações, {importStatus.result.skipped} ignoradas (duplicadas).
        </div>
      )}
      {importStatus?.state === 'error' && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">
          Erro: {importStatus.error}
        </div>
      )}

      <Section
        title="Filtros"
        action={
          hasFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
              <X size={12} /> limpar
            </button>
          )
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
          <input placeholder="Pesquisar..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 col-span-2" />
          <select value={filters.account_id} onChange={(e) => setFilters((f) => ({ ...f, account_id: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2">
            <option value="">Conta (todas)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filters.credit_id} onChange={(e) => setFilters((f) => ({ ...f, credit_id: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2">
            <option value="">Crédito (todos)</option>
            {credits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" placeholder="Mês" min="1" max="12" value={filters.month} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2" />
          <input type="number" placeholder="Ano" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2" />
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2">
            <option value="">Tipo (todos)</option>
            <option value="income">Rendimento</option>
            <option value="expense">Despesa</option>
          </select>
          <select value={filters.validated} onChange={(e) => setFilters((f) => ({ ...f, validated: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2">
            <option value="">Estado</option>
            <option value="true">Validadas</option>
            <option value="false">Pendentes</option>
          </select>
        </div>
      </Section>

      <Section title={`${rows.length} transações`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Conta</th>
                <th className="py-2 pr-4">Descrição</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Crédito</th>
                <th className="py-2 pr-4 text-right">Valor</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-6 text-center text-slate-400">A carregar...</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">Sem transações.</td></tr>
              )}
              {rows.map((tx) => (
                <tr key={tx.id} className={`border-b border-slate-100 hover:bg-slate-50 ${tx.is_transfer ? 'opacity-60' : ''}`}>
                  <td className="py-2 pr-4 whitespace-nowrap">{tx.date}</td>
                  <td className="py-2 pr-4 text-slate-500">{tx.account_name || '—'}</td>
                  <td className="py-2 pr-4">{tx.description}</td>
                  <td className="py-2 pr-4">
                    <select value={tx.category_id || ''} onChange={(e) => updateCategory(tx.id, e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs">
                      <option value="">— sem categoria —</option>
                      {categories.filter((c) => c.type === tx.type).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    {tx.credit_name ? (
                      <Link to={`/credits`} className="text-xs text-violet-700 hover:underline">{tx.credit_name}</Link>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className={`py-2 pr-4 text-right font-medium ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmtEUR(tx.amount)}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      {tx.is_validated ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">validada</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">pendente</span>
                      )}
                      <button
                        onClick={() => toggleTransfer(tx)}
                        title="Marcar como transferência entre contas (excluída dos totais)"
                        className={`text-xs px-2 py-0.5 rounded-full border ${tx.is_transfer ? 'bg-slate-200 border-slate-300 text-slate-700' : 'border-slate-200 text-slate-400 hover:text-slate-700'}`}
                      >
                        ↔
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function ImportDialog({ file, accounts, accountId, onChangeAccount, onConfirm, onCancel, loading }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-base font-semibold text-slate-900">Importar para qual conta?</div>
          <div className="text-xs text-slate-500 mt-1">{file.name}</div>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>
      <div className="flex gap-2">
        <select value={accountId} onChange={(e) => onChangeAccount(parseInt(e.target.value, 10))} className="border border-slate-200 rounded px-3 py-2 text-sm flex-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>
          ))}
        </select>
        <button onClick={onConfirm} disabled={loading} className="bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-sm font-medium px-4 py-2 rounded">
          {loading ? 'A importar...' : 'Importar'}
        </button>
      </div>
    </div>
  );
}
