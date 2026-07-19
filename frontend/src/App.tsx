import { Routes, Route, NavLink } from 'react-router-dom';
import QueuePage from './pages/QueuePage';
import EscalationPage from './pages/EscalationPage';
import NewRequestPage from './pages/NewRequestPage';
import RefundsPage from './pages/RefundsPage';

export default function App() {
  return (
    <div className="app-shell">
      <header>
        <h1>Support Operations Console</h1>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Queue
          </NavLink>
          <NavLink to="/new" className={({ isActive }) => (isActive ? 'active' : '')}>
            New Request
          </NavLink>
          <NavLink to="/refunds" className={({ isActive }) => (isActive ? 'active' : '')}>
            Refunds
          </NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<QueuePage />} />
        <Route path="/escalations/:id" element={<EscalationPage />} />
        <Route path="/new" element={<NewRequestPage />} />
        <Route path="/refunds" element={<RefundsPage />} />
      </Routes>
    </div>
  );
}
