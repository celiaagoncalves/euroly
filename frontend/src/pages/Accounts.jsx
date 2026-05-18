// Contas page — per-account balance cards and aggregate totals.
//
// Balances come from /api/accounts: each row already includes
// `current_balance` and `transaction_count` so this page is a single
// fetch. Empty state nudges the user toward Backoffice → Contas, since
// nothing else in the app works until at least one account exists.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtEUR } from '../api.js';
import { Card, Section } from '../components/Card.jsx';
import { Wallet, ArrowRight, AlertCircle } from 'lucide-react';

const kindLabel = {
  checking: 'Conta à ordem',
  savings: 'Poupança',
  card: 'Cartão',
  wallet: 'Carteira / E-money',
};

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, []);

  const totals = useMemo(() => {
    const active = accounts.filter((a) => a.is_active);
    const total = active.reduce((s, a) => s + a.current_balance, 0);
    return { total, count: active.length };
  }, [accounts]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contas</h1>
          <p className="text-sm text-slate-500">Saldo e atividade por conta.</p>
        </div>
        <Link
          to="/backoffice"
          className="text-sm text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
        >
          Gerir contas <ArrowRight size={14} />
        </Link>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Saldo total" value={fmtEUR(totals.total)} accent="blue" hint={`${totals.count} contas ativas`} />
        <Card
          title="Saldo positivo"
          value={fmtEUR(accounts.filter((a) => a.current_balance >= 0).reduce((s, a) => s + a.current_balance, 0))}
          accent="green"
        />
        <Card
          title="Saldo negativo"
          value={fmtEUR(accounts.filter((a) => a.current_balance < 0).reduce((s, a) => s + a.current_balance, 0))}
          accent="red"
        />
      </div>

      {accounts.length === 0 ? (
        <Section title="Sem contas">
          <div className="text-sm text-slate-500 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 mt-0.5" />
            <div>
              Ainda não tens contas configuradas. Vai a <Link to="/backoffice" className="text-brand-700 underline">Backoffice → Contas</Link> e cria as tuas (à ordem, poupança, cartão, e-money).
              Os nomes ficam apenas na DB local — não são publicados.
            </div>
          </div>
        </Section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ account }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
            style={{ background: account.color }}
          >
            <Wallet size={18} />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">{account.name}</div>
            <div className="text-xs text-slate-500">{kindLabel[account.kind] || account.kind}</div>
          </div>
        </div>
        {!account.is_active && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">inativa</span>
        )}
      </div>
      <div className={`text-2xl font-semibold ${account.current_balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
        {fmtEUR(account.current_balance)}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Saldo inicial {fmtEUR(account.initial_balance)} · {account.transaction_count} transações
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          to={`/transactions?account_id=${account.id}`}
          className="text-xs text-brand-700 hover:text-brand-800"
        >
          Ver transações →
        </Link>
      </div>
    </div>
  );
}
