import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="admin" data-testid="admin-layout">
      <div className="admin-heading">
        <h1>Admin</h1>
        {user?.role === 'support' && (
          <p className="badge info" data-testid="read-only-badge">
            Read-only access
          </p>
        )}
      </div>
      <nav aria-label="Admin" className="admin-nav">
        <NavLink to="/admin/orders" data-testid="admin-nav-orders">
          Orders
        </NavLink>
        <NavLink to="/admin/products" data-testid="admin-nav-products">
          Products
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
