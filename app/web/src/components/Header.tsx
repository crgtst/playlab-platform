import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { AccountMenu } from './AccountMenu';
import { isStaff } from './RequireRole';

export function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [term, setTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (location.pathname === '/products') setTerm(params.get('q') ?? '');
  }, [location.pathname, params]);

  // The mobile menu closes whenever the page changes.
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        document.getElementById('nav-menu-button')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products');
  };

  // Navigate first: router updates run in a transition, so clearing the user first would let an
  // auth-guarded page redirect to /login before this navigation lands.
  const onLogout = async () => {
    navigate('/', { replace: true });
    await logout();
    show('You have been logged out', 'info');
  };

  const count = cart?.itemCount ?? 0;

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" data-testid="nav-home">
          PlayLab Shop
        </Link>
        <Link to="/cart" className="cart-link cart-link-compact" data-testid="nav-cart-compact" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
          🛒 <span className="badge" data-testid="cart-count-compact">{count}</span>
        </Link>
        <button
          type="button"
          id="nav-menu-button"
          className="menu-toggle secondary"
          aria-expanded={menuOpen}
          aria-controls="main-menu"
          onClick={() => setMenuOpen((o) => !o)}
          data-testid="nav-menu-button"
        >
          <span aria-hidden="true">☰</span> Menu
        </button>
        <div id="main-menu" className={menuOpen ? 'main-menu open' : 'main-menu'} data-testid="main-menu">
          <nav aria-label="Main" className="main-nav">
            <NavLink to="/products" data-testid="nav-products">
              Shop
            </NavLink>
            {user && (
              <NavLink to="/wishlist" data-testid="nav-wishlist">
                Wishlist
              </NavLink>
            )}
            {user && (
              <NavLink to="/account" data-testid="nav-account">
                My account
              </NavLink>
            )}
            {isStaff(user?.role) && (
              <NavLink to="/admin/orders" data-testid="nav-admin">
                Admin
              </NavLink>
            )}
          </nav>
          <form role="search" className="header-search" onSubmit={onSearch} data-testid="header-search-form">
            <label htmlFor="header-search" className="visually-hidden">
              Search products
            </label>
            <input
              id="header-search"
              type="search"
              placeholder="Search products"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              data-testid="header-search-input"
            />
            <button type="submit" data-testid="header-search-button">
              Search
            </button>
          </form>
          <div className="header-actions">
            <Link to="/cart" className="cart-link" data-testid="nav-cart" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
              Cart <span className="badge" data-testid="cart-count">{count}</span>
            </Link>
            {user ? (
              <AccountMenu onLogout={onLogout} />
            ) : (
              <>
                <Link to="/login" data-testid="nav-login">
                  Log in
                </Link>
                <Link to="/register" data-testid="nav-register">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
