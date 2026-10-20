import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { WishlistItem } from '../api/types';
import { useAuth } from './AuthContext';

interface WishlistApi {
  items: WishlistItem[];
  loading: boolean;
  has: (productId: number) => boolean;
  add: (productId: number) => Promise<void>;
  remove: (productId: number) => Promise<void>;
  reorder: (productIds: number[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistApi | null>(null);

type WishlistResponse = { data: WishlistItem[] };

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems((await api<WishlistResponse>('/wishlist')).data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<WishlistApi>(
    () => ({
      items,
      loading,
      refresh,
      has: (id) => items.some((i) => i.product.id === id),
      add: async (productId) => setItems((await api<WishlistResponse>('/wishlist/items', { method: 'POST', body: { productId } })).data),
      remove: async (productId) => setItems((await api<WishlistResponse>(`/wishlist/items/${productId}`, { method: 'DELETE' })).data),
      reorder: async (productIds) => {
        const previous = items;
        // Optimistic: show the new order straight away, roll back if the save fails.
        const byId = new Map(items.map((i) => [i.product.id, i]));
        setItems(productIds.map((id, position) => ({ ...byId.get(id)!, position })));
        try {
          setItems((await api<WishlistResponse>('/wishlist/order', { method: 'PUT', body: { productIds } })).data);
        } catch (err) {
          setItems(previous);
          throw err;
        }
      },
    }),
    [items, loading, refresh],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistApi {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
