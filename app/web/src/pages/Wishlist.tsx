import { DragEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useWishlist } from '../context/WishlistContext';
import { formatPrice } from '../lib/format';

/** Moves `id` to the position currently held by `targetId`. */
function moveTo(ids: number[], id: number, targetId: number): number[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function Wishlist() {
  const { items, loading, reorder, remove } = useWishlist();
  const { addItem } = useCart();
  const { show } = useToast();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    document.title = 'Wishlist – PlayLab Shop';
  }, []);

  const ids = items.map((i) => i.product.id);

  const save = async (next: number[], announce: string) => {
    if (next.join() === ids.join()) return;
    try {
      await reorder(next);
      setStatus(announce);
    } catch (err) {
      show(errorMessage(err), 'error');
    }
  };

  const onDragStart = (e: DragEvent<HTMLLIElement>, id: number) => {
    setDragging(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
  };

  const onDrop = (e: DragEvent<HTMLLIElement>, targetId: number) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain')) || dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const name = items.find((i) => i.product.id === id)?.product.name;
    const next = moveTo(ids, id, targetId);
    save(next, `${name} moved to position ${next.indexOf(id) + 1} of ${next.length}`);
  };

  const move = (id: number, delta: -1 | 1) => {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    const next = moveTo(ids, id, ids[j]);
    const name = items[i].product.name;
    save(next, `${name} moved to position ${j + 1} of ${next.length}`);
  };

  const onRemove = async (id: number, name: string) => {
    // Native confirm dialog: handle it in tests with page.on('dialog').
    if (!window.confirm(`Remove ${name} from your wishlist?`)) return;
    try {
      await remove(id);
      show(`${name} removed from your wishlist`, 'info');
    } catch (err) {
      show(errorMessage(err), 'error');
    }
  };

  const onAddToCart = async (id: number, name: string) => {
    try {
      await addItem(id, 1);
      show(`${name} added to your cart`, 'success');
    } catch (err) {
      show(errorMessage(err), 'error');
    }
  };

  return (
    <div>
      <h1>Wishlist</h1>
      {loading && items.length === 0 && <p role="status">Loading…</p>}
      {!loading && items.length === 0 && (
        <div className="empty-state" data-testid="wishlist-empty">
          <p>Your wishlist is empty.</p>
          <Link to="/products" data-testid="wishlist-shop-link">
            Browse products
          </Link>
        </div>
      )}
      {items.length > 0 && (
        <>
          <p className="muted" id="wishlist-help">
            Drag items to reorder them, or use the Move up and Move down buttons. Your order is saved automatically.
          </p>
          <ol className="wishlist" aria-describedby="wishlist-help" data-testid="wishlist-list">
            {items.map((item, index) => {
              const p = item.product;
              const classes = ['wishlist-item', dragging === p.id ? 'dragging' : '', over === p.id && dragging !== p.id ? 'drag-over' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <li
                  key={p.id}
                  className={classes}
                  draggable
                  onDragStart={(e) => onDragStart(e, p.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (over !== p.id) setOver(p.id);
                  }}
                  onDragLeave={() => setOver((o) => (o === p.id ? null : o))}
                  onDrop={(e) => onDrop(e, p.id)}
                  data-testid="wishlist-item"
                  data-product-id={p.id}
                  data-position={index}
                >
                  <span className="drag-handle" aria-hidden="true" data-testid="wishlist-drag-handle">
                    ⠿
                  </span>
                  <img src={p.imageUrl} alt="" width={64} height={43} />
                  <div className="wishlist-info">
                    <Link to={`/products/${p.id}`} data-testid="wishlist-item-name">
                      {p.name}
                    </Link>
                    <span className="price" data-testid="wishlist-item-price">
                      {formatPrice(p.priceCents)}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="secondary" disabled={index === 0} onClick={() => move(p.id, -1)} aria-label={`Move ${p.name} up`} data-testid="wishlist-move-up">
                      ↑
                    </button>
                    <button type="button" className="secondary" disabled={index === items.length - 1} onClick={() => move(p.id, 1)} aria-label={`Move ${p.name} down`} data-testid="wishlist-move-down">
                      ↓
                    </button>
                    <button type="button" disabled={!p.inStock} onClick={() => onAddToCart(p.id, p.name)} data-testid="wishlist-add-to-cart">
                      Add to cart
                    </button>
                    <button type="button" className="link-button" onClick={() => onRemove(p.id, p.name)} aria-label={`Remove ${p.name}`} data-testid="wishlist-remove">
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="visually-hidden" role="status" aria-live="polite" data-testid="wishlist-status">
            {status}
          </p>
        </>
      )}
    </div>
  );
}
