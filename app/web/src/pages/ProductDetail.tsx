import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../api/client';
import type { Product } from '../api/types';
import { stockLabel } from '../components/ProductCard';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../lib/format';

export function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const { show } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus('loading');
    api<{ data: Product }>(`/products/${id}`)
      .then((r) => {
        setProduct(r.data);
        setStatus('ok');
        document.title = `${r.data.name} – PlayLab Shop`;
      })
      .catch((err) => setStatus(err instanceof ApiRequestError && err.status === 404 ? 'notfound' : 'error'));
  }, [id]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) {
      setError('Quantity must be at least 1');
      return;
    }
    setBusy(true);
    try {
      await addItem(product!.id, n);
      show(`${product!.name} added to your cart`, 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') return <p role="status" data-testid="product-loading">Loading…</p>;
  if (status === 'notfound') {
    return (
      <div data-testid="product-not-found">
        <h1>Product not found</h1>
        <Link to="/products" data-testid="product-not-found-shop-link">Back to the shop</Link>
      </div>
    );
  }
  if (status === 'error' || !product) {
    return (
      <p className="alert error" role="alert" data-testid="product-error">
        We could not load this product.
      </p>
    );
  }

  return (
    <article className="product-detail" data-testid="product-detail" data-product-id={product.id}>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/products" data-testid="breadcrumb-shop">Shop</Link> /{' '}
        <Link to={`/products?category=${product.category.slug}`} data-testid="breadcrumb-category">
          {product.category.name}
        </Link>
      </nav>
      <div className="detail-grid">
        <img src={product.imageUrl} alt="" width={480} height={320} />
        <div>
          <h1 data-testid="product-title">{product.name}</h1>
          <p className="price large" data-testid="product-price" data-price-cents={product.priceCents}>
            {formatPrice(product.priceCents)} <span className="muted small">excl. VAT</span>
          </p>
          <p data-testid="product-description">{product.description}</p>
          <p className={product.stock === 0 ? 'stock out' : 'stock'} data-testid="product-stock" data-stock={product.stock}>
            {stockLabel(product.stock)}
          </p>
          <form onSubmit={onAdd} noValidate className="inline-form" data-testid="add-to-cart-form">
            <label htmlFor="detail-qty">Quantity</label>
            <input
              id="detail-qty"
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'detail-qty-error' : undefined}
              data-testid="product-qty-input"
            />
            <button type="submit" disabled={busy || !product.inStock} data-testid="add-to-cart-button">
              {busy ? 'Adding…' : 'Add to cart'}
            </button>
          </form>
          {error && (
            <p id="detail-qty-error" className="field-error" role="alert" data-testid="add-to-cart-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
