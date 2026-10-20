import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Cart } from '../api/types';
import { useAuth } from './AuthContext';

interface CartApi {
  cart: Cart | null;
  /** True until the cart for the current user (or guest) has loaded. */
  loading: boolean;
  refresh: () => Promise<Cart | null>;
  addItem: (productId: number, quantity?: number) => Promise<Cart>;
  setQuantity: (productId: number, quantity: number) => Promise<Cart>;
  removeItem: (productId: number) => Promise<Cart>;
  applyCode: (code: string) => Promise<Cart>;
  removeCode: () => Promise<Cart>;
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  // Which user the loaded cart belongs to. After a login the old (guest) cart must not be shown as theirs.
  const [owner, setOwner] = useState<number | null | undefined>(undefined);
  const userId = user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(async () => {
    const forUser = userIdRef.current;
    try {
      const c = await api<Cart>('/cart');
      if (userIdRef.current === forUser) {
        setCart(c);
        setOwner(forUser);
      }
      return c;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the signed-in user changes (login merges the guest cart; logout clears it).
  useEffect(() => {
    if (!authLoading) refresh();
  }, [userId, authLoading, refresh]);

  const stale = authLoading || owner !== userId;

  const mutate = useCallback(async (path: string, method: string, body?: unknown) => {
    const c = await api<Cart>(path, { method, body });
    setCart(c);
    return c;
  }, []);

  const value = useMemo<CartApi>(
    () => ({
      cart,
      loading: loading || stale,
      refresh,
      addItem: (productId, quantity = 1) => mutate('/cart/items', 'POST', { productId, quantity }),
      setQuantity: (productId, quantity) => mutate(`/cart/items/${productId}`, 'PATCH', { quantity }),
      removeItem: (productId) => mutate(`/cart/items/${productId}`, 'DELETE'),
      applyCode: (code) => mutate('/cart/discount', 'POST', { code }),
      removeCode: () => mutate('/cart/discount', 'DELETE'),
    }),
    [cart, loading, stale, refresh, mutate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
