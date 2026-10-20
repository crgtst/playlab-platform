import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Category, ProductList } from '../api/types';
import { Pagination } from '../components/Pagination';
import { useOnline } from '../components/OfflineBanner';
import { ProductCard } from '../components/ProductCard';

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name: A to Z' },
  { value: 'name_desc', label: 'Name: Z to A' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
];

const FILTER_KEYS = ['q', 'category', 'minPrice', 'maxPrice', 'sort'] as const;

function isProductList(v: unknown): v is ProductList {
  const r = v as ProductList;
  return !!r && Array.isArray(r.data) && !!r.meta && typeof r.meta.total === 'number';
}

export function Products() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<ProductList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ q: '', category: '', minPrice: '', maxPrice: '', sort: 'name_asc' });
  const [formError, setFormError] = useState('');

  const query = params.toString();

  useEffect(() => {
    document.title = 'Shop – PlayLab Shop';
    api<{ data: Category[] }>('/categories')
      .then((r) => setCategories(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setCategories([]));
  }, []);

  // Keep the form in step with the URL (e.g. after the header search or back button).
  useEffect(() => {
    setForm({
      q: params.get('q') ?? '',
      category: params.get('category') ?? '',
      minPrice: params.get('minPrice') ?? '',
      maxPrice: params.get('maxPrice') ?? '',
      sort: params.get('sort') ?? 'name_asc',
    });
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api<unknown>(`/products${query ? `?${query}` : ''}`);
      if (!isProductList(r)) throw new Error('bad shape');
      setResult(r);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error && err.message === 'bad shape' ? 'We could not load products. Please try again.' : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);
  useOnline(load);

  const apply = (next: typeof form) => {
    const min = next.minPrice === '' ? null : Number(next.minPrice);
    const max = next.maxPrice === '' ? null : Number(next.maxPrice);
    if ((min !== null && (Number.isNaN(min) || min < 0)) || (max !== null && (Number.isNaN(max) || max < 0))) {
      setFormError('Prices must be zero or more');
      return;
    }
    if (min !== null && max !== null && min > max) {
      setFormError('Minimum price must not be more than maximum price');
      return;
    }
    setFormError('');
    const p = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = next[key].trim();
      if (v && !(key === 'sort' && v === 'name_asc')) p.set(key, v);
    }
    setParams(p);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    apply(form);
  };

  const onSelect = (key: 'category' | 'sort', value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    apply(next);
  };

  const goToPage = (page: number) => {
    const p = new URLSearchParams(params);
    if (page <= 1) p.delete('page');
    else p.set('page', String(page));
    setParams(p);
    window.scrollTo(0, 0);
  };

  const meta = result?.meta;

  return (
    <div className="catalogue">
      <h1>Shop</h1>
      <form className="filters" onSubmit={onSubmit} noValidate aria-label="Filter products" data-testid="filters-form">
        <div className="field">
          <label htmlFor="filter-q">Search</label>
          <input id="filter-q" type="search" value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} data-testid="filter-search-input" />
        </div>
        <div className="field">
          <label htmlFor="filter-category">Category</label>
          <select id="filter-category" value={form.category} onChange={(e) => onSelect('category', e.target.value)} data-testid="filter-category-select">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-min">Min price (€)</label>
          <input id="filter-min" type="number" min={0} step="0.01" inputMode="decimal" value={form.minPrice} onChange={(e) => setForm({ ...form, minPrice: e.target.value })} data-testid="filter-min-price-input" />
        </div>
        <div className="field">
          <label htmlFor="filter-max">Max price (€)</label>
          <input id="filter-max" type="number" min={0} step="0.01" inputMode="decimal" value={form.maxPrice} onChange={(e) => setForm({ ...form, maxPrice: e.target.value })} data-testid="filter-max-price-input" />
        </div>
        <div className="field">
          <label htmlFor="filter-sort">Sort by</label>
          <select id="filter-sort" value={form.sort} onChange={(e) => onSelect('sort', e.target.value)} data-testid="sort-select">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          <button type="submit" data-testid="filter-apply-button">
            Apply filters
          </button>
          <Link to="/products" className="button secondary" data-testid="filter-reset-button">
            Reset filters
          </Link>
        </div>
        {formError && (
          <p className="field-error" role="alert" data-testid="filter-error">
            {formError}
          </p>
        )}
      </form>

      <section aria-labelledby="results-heading" aria-busy={loading}>
        <h2 id="results-heading" className="visually-hidden">
          Results
        </h2>
        {loading && (
          <p role="status" className="muted" data-testid="products-loading">
            Loading products…
          </p>
        )}
        {!loading && error && (
          <div className="alert error" role="alert" data-testid="products-error">
            <p>{error}</p>
            <button type="button" onClick={load} data-testid="products-retry-button">
              Try again
            </button>
          </div>
        )}
        {!loading && result && (
          <>
            <p className="result-count" role="status" data-testid="result-count" data-count={result.meta.total}>
              {result.meta.total} {result.meta.total === 1 ? 'result' : 'results'}
            </p>
            {result.data.length === 0 ? (
              <div className="empty-state" data-testid="empty-state">
                <p>No products match your search.</p>
                <Link to="/products" data-testid="clear-filters-link">
                  Clear filters
                </Link>
              </div>
            ) : (
              <div className="product-grid" data-testid="product-grid">
                {result.data.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
            {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPage={goToPage} />}
          </>
        )}
      </section>
    </div>
  );
}
