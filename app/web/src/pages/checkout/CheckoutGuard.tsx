import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { RequireAuth } from '../../components/RequireAuth';
import { useCart } from '../../context/CartContext';
import { useLeaveWarning } from '../../lib/useLeaveWarning';

/** Checkout needs a logged-in user and a non-empty cart. Guests are sent to log in and brought back to the same step. */
export function CheckoutGuard({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <CartRequired>{children}</CartRequired>
    </RequireAuth>
  );
}

function CartRequired({ children }: { children: ReactNode }) {
  const { cart, loading } = useCart();
  useLeaveWarning(!!cart && cart.items.length > 0);
  if (loading) return <p role="status">Loading…</p>;
  if (!cart || cart.items.length === 0) return <Navigate to="/cart" replace />;
  return <>{children}</>;
}
