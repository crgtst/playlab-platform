import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';
import { Account } from './pages/Account';
import { Cart } from './pages/Cart';
import { CheckoutGuard } from './pages/checkout/CheckoutGuard';
import { Payment } from './pages/checkout/Payment';
import { Review } from './pages/checkout/Review';
import { Shipping } from './pages/checkout/Shipping';
import { ConfirmEmail } from './pages/ConfirmEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Mailbox } from './pages/Mailbox';
import { NotFound } from './pages/NotFound';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { OrderDetail } from './pages/OrderDetail';
import { ProductDetail } from './pages/ProductDetail';
import { Products } from './pages/Products';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';

export function App() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Move focus to the main region on navigation so keyboard and screen reader users start at the new content.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [location.pathname]);

  return (
    <>
      <a href="#main" className="skip-link" data-testid="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" ref={main} tabIndex={-1} className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/mailbox" element={<Mailbox />} />
          <Route path="/checkout/shipping" element={<CheckoutGuard><Shipping /></CheckoutGuard>} />
          <Route path="/checkout/review" element={<CheckoutGuard><Review /></CheckoutGuard>} />
          <Route path="/checkout/payment" element={<CheckoutGuard><Payment /></CheckoutGuard>} />
          <Route path="/orders/:id/confirmation" element={<RequireAuth><OrderConfirmation /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="/account/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
