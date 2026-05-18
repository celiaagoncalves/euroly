// Backoffice — administration for every user-owned entity in the app.
//
// Four tabs share the same layout: a "create / edit" form at the top and
// a list of existing rows below. Each tab is its own self-contained
// component (AccountsPanel, CreditsPanel, CategoriesPanel, RulesPanel)
// with its own fetch / form state — there's no shared state across tabs,
// so changes in one tab don't auto-refresh another (refresh the page or
// switch tabs to re-fetch). This is fine for a single-user local app.
//
// Privacy note: Accounts and Credits are the entities that contain
// personal info (specific banks, creditors). They're never seeded; the
// user populates them here on first launch.

import { useEffect, useState } from 'react';
import { api, fmtEUR } from '../api.js';
import { Section } from '../components/Card.jsx';
import { Trash2, Plus, Pencil } from 'lucide-react';

const TABS = [
  ['accounts', 'Contas'],
  ['credits', 'Créditos'],
  ['categories', 'Categorias'],
  ['rules', 'Regras'],
];

export default function Backoffice() {
  const [tab, setTab] = useState('accounts');
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Backoffice</h1>
        <p className="text-sm text-slate-500">
          Gestão de contas, créditos, categorias e regras. Estes dados ficam apenas na DB local.
        </p>
      </header>
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'accounts' && <AccountsPanel />}
      {tab === 'credits' && <CreditsPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'rules' && <RulesPanel />}
    </div>
  );
}

function AccountsPanel() {
  const [items, setItems] = useState([]);
  const empty = { name: '', kind: 'checking', currency: 'EUR', color: '#0ea5e9', icon: 'wallet', initial_balance: 0, is_active: true, notes: '' };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    setItems(await api.listAccounts());
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name) return;
    const payload = { ...form, initial_balance: parseFloat(form.initial_balance) || 0, notes: form.notes || null };
    if (editingId) await api.updateAccount(editingId, payload);
    else await api.createAccount(payload);
    setForm(empty);
    setEditingId(null);
    load();
  }

  function edit(a) {
    setEditingId(a.id);
    setForm({
      name: a.name, kind: a.kind, currency: a.currency, color: a.color, icon: a.icon,
      initial_balance: a.initial_balance, is_active: a.is_active, notes: a.notes || '',
    });
  }

  async function remove(id) {
    if (!confirm('Apagar conta? Transações ficam sem conta atribuída.')) return;
    await api.deleteAccount(id);
    load();
  }

  return (
    <div className="space-y-4">
      <Section title={editingId ? 'Editar conta' : 'Nova conta'}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
          <input placeholder="Nome (ex: Conta Principal)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="border border-slate-200 rounded px-2 py-1">
            <option value="checking">À ordem</option>
            <option value="savings">Poupança</option>
            <option value="card">Cartão</option>
            <option value="wallet">E-money</option>
          </select>
          <input type="number" step="0.01" placeholder="Saldo inicial" value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} className="border border-slate-200 rounded px-2 py-1" />
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="border border-slate-200 rounded w-full h-8" />
          <div className="flex gap-2 items-center">
            <label className="text-xs flex items-center gap-1 text-slate-600">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              ativa
            </label>
          </div>
          <input placeholder="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-4" />
          <div className="col-span-2 flex gap-2 justify-end">
            {editingId && (
              <button onClick={() => { setEditingId(null); setForm(empty); }} className="text-sm px-3 py-1 border border-slate-300 rounded hover:bg-slate-50">
                Cancelar
              </button>
            )}
            <button onClick={save} className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1 rounded inline-flex items-center gap-1">
              <Plus size={14} /> {editingId ? 'Guardar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </Section>

      <Section title={`${items.length} contas`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4"></th>
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4 text-right">Saldo inicial</th>
              <th className="py-2 pr-4 text-right">Saldo atual</th>
              <th className="py-2 pr-4">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">
                  <span className="inline-block w-4 h-4 rounded" style={{ background: a.color }} />
                </td>
                <td className="py-2 pr-4">{a.name}</td>
                <td className="py-2 pr-4 capitalize">{a.kind}</td>
                <td className="py-2 pr-4 text-right">{fmtEUR(a.initial_balance)}</td>
                <td className={`py-2 pr-4 text-right font-medium ${a.current_balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtEUR(a.current_balance)}</td>
                <td className="py-2 pr-4">
                  {a.is_active ? <span className="text-xs text-emerald-700">ativa</span> : <span className="text-xs text-slate-500">inativa</span>}
                </td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  <button onClick={() => edit(a)} className="text-slate-500 hover:text-slate-800 mr-2"><Pencil size={16} /></button>
                  <button onClick={() => remove(a.id)} className="text-rose-500 hover:text-rose-700"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400 text-sm">Sem contas — adiciona a primeira acima.</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function CreditsPanel() {
  const [items, setItems] = useState([]);
  const empty = { name: '', creditor: '', total_amount: '', monthly_payment: '', total_installments: '', interest_rate: '', start_date: '', end_date: '', is_active: true, color: '#a855f7', notes: '' };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    setItems(await api.listCredits());
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name || !form.creditor) return;
    const payload = {
      name: form.name,
      creditor: form.creditor,
      total_amount: parseFloat(form.total_amount),
      monthly_payment: parseFloat(form.monthly_payment),
      total_installments: parseInt(form.total_installments, 10),
      interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      color: form.color,
      notes: form.notes || null,
    };
    if (editingId) await api.updateCredit(editingId, payload);
    else await api.createCredit(payload);
    setForm(empty);
    setEditingId(null);
    load();
  }

  function edit(c) {
    setEditingId(c.id);
    setForm({
      name: c.name, creditor: c.creditor,
      total_amount: c.total_amount, monthly_payment: c.monthly_payment, total_installments: c.total_installments,
      interest_rate: c.interest_rate ?? '', start_date: c.start_date || '', end_date: c.end_date || '',
      is_active: c.is_active, color: c.color, notes: c.notes || '',
    });
  }

  async function remove(id) {
    if (!confirm('Apagar crédito? Pagamentos associados ficam sem link.')) return;
    await api.deleteCredit(id);
    load();
  }

  return (
    <div className="space-y-4">
      <Section title={editingId ? 'Editar crédito' : 'Novo crédito'}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
          <input placeholder="Nome do crédito (ex: Sofá)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <input placeholder="Credor (ex: Cofidis)" value={form.creditor} onChange={(e) => setForm({ ...form, creditor: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="border border-slate-200 rounded w-full h-8" />
          <label className="text-xs flex items-center gap-1 text-slate-600">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            ativo
          </label>

          <input type="number" step="0.01" placeholder="Total a pagar (€)" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <input type="number" step="0.01" placeholder="Prestação mensal (€)" value={form.monthly_payment} onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <input type="number" placeholder="Nº prestações" value={form.total_installments} onChange={(e) => setForm({ ...form, total_installments: e.target.value })} className="border border-slate-200 rounded px-2 py-1" />
          <input type="number" step="0.01" placeholder="TAEG % (opc)" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} className="border border-slate-200 rounded px-2 py-1" />

          <input type="date" placeholder="Início" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <input type="date" placeholder="Fim previsto" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <input placeholder="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />

          <div className="col-span-6 flex gap-2 justify-end">
            {editingId && (
              <button onClick={() => { setEditingId(null); setForm(empty); }} className="text-sm px-3 py-1 border border-slate-300 rounded hover:bg-slate-50">
                Cancelar
              </button>
            )}
            <button onClick={save} className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1 rounded inline-flex items-center gap-1">
              <Plus size={14} /> {editingId ? 'Guardar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </Section>

      <Section title={`${items.length} créditos`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4"></th>
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Credor</th>
              <th className="py-2 pr-4 text-right">Mensal</th>
              <th className="py-2 pr-4 text-right">Total</th>
              <th className="py-2 pr-4 text-right">Pago</th>
              <th className="py-2 pr-4">Progresso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-2 pr-4"><span className="inline-block w-4 h-4 rounded" style={{ background: c.color }} /></td>
                <td className="py-2 pr-4">{c.name}</td>
                <td className="py-2 pr-4">{c.creditor}</td>
                <td className="py-2 pr-4 text-right">{fmtEUR(c.monthly_payment)}</td>
                <td className="py-2 pr-4 text-right">{fmtEUR(c.total_amount)}</td>
                <td className="py-2 pr-4 text-right">{fmtEUR(c.amount_paid)}</td>
                <td className="py-2 pr-4">{c.installments_paid}/{c.total_installments} ({(c.progress_pct || 0).toFixed(0)}%)</td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  <button onClick={() => edit(c)} className="text-slate-500 hover:text-slate-800 mr-2"><Pencil size={16} /></button>
                  <button onClick={() => remove(c.id)} className="text-rose-500 hover:text-rose-700"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-400 text-sm">Sem créditos.</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function CategoriesPanel() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'expense', color: '#64748b', icon: 'circle' });

  async function load() {
    setItems(await api.listCategories());
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name) return;
    await api.createCategory(form);
    setForm({ name: '', type: 'expense', color: '#64748b', icon: 'circle' });
    load();
  }

  async function remove(id) {
    if (!confirm('Apagar categoria? Transações associadas voltam a pendente.')) return;
    await api.deleteCategory(id);
    load();
  }

  return (
    <Section
      title="Categorias"
      action={
        <div className="flex gap-2">
          <input
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1 text-sm"
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1 text-sm"
          >
            <option value="expense">Despesa</option>
            <option value="income">Rendimento</option>
          </select>
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="border border-slate-200 rounded w-10 h-8"
          />
          <button onClick={create} className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1 rounded inline-flex items-center gap-1">
            <Plus size={14} /> Adicionar
          </button>
        </div>
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-4">Cor</th>
            <th className="py-2 pr-4">Nome</th>
            <th className="py-2 pr-4">Tipo</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                <span className="inline-block w-4 h-4 rounded" style={{ background: c.color }} />
              </td>
              <td className="py-2 pr-4">{c.name}</td>
              <td className="py-2 pr-4 capitalize">{c.type}</td>
              <td className="py-2 pr-4 text-right">
                <button onClick={() => remove(c.id)} className="text-rose-500 hover:text-rose-700">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function RulesPanel() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [credits, setCredits] = useState([]);
  const [form, setForm] = useState({ keyword: '', match_type: 'contains', category_id: '', credit_id: '', priority: 100 });
  const [preview, setPreview] = useState(null);

  async function load() {
    const [r, c, cr] = await Promise.all([api.listRules(), api.listCategories(), api.listCredits()]);
    setRules(r);
    setCategories(c);
    setCredits(cr);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.keyword || !form.category_id) return;
    await api.createRule({
      keyword: form.keyword,
      match_type: form.match_type,
      category_id: parseInt(form.category_id, 10),
      credit_id: form.credit_id ? parseInt(form.credit_id, 10) : null,
      priority: form.priority,
    });
    setForm({ keyword: '', match_type: 'contains', category_id: '', credit_id: '', priority: 100 });
    load();
  }

  async function remove(id) {
    if (!confirm('Apagar regra?')) return;
    await api.deleteRule(id);
    load();
  }

  async function doPreview() {
    if (!form.keyword) return;
    setPreview(await api.previewRule({ keyword: form.keyword, match_type: form.match_type }));
  }

  return (
    <div className="space-y-4">
      <Section title="Nova regra">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
          <input placeholder="Palavra-chave (ex: COFIDIS)" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} className="border border-slate-200 rounded px-2 py-1 col-span-2" />
          <select value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value })} className="border border-slate-200 rounded px-2 py-1">
            <option value="contains">contém</option>
            <option value="exact">exato</option>
            <option value="startswith">começa com</option>
            <option value="regex">regex</option>
          </select>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="border border-slate-200 rounded px-2 py-1">
            <option value="">Categoria *</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={form.credit_id} onChange={(e) => setForm({ ...form, credit_id: e.target.value })} className="border border-slate-200 rounded px-2 py-1">
            <option value="">Crédito (opcional)</option>
            {credits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" placeholder="Prioridade" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value || '0', 10) })} className="border border-slate-200 rounded px-2 py-1" />
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={doPreview} className="text-sm px-3 py-1 border border-slate-300 rounded hover:bg-slate-50">
            Pré-visualizar
          </button>
          <button onClick={create} className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1 rounded">
            Criar regra
          </button>
        </div>
        {preview && (
          <div className="mt-3 text-sm text-slate-600">
            Esta regra corresponderia a <strong>{preview.count}</strong> transações.
          </div>
        )}
      </Section>

      <Section title={`${rules.length} regras`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Prio</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4">Palavra-chave</th>
              <th className="py-2 pr-4">Categoria</th>
              <th className="py-2 pr-4">Crédito</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.priority}</td>
                <td className="py-2 pr-4">{r.match_type}</td>
                <td className="py-2 pr-4 font-mono text-xs">{r.keyword}</td>
                <td className="py-2 pr-4">{r.category_name}</td>
                <td className="py-2 pr-4 text-slate-500">{r.credit_name || '—'}</td>
                <td className="py-2 pr-4 text-right">
                  <button onClick={() => remove(r.id)} className="text-rose-500 hover:text-rose-700">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
