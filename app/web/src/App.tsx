import { useEffect, useRef } from 'react';
import { Outlet, RouteObject, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { Account } from './pages/Account';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminProducts } from './pages/admin/AdminProducts';
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
import { NewArrivals } from './pages/NewArrivals';
import { NotFound } from './pages/NotFound';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { OrderDetail } from './pages/OrderDetail';
import { ProductDetail } from './pages/ProductDetail';
import { Products } from './pages/Products';
import { Receipt } from './pages/Receipt';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
import { Track } from './pages/Track';
import { Wishlist } from './pages/Wishlist';

/** Site chrome: skip link, header, main region and footer. */
function Layout() {
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
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export const routes: RouteObject[] = [
  // The print receipt opens in a popup window without the site chrome.
  { path: '/orders/:id/receipt', element: <RequireAuth><Receipt /></RequireAuth> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/products', element: <Products /> },
      { path: '/products/:id', element: <ProductDetail /> },
      { path: '/new-arrivals', element: <NewArrivals /> },
      { path: '/cart', element: <Cart /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/confirm-email', element: <ConfirmEmail /> },
      { path: '/mailbox', element: <Mailbox /> },
      { path: '/checkout/shipping', element: <CheckoutGuard><Shipping /></CheckoutGuard> },
      { path: '/checkout/review', element: <CheckoutGuard><Review /></CheckoutGuard> },
      { path: '/checkout/payment', element: <CheckoutGuard><Payment /></CheckoutGuard> },
      { path: '/orders/:id/confirmation', element: <RequireAuth><OrderConfirmation /></RequireAuth> },
      { path: '/account', element: <RequireAuth><Account /></RequireAuth> },
      { path: '/account/orders/:id', element: <RequireAuth><OrderDetail /></RequireAuth> },
      { path: '/wishlist', element: <RequireAuth><Wishlist /></RequireAuth> },
      { path: '/track/:id', element: <RequireAuth><Track /></RequireAuth> },
      {
        path: '/admin',
        element: (
          <RequireRole roles={['admin', 'support']}>
            <AdminLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: <AdminOrders /> },
          { path: 'orders', element: <AdminOrders /> },
          { path: 'products', element: <AdminProducts /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
