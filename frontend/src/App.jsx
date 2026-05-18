// Top-level route table. All pages share the sidebar Layout; `/` redirects
// to the dashboard. Add new pages by importing them and registering a
// <Route> here AND adding a nav item in components/Layout.jsx.
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Credits from './pages/Credits.jsx';
import Transactions from './pages/Transactions.jsx';
import Validation from './pages/Validation.jsx';
import Backoffice from './pages/Backoffice.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/backoffice" element={<Backoffice />} />
      </Route>
    </Routes>
  );
}
