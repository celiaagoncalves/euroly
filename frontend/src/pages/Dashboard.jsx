// Dashboard — the main financial overview page.
//
// Four parallel API calls drive everything: monthly summary KPIs, the
// per-month bar chart (year-wide), the per-category pie (current month),
// and the cumulative-savings line. An account dropdown narrows every
// query to a single account, otherwise everything aggregates across all
// accounts (the "vista geral"). is_transfer rows are always excluded on
// the backend so internal moves don't double-count.

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api, fmtEUR } from '../api.js';
import { Card, Section } from '../components/Card.jsx';
import { Skeleton, SkeletonCard } from '../components/Skeleton.jsx';

const months = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export default function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [byMonth, setByMonth] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [savings, setSavings] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    // The `cancelled` flag prevents a late-arriving response from a stale
    // request (e.g. user switched account before the previous fetch
    // resolved) from overwriting the current state.
    let cancelled = false;
    async function load() {
      try {
        const acc = accountId ? { account_id: accountId } : {};
        const [s, m, c, e] = await Promise.all([
          api.summary({ month, year, ...acc }),
          api.byMonth({ year, ...acc }),
          api.byCategory({ month, year, type: 'expense', ...acc }),
          api.savingsEvolution(acc),
        ]);
        if (cancelled) return;
        setSummary(s);
        setByMonth(m);
        setByCategory(c);
        setSavings(e);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [month, year, accountId]);

  const yearOptions = useMemo(() => {
    const set = new Set([year, now.getFullYear()]);
    byMonth.forEach((b) => set.add(parseInt(b.period.slice(0, 4), 10)));
    return Array.from(set).sort((a, b) => b - a);
  }, [byMonth, year]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {accountId ? `Vista da conta selecionada` : 'Vista geral (todas as contas)'} · transferências internas excluídas
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {summary === null ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <Card title="Rendimento" value={fmtEUR(summary.total_income)} accent="green" />
            <Card title="Despesas" value={fmtEUR(summary.total_expenses)} accent="red" />
            <Card title="Poupança" value={fmtEUR(summary.savings)} accent="blue" />
            <Card
              title="Taxa de Poupança"
              value={`${(summary.savings_rate ?? 0).toFixed(1)}%`}
              accent="slate"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Rendimento vs Despesas (ano)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tickFormatter={(p) => p.slice(5)} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => fmtEUR(v)} />
                <Legend />
                <Bar dataKey="income" name="Rendimento" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Despesas por Categoria">
          <div className="h-72">
            {byCategory.length === 0 ? (
              <EmptyState message="Sem despesas para o período selecionado." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="total"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {byCategory.map((c, i) => (
                      <Cell key={i} fill={c.color || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtEUR(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>
      </div>

      <Section title="Evolução da Poupança">
        <div className="h-72">
          {savings.length === 0 ? (
            <EmptyState message="Importe transações para ver a evolução." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={savings}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => fmtEUR(v)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cumulative_savings"
                  name="Poupança acumulada"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="savings"
                  name="Poupança mensal"
                  stroke="#22a16a"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-400">
      {message}
    </div>
  );
}
