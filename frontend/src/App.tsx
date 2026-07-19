import { useCallback, useState } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import QueuePage from './pages/QueuePage';
import EscalationPage from './pages/EscalationPage';
import NewRequestPage from './pages/NewRequestPage';
import RefundsPage from './pages/RefundsPage';
import PendingReviewsPage from './pages/PendingReviewsPage';
import RequestDetailPage from './pages/RequestDetailPage';
import OrdersPage from './pages/OrdersPage';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/queue', label: 'Queue' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/new', label: 'New Request' },
  { to: '/orders', label: 'Orders' },
  { to: '/refunds', label: 'Refunds' },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1>Support Ops Console</h1>
          <p className="meta">Human-in-the-loop AI support</p>
        </div>
        <button
          type="button"
          className="menu-toggle"
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>
        <nav className={menuOpen ? 'nav-open' : ''} onClick={closeMenu}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main key={location.pathname}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/reviews" element={<PendingReviewsPage />} />
          <Route path="/escalations/:id" element={<EscalationPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/new" element={<NewRequestPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/refunds" element={<RefundsPage />} />
        </Routes>
        <Outlet />
      </main>
    </div>
  );
}
