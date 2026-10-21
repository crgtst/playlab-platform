import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import type { Product } from '../api/types';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../lib/format';
import { WishlistToggle } from './WishlistToggle';

export function stockLabel(stock: number): string {
  if (stock === 0) return 'Out of stock';
  if (stock <= 3) return `Only ${stock} left`;
  return 'In stock';
}

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  const onAdd = async () => {
    setBusy(true);
    try {
      await addItem(product.id, 1);
      show(`${product.name} added to your cart`, 'success');
    } catch (err) {
      show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="product-card"
      data-testid="product-card"
      data-product-id={product.id}
      aria-labelledby={`product-${product.id}-name`}
    >
      <img src={product.imageUrl} alt="" width={240} height={160} loading="lazy" />
      <h3 id={`product-${product.id}-name`}>
        <Link to={`/products/${product.id}`} data-testid="product-link">
          <span data-testid="product-name">{product.name}</span>
        </Link>
      </h3>
      <p className="muted" data-testid="product-category">
        {product.category.name}
      </p>
      <p className="price" data-testid="product-price" data-price-cents={product.priceCents}>
        {formatPrice(product.priceCents)}
      </p>
      <p className={product.stock === 0 ? 'stock out' : 'stock'} data-testid="product-stock">
        {stockLabel(product.stock)}
      </p>
      <div className="card-actions">
        <button
          type="button"
          onClick={onAdd}
          disabled={busy || !product.inStock}
          data-testid="add-to-cart-button"
          aria-label={`Add ${product.name} to cart`}
        >
          {busy ? 'Adding…' : 'Add to cart'}
        </button>
        <WishlistToggle productId={product.id} name={product.name} />
      </div>
    </article>
  );
}
