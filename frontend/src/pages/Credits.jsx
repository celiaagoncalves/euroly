// Créditos page — track loans and credit lines with payment progress.
//
// /api/credits returns every credit with its progress fields computed
// (amount_paid, installments_paid, progress_pct, last_payment_date), so
// the list renders in one fetch. Clicking a row expands it and lazily
// pulls the linked transactions via /api/credits/{id}/transactions —
// we cache them in `details` so reopening is instant.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtEUR } from '../api.js';
import { Card, Section } from '../components/Card.jsx';
import { Skeleton, SkeletonCard } from '../components/Skeleton.jsx';
import { CreditCard, ArrowRight, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

export default function Credits() {
  const [credits, setCredits] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({}); // {credit_id: [transactions]}
  const [error, setError] = useState(null);

  async function load() {
    try {
      setCredits(await api.listCredits());
    } catch (e) {
      setCredits([]);
      setError(e.message);
    }
  }

  const loading = credits === null;
  useEffect(() => {
    load();
  }, []);

  async function toggle(id) {
    // Click on the already-expanded row -> collapse.
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    // Lazy-load + cache the credit's transactions on first expansion.
    if (!details[id]) {
      const tx = await api.creditTransactions(id);
      setDetails((d) => ({ ...d, [id]: tx }));
    }
  }

  const totals = (credits || []).reduce(
    (acc, c) => ({
      total: acc.total + c.total_amount,
      paid: acc.paid + c.amount_paid,
      remaining: acc.remaining + c.amount_remaining,
      monthly: acc.monthly + (c.is_active ? c.monthly_payment : 0),
    }),
    { total: 0, paid: 0, remaining: 0, monthly: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Créditos</h1>
          <p className="text-sm text-slate-500">Acompanhamento de empréstimos e linhas de crédito.</p>
        </div>
        <Link
          to="/backoffice"
          className="text-sm text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
        >
          Gerir créditos <ArrowRight size={14} />
        </Link>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <Card title="Total contraído" value={fmtEUR(totals.total)} accent="slate" />
            <Card title="Já pago" value={fmtEUR(totals.paid)} accent="green" />
            <Card title="Em falta" value={fmtEUR(totals.remaining)} accent="red" />
            <Card title="Prestação mensal" value={fmtEUR(totals.monthly)} accent="blue" hint="soma dos créditos ativos" />
          </>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="bg-surface-0 border border-surface-200 rounded-xl p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : credits.length === 0 ? (
        <Section title="Sem créditos">
          <div className="text-sm text-slate-500 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 mt-0.5" />
            <div>
              Sem créditos configurados. Vai a <Link to="/backoffice" className="text-brand-700 underline">Backoffice → Créditos</Link> e cria os teus.
              Para que cada pagamento conte automaticamente, cria também uma regra que faça match no descritivo do banco e aponte para o crédito.
            </div>
          </div>
        </Section>
      ) : (
        <div className="space-y-3">
          {credits.map((c) => (
            <CreditRow
              key={c.id}
              credit={c}
              expanded={expanded === c.id}
              onToggle={() => toggle(c.id)}
              transactions={details[c.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreditRow({ credit, expanded, onToggle, transactions }) {
  const pct = credit.progress_pct || 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-4 hover:bg-slate-50 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ background: credit.color }}
        >
          <CreditCard size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-slate-900 truncate">{credit.name}</div>
            {!credit.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">terminado</span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {credit.creditor} · {credit.installments_paid}/{credit.total_installments} prestações · {fmtEUR(credit.monthly_payment)}/mês
          </div>
          <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: credit.color }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{pct.toFixed(1)}% pago</span>
            <span>
              <strong className="text-slate-700">{fmtEUR(credit.amount_paid)}</strong> de {fmtEUR(credit.total_amount)} · falta {fmtEUR(credit.amount_remaining)}
            </span>
          </div>
        </div>
        <div className="text-slate-400 shrink-0">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
            <Field label="Início" value={credit.start_date || '—'} />
            <Field label="Fim previsto" value={credit.end_date || '—'} />
            <Field label="Juro (anual)" value={credit.interest_rate != null ? `${credit.interest_rate}%` : '—'} />
            <Field label="Último pagamento" value={credit.last_payment_date || '—'} />
          </div>
          {credit.notes && (
            <div className="text-xs text-slate-600 italic mb-3">{credit.notes}</div>
          )}
          <div className="text-xs font-medium text-slate-500 mb-2">Pagamentos ({transactions?.length ?? 0})</div>
          {!transactions ? (
            <div className="text-xs text-slate-400">A carregar...</div>
          ) : transactions.length === 0 ? (
            <div className="text-xs text-slate-400">
              Sem pagamentos detetados. Cria uma regra no Backoffice que faça match no descritivo bancário e aponte para este crédito.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="text-left">
                  <th className="py-1 pr-4">Data</th>
                  <th className="py-1 pr-4">Descrição</th>
                  <th className="py-1 pr-4">Conta</th>
                  <th className="py-1 pr-4 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="py-1 pr-4">{t.date}</td>
                    <td className="py-1 pr-4">{t.description}</td>
                    <td className="py-1 pr-4 text-slate-500">{t.account_name || '—'}</td>
                    <td className="py-1 pr-4 text-right font-medium">{fmtEUR(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="text-slate-700 font-medium">{value}</div>
    </div>
  );
}
