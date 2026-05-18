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

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, fmtEUR } from '../api.js';
import { deferWithUndo } from '../lib/undo.js';
import { Section } from '../components/Card.jsx';
import { SkeletonTable } from '../components/Skeleton.jsx';
import { Upload, X, Trash2, ArrowRightLeft, ChevronDown, ChevronRight } from 'lucide-react';

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
  // Bulk-delete selection — Set of transaction ids.
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  // Transfer-pair suggestions (loaded lazily on demand).
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // Max-days window for pair matching — user-adjustable in the banner.
  const [maxDays, setMaxDays] = useState(7);
  // Amount tolerance in € — pairs whose values differ by ≤ this still match.
  const [amountTolerance, setAmountTolerance] = useState(0);
  // Per-pair dismissal: ids of pairs ignored in this session (kept by income tx id).
  const [ignoredPairs, setIgnoredPairs] = useState(() => new Set());

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

  async function updateCredit(id, creditId) {
    await api.updateTransaction(id, {
      credit_id: creditId ? parseInt(creditId, 10) : null,
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

  // --- selection helpers ---
  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const allVisible = rows.every((r) => prev.has(r.id));
      if (allVisible) return new Set();
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const visibleSelectedCount = rows.filter((r) => selected.has(r.id)).length;
  const allVisibleSelected = rows.length > 0 && visibleSelectedCount === rows.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  // Track ids that are "pending deletion" — optimistically hidden in the UI
  // while the 5-second undo window runs. If the user cancels, we restore
  // visibility; otherwise the actual DELETE fires when the timer expires.
  const [pendingDelete, setPendingDelete] = useState(() => new Set());

  function deleteOne(tx) {
    setPendingDelete((prev) => new Set(prev).add(tx.id));
    deferWithUndo({
      message: `Transação apagada: ${tx.description.slice(0, 40)}${tx.description.length > 40 ? '…' : ''}`,
      onConfirm: async () => {
        await api.deleteTransaction(tx.id);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(tx.id);
          return next;
        });
        load();
        loadMeta();
      },
      onUndo: () => {
        // Server was never touched — just clear the optimistic hide.
        toast.success('Anulado.');
      },
      onComplete: () => {
        setPendingDelete((prev) => {
          const next = new Set(prev);
          next.delete(tx.id);
          return next;
        });
      },
    });
  }

  async function loadSuggestions(days = maxDays, tol = amountTolerance) {
    setSuggestionsLoading(true);
    try {
      const data = await api.transferSuggestions({ max_days: days, amount_tolerance: tol });
      setSuggestions(data);
      setSuggestionsOpen(true);
      // Reset session-level dismissals so we don't hide stale info.
      setIgnoredPairs(new Set());
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function markPair(pair) {
    const ids = [pair.income.id, pair.expense.id];
    // Optimistic: hide from suggestions list immediately.
    setSuggestions((s) =>
      s ? { ...s, pairs: s.pairs.filter((p) => p.income.id !== pair.income.id) } : s
    );
    // The action is reversible (toggle is_transfer back), so we fire it
    // immediately and offer undo via toast.
    try {
      await api.bulkMarkTransfer(ids, true);
      load();
    } catch (err) {
      toast.error(`Falhou: ${err.message}`);
      return;
    }
    toast(`Par marcado como transferência`, {
      action: {
        label: 'Anular',
        onClick: async () => {
          try {
            await api.bulkMarkTransfer(ids, false);
            load();
            toast.success('Par desmarcado.');
            // We don't restore it to the suggestions list (the user
            // explicitly clicked Marcar — re-running search will surface
            // it again if it still qualifies).
          } catch (err) {
            toast.error(`Anular falhou: ${err.message}`);
          }
        },
      },
    });
  }

  function ignorePair(pair) {
    setIgnoredPairs((prev) => {
      const next = new Set(prev);
      next.add(pair.income.id);
      return next;
    });
  }

  async function markAllSuggestedPairs() {
    if (!suggestions) return;
    const visible = suggestions.pairs.filter((p) => !ignoredPairs.has(p.income.id));
    if (visible.length === 0) return;
    const ids = visible.flatMap((p) => [p.income.id, p.expense.id]);
    const prevSuggestions = suggestions;
    setSuggestions({ ...suggestions, pairs: [] });
    try {
      await api.bulkMarkTransfer(ids, true);
      load();
    } catch (err) {
      setSuggestions(prevSuggestions);
      toast.error(`Falhou: ${err.message}`);
      return;
    }
    toast(`${visible.length} pares marcados como transferências`, {
      action: {
        label: 'Anular',
        onClick: async () => {
          try {
            await api.bulkMarkTransfer(ids, false);
            load();
            toast.success('Pares restaurados.');
          } catch (err) {
            toast.error(`Anular falhou: ${err.message}`);
          }
        },
      },
    });
  }

  function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setPendingDelete((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setDeleting(true);
    deferWithUndo({
      message: `${ids.length} transaç${ids.length === 1 ? 'ão' : 'ões'} apagada${ids.length === 1 ? '' : 's'}`,
      onConfirm: async () => {
        await api.bulkDeleteTransactions(ids);
        clearSelection();
        load();
        loadMeta();
      },
      onUndo: () => {
        toast.success(`${ids.length} transações restauradas.`);
      },
      onComplete: () => {
        setDeleting(false);
        setPendingDelete((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      },
    });
  }

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

      <TransferSuggestions
        suggestions={suggestions}
        open={suggestionsOpen}
        loading={suggestionsLoading}
        ignoredPairs={ignoredPairs}
        maxDays={maxDays}
        amountTolerance={amountTolerance}
        onMaxDaysChange={(d) => { setMaxDays(d); loadSuggestions(d, amountTolerance); }}
        onToleranceChange={(t) => { setAmountTolerance(t); loadSuggestions(maxDays, t); }}
        onLoad={() => loadSuggestions(maxDays, amountTolerance)}
        onToggleOpen={() => setSuggestionsOpen((o) => !o)}
        onMark={markPair}
        onIgnore={ignorePair}
        onMarkAll={markAllSuggestedPairs}
      />

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

      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg px-4 py-2 text-sm">
          <div>
            <strong>{selected.size}</strong> selecionada{selected.size === 1 ? '' : 's'}
            {visibleSelectedCount !== selected.size && (
              <span className="text-slate-300"> ({visibleSelectedCount} visíveis nesta vista)</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={clearSelection} className="text-xs px-3 py-1 rounded hover:bg-slate-800">
              Limpar seleção
            </button>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400"
            >
              <Trash2 size={14} /> {deleting ? 'A apagar...' : 'Apagar selecionadas'}
            </button>
          </div>
        </div>
      )}

      <Section title={`${rows.length} transações`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-2 w-8">
                  <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    onChange={toggleAllVisible}
                    disabled={rows.length === 0}
                  />
                </th>
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Conta</th>
                <th className="py-2 pr-4">Descrição</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Crédito</th>
                <th className="py-2 pr-4 text-right">Valor</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="py-4"><SkeletonTable rows={8} cols={7} /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-surface-400">Sem transações.</td></tr>
              )}
              {rows.filter((tx) => !pendingDelete.has(tx.id)).map((tx) => {
                const isSelected = selected.has(tx.id);
                return (
                  <tr
                    key={tx.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${tx.is_transfer ? 'opacity-60' : ''} ${isSelected ? 'bg-brand-50/50' : ''}`}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(tx.id)}
                        className="cursor-pointer"
                        aria-label={`Selecionar transação de ${tx.date}`}
                      />
                    </td>
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
                      <select
                        value={tx.credit_id || ''}
                        onChange={(e) => updateCredit(tx.id, e.target.value)}
                        className="border border-slate-200 rounded px-2 py-1 text-xs"
                        title="Ligar este pagamento a um crédito conta-o como prestação paga"
                      >
                        <option value="">— sem crédito —</option>
                        {credits.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
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
                    <td className="py-2 pr-2">
                      <button
                        onClick={() => deleteOne(tx)}
                        title="Apagar transação"
                        className="text-slate-300 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// Top-of-page banner that surfaces likely canceling-out pairs (e.g. a payment
// fronted for someone + their reimbursement). Lazy: nothing is fetched until
// the user clicks "Procurar". Each pair can be confirmed (-> both rows get
// is_transfer=True and stop counting in the dashboard) or ignored for this
// session.
function TransferSuggestions({
  suggestions,
  open,
  loading,
  ignoredPairs,
  maxDays,
  amountTolerance,
  onMaxDaysChange,
  onToleranceChange,
  onLoad,
  onToggleOpen,
  onMark,
  onIgnore,
  onMarkAll,
}) {
  const tuningInputs = (
    <div className="flex items-center gap-3">
      <DaysInput value={maxDays} onChange={onMaxDaysChange} />
      <ToleranceInput value={amountTolerance} onChange={onToleranceChange} />
    </div>
  );

  // Initial state — never fetched: show a single discover button.
  if (!suggestions && !loading) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-900">
          <ArrowRightLeft size={16} />
          <span>
            Procurar transações que se anulam (ex: pagamento que fizeste e que alguém te reembolsou).
          </span>
        </div>
        <div className="flex items-center gap-2">
          {tuningInputs}
          <button
            onClick={onLoad}
            className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white"
          >
            Procurar pares
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
        A procurar pares...
      </div>
    );
  }

  const visible = suggestions.pairs.filter((p) => !ignoredPairs.has(p.income.id));

  if (visible.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
        <span>Sem pares por confirmar. ✓</span>
        <div className="flex items-center gap-2">
          {tuningInputs}
          <button onClick={onLoad} className="text-xs px-3 py-1 rounded border border-emerald-300 hover:bg-emerald-100">
            Procurar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
      <div className="w-full flex items-center justify-between px-4 py-3 text-sm">
        <button
          onClick={onToggleOpen}
          className="flex items-center gap-2 text-amber-900 hover:opacity-80"
        >
          <ArrowRightLeft size={16} />
          <strong>{visible.length}</strong> {visible.length === 1 ? 'par detetado' : 'pares detetados'} que podem ser transferências
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="flex items-center gap-2">
          {tuningInputs}
          <button
            onClick={onMarkAll}
            className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white"
          >
            Marcar todos
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-amber-200 p-3 space-y-2">
          {visible.map((pair) => (
            <PairCard
              key={pair.income.id}
              pair={pair}
              onMark={() => onMark(pair)}
              onIgnore={() => onIgnore(pair)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Number input + label that triggers a refetch when changed. Debounced via
// onBlur / Enter to avoid spamming the backend on every keystroke.
function DaysInput({ value, onChange }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  function commit() {
    const n = parseInt(local, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 90 && n !== value) onChange(n);
    else setLocal(value);
  }
  return (
    <label className="inline-flex items-center gap-1 text-xs text-amber-900">
      janela
      <input
        type="number"
        min="0"
        max="90"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-14 border border-amber-300 rounded px-2 py-0.5 text-xs bg-white"
        title="Dias de diferença máximos entre as duas transações de um par"
      />
      dias
    </label>
  );
}

// Currency tolerance in € — pairs whose amounts differ by less than this
// still match. 0 means "exact same value".
function ToleranceInput({ value, onChange }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  function commit() {
    const n = parseFloat(String(local).replace(',', '.'));
    if (!Number.isNaN(n) && n >= 0 && n <= 100 && Math.abs(n - value) > 1e-9) onChange(Math.round(n * 100) / 100);
    else setLocal(value);
  }
  return (
    <label className="inline-flex items-center gap-1 text-xs text-amber-900">
      tolerância
      <input
        type="number"
        min="0"
        max="100"
        step="0.5"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-16 border border-amber-300 rounded px-2 py-0.5 text-xs bg-white"
        title="Diferença máxima de valor entre as duas transações de um par. 0 = valor exato."
      />
      €
    </label>
  );
}

function PairCard({ pair, onMark, onIgnore }) {
  return (
    <div className="bg-white border border-amber-200 rounded p-3 text-xs">
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3">
        <PairLeg tx={pair.income} sign="+" />
        <ArrowRightLeft size={14} className="text-amber-600 shrink-0" />
        <PairLeg tx={pair.expense} sign="-" />
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onMark}
            className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
          >
            Marcar par
          </button>
          <button
            onClick={onIgnore}
            className="text-xs px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
          >
            Ignorar
          </button>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-slate-400">
        {pair.days_apart === 0 ? 'mesmo dia' : `${pair.days_apart} dia${pair.days_apart === 1 ? '' : 's'} de diferença`}
        {' · '}
        {fmtEUR(pair.amount)}
        {pair.amount_delta > 0 && (
          <span className="text-amber-700"> · ∆ {fmtEUR(pair.amount_delta)}</span>
        )}
      </div>
    </div>
  );
}

function PairLeg({ tx, sign }) {
  const color = sign === '+' ? 'text-emerald-700' : 'text-rose-700';
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className={`font-semibold ${color}`}>{sign}{fmtEUR(tx.amount)}</span>
        <span className="text-slate-500">{tx.date}</span>
      </div>
      <div className="text-slate-700 truncate" title={tx.description}>{tx.description}</div>
      <div className="text-slate-400 truncate">{tx.account_name || '—'}</div>
    </div>
  );
}

// HTML's checkbox `indeterminate` is a DOM property, not an attribute — React
// can't set it through JSX. This thin wrapper applies it via a ref every render.
function SelectAllCheckbox({ checked, indeterminate, onChange, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="cursor-pointer"
      aria-label="Selecionar todas as transações visíveis"
    />
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
