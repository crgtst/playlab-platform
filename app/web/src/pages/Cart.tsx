import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { DiscountForm } from '../components/DiscountForm';
import { QuantityStepper } from '../components/QuantityStepper';
import { Totals } from '../components/Totals';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/format';

export function CartNotices() {
  const { cart } = useCart();
  if (!cart?.notices.length) return null;
  return (
    <div className="alert info" role="status" data-testid="cart-notices">
      {cart.notices.map((n) => (
        <p key={n.code + n.message} data-testid="cart-notice" data-code={n.code}>
          {n.message}
        </p>
      ))}
    </div>
  );
}

export function Cart() {
  const { cart, loading, setQuantity, removeItem } = useCart();
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    document.title = 'Your cart – PlayLab Shop';
  }, []);

  const setRowError = (productId: number, message: string) => setRowErrors((e) => ({ ...e, [productId]: message }));

  const onQuantity = async (productId: number, quantity: number) => {
    setRowError(productId, '');
    try {
      await setQuantity(productId, quantity);
      return true;
    } catch (err) {
      setRowError(productId, errorMessage(err));
      return false;
    }
  };

  const onRemove = async (productId: number) => {
    setRowError(productId, '');
    try {
      await removeItem(productId);
    } catch (err) {
      setRowError(productId, errorMessage(err));
    }
  };

  if (loading && !cart) return <p role="status">Loading your cart…</p>;

  if (!cart || cart.items.length === 0) {
    return (
      <div data-testid="cart-empty">
        <h1>Your cart</h1>
        <CartNotices />
        <p>Your cart is empty.</p>
        <Link to="/products" className="button" data-testid="continue-shopping-link">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1>Your cart</h1>
      <CartNotices />
      <table className="cart-table" data-testid="cart-table">
        <caption className="visually-hidden">Items in your cart</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Price</th>
            <th scope="col">Quantity</th>
            <th scope="col">Total</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.productId} data-testid="cart-item" data-product-id={item.productId}>
              <th scope="row" data-label="Product">
                <Link to={`/products/${item.productId}`} data-testid="cart-item-name">
                  {item.name}
                </Link>
                {item.priceChanged && (
                  <span className="badge warn" data-testid="cart-item-price-changed">
                    Price changed from {formatPrice(item.priceAtAddCents)}
                  </span>
                )}
                {rowErrors[item.productId] && (
                  <p className="field-error" role="alert" data-testid="cart-item-error">
                    {rowErrors[item.productId]}
                  </p>
                )}
              </th>
              <td data-label="Price" data-testid="cart-item-price" data-cents={item.unitPriceCents}>
                {formatPrice(item.unitPriceCents)}
              </td>
              <td data-label="Quantity">
                <QuantityStepper
                  id={`qty-${item.productId}`}
                  label={`Quantity for ${item.name}`}
                  value={item.quantity}
                  onCommit={(q) => onQuantity(item.productId, q)}
                  onInvalid={(m) => setRowError(item.productId, m)}
                />
              </td>
              <td data-label="Total" data-testid="cart-item-line-total" data-cents={item.lineTotalCents}>
                {formatPrice(item.lineTotalCents)}
              </td>
              <td>
                <button type="button" className="link-button" onClick={() => onRemove(item.productId)} aria-label={`Remove ${item.name}`} data-testid="cart-item-remove">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cart-summary">
        <DiscountForm />
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="h3">
            Order summary
          </h2>
          <Totals totals={cart.totals} discount={cart.discount} />
          <Link to="/checkout/shipping" className="button" data-testid="checkout-button">
            Go to checkout
          </Link>
        </section>
      </div>
    </div>
  );
}
