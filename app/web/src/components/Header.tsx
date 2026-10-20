import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

export function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [term, setTerm] = useState('');

  useEffect(() => {
    if (location.pathname === '/products') setTerm(params.get('q') ?? '');
  }, [location.pathname, params]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products');
  };

  const onLogout = async () => {
    await logout();
    show('You have been logged out', 'info');
    navigate('/', { replace: true });
  };

  const count = cart?.itemCount ?? 0;

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" data-testid="nav-home">
          PlayLab Shop
        </Link>
        <nav aria-label="Main" className="main-nav">
          <NavLink to="/products" data-testid="nav-products">
            Shop
          </NavLink>
          {user && (
            <NavLink to="/account" data-testid="nav-account">
              My account
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
            <>
              <span className="user-name" data-testid="header-user-name" dir="auto">
                {user.name}
              </span>
              <button type="button" className="secondary" onClick={onLogout} data-testid="logout-button">
                Log out
              </button>
            </>
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
    </header>
  );
}
