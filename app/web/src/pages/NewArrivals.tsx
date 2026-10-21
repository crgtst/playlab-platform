import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Product, ProductList } from '../api/types';
import { useOnline } from '../components/OfflineBanner';
import { ProductCard } from '../components/ProductCard';

const BATCH = 12;

/** Infinite scroll: newest products first, the next batch loads when the sentinel scrolls into view. */
export function NewArrivals() {
  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const done = total !== null && items.length >= total;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const next = page + 1;
      const r = await api<ProductList>(`/products?sort=newest&limit=${BATCH}&page=${next}`);
      // De-duplicate by id in case the catalogue changed between pages.
      setItems((prev) => [...prev, ...r.data.filter((p) => !prev.some((x) => x.id === p.id))]);
      setTotal(r.meta.total);
      setPage(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [page, done]);

  useEffect(() => {
    document.title = 'New arrivals – PlayLab Shop';
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, done, error]);

  useOnline(() => {
    if (error) loadMore();
  });

  return (
    <div>
      <h1>New arrivals</h1>
      {/* Planted a11y fault (Phase 3): this decorative banner has no alt attribute at all. */}
      <img src="/img/home-kitchen.svg" className="promo-banner" width={960} height={120} data-testid="new-arrivals-banner" />
      <p className="muted" role="status" data-testid="new-arrivals-count" data-count={items.length}>
        Showing {items.length}
        {total !== null ? ` of ${total}` : ''} products
      </p>
      <div className="product-grid" data-testid="new-arrivals-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {loading && (
        <p role="status" className="muted" data-testid="new-arrivals-loading">
          Loading more…
        </p>
      )}
      {error && (
        <div className="alert error" role="alert" data-testid="new-arrivals-error">
          <p>{error}</p>
        </div>
      )}
      {done ? (
        <p className="end-of-list" data-testid="new-arrivals-end">
          You've seen all {total} products.
        </p>
      ) : (
        <>
          <div ref={sentinel} className="sentinel" data-testid="infinite-sentinel" aria-hidden="true" />
          <button type="button" className="secondary" onClick={loadMore} disabled={loading} data-testid="load-more-button">
            Load more
          </button>
        </>
      )}
    </div>
  );
}
