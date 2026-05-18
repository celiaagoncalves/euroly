// App chrome: fixed left sidebar with the primary nav and a content
// area where each route renders via <Outlet />. To add a new top-level
// page, register it in App.jsx and add an entry to `navItems` below.
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  ListChecks,
  CheckSquare,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Contas', icon: Wallet },
  { to: '/credits', label: 'Créditos', icon: CreditCard },
  { to: '/transactions', label: 'Transações', icon: ListChecks },
  { to: '/validation', label: 'Validação', icon: CheckSquare },
  { to: '/backoffice', label: 'Backoffice', icon: Settings },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 bg-white border-r border-slate-200 px-4 py-6 flex flex-col">
        <div className="flex items-center gap-2 px-2 mb-8">
          <span className="text-3xl">€</span>
          <span className="text-xl font-semibold text-slate-900">Euroly</span>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-xs text-slate-400 px-2">v0.1.0 · local</div>
      </aside>
      <main className="flex-1 px-8 py-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
