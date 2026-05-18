// Validação page — the queue of uncategorized transactions.
//
// Anything the auto-categorizer didn't match ends up here. The user picks
// a category per row (and optionally checks "Guardar regra" to auto-create
// a `contains` rule from the first three words of the description, so the
// same payee categorizes itself on the next import). "Validar selecionadas"
// applies every pending choice in one go.
//
// Selections are tracked in local state keyed by transaction id; only when
// the user clicks Validar does anything hit the backend.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Section } from '../components/Card.jsx';

function fmtEUR(n) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

export default function Validation() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selections, setSelections] = useState({}); // {id: {category_id, save_as_rule}}

  async function load() {
    const [pending, cats] = await Promise.all([api.listPending(), api.listCategories()]);
    setRows(pending);
    setCategories(cats);
  }

  useEffect(() => { load(); }, []);

  function setSel(id, patch) {
    setSelections((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function applyOne(tx) {
    const sel = selections[tx.id];
    if (!sel?.category_id) return;
    await api.updateTransaction(tx.id, {
      category_id: parseInt(sel.category_id, 10),
      is_validated: true,
    });
    if (sel.save_as_rule) {
      // Heuristic: take the first three whitespace-separated tokens of
      // the description as the keyword. Bank descriptions like
      // "EDP COMERCIAL FACTURA 1234" become rules on "EDP COMERCIAL
      // FACTURA" — usually specific enough. The user can refine it
      // later in Backoffice → Regras.
      const keyword = tx.description.split(' ').slice(0, 3).join(' ');
      await api.createRule({
        keyword,
        match_type: 'contains',
        category_id: parseInt(sel.category_id, 10),
        priority: 100,
      });
    }
    load();
  }

  async function applyAll() {
    const entries = Object.entries(selections).filter(([, v]) => v?.category_id);
    for (const [id, sel] of entries) {
      const tx = rows.find((r) => r.id === parseInt(id, 10));
      if (!tx) continue;
      await api.updateTransaction(tx.id, {
        category_id: parseInt(sel.category_id, 10),
        is_validated: true,
      });
      if (sel.save_as_rule) {
        const keyword = tx.description.split(' ').slice(0, 3).join(' ');
        await api.createRule({
          keyword,
          match_type: 'contains',
          category_id: parseInt(sel.category_id, 10),
          priority: 100,
        });
      }
    }
    setSelections({});
    load();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Validação</h1>
          <p className="text-sm text-slate-500">Transações pendentes de categorização.</p>
        </div>
        <button
          onClick={applyAll}
          disabled={Object.keys(selections).length === 0}
          className="bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          Validar selecionadas
        </button>
      </header>

      <Section title={`${rows.length} transações pendentes`}>
        {rows.length === 0 ? (
          <div className="text-center text-slate-400 py-10 text-sm">Tudo categorizado. ✓</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Descrição</th>
                  <th className="py-2 pr-4 text-right">Valor</th>
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 pr-4">Regra</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => {
                  const sel = selections[tx.id] || {};
                  return (
                    <tr key={tx.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 whitespace-nowrap">{tx.date}</td>
                      <td className="py-2 pr-4">{tx.description}</td>
                      <td className={`py-2 pr-4 text-right font-medium ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.type === 'income' ? '+' : '-'}{fmtEUR(tx.amount)}
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={sel.category_id || ''}
                          onChange={(e) => setSel(tx.id, { category_id: e.target.value })}
                          className="border border-slate-200 rounded px-2 py-1 text-xs"
                        >
                          <option value="">— escolher —</option>
                          {categories
                            .filter((c) => c.type === tx.type)
                            .map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={!!sel.save_as_rule}
                            onChange={(e) => setSel(tx.id, { save_as_rule: e.target.checked })}
                          />
                          Guardar regra
                        </label>
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => applyOne(tx)}
                          disabled={!sel.category_id}
                          className="text-xs px-3 py-1 rounded bg-slate-900 text-white disabled:bg-slate-300"
                        >
                          Validar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
