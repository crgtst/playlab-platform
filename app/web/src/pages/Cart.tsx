import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { DiscountForm } from '../components/DiscountForm';
import { OffersStrip } from '../components/OffersStrip';
import { useOnline } from '../components/OfflineBanner';
import { QuantityStepper } from '../components/QuantityStepper';
import { Totals } from '../components/Totals';
import { useCart } from '../context/CartContext';
import type { Currency } from '../api/types';
import { useBug } from '../context/ConfigContext';
import { formatPrice } from '../lib/format';
import { t } from '../lib/i18n';

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
  const { cart, loading, setQuantity, removeItem, refresh } = useCart();
  useOnline(refresh);
  // currency-switch-stale: the cart keeps showing euro prices after switching to GBP.
  const stale = useBug('currency-switch-stale');
  const priceOpts: { currency?: Currency } = stale ? { currency: 'EUR' } : {};
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
        <h1>{t('cart.title')}</h1>
        <CartNotices />
        <p>{t('cart.empty')}</p>
        <Link to="/products" className="button" data-testid="continue-shopping-link">
          {t('cart.continue')}
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1>{t('cart.title')}</h1>
      <CartNotices />
      <OffersStrip />
      <table className="cart-table" data-testid="cart-table">
        <caption className="visually-hidden">{t('cart.items')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('cart.product')}</th>
            <th scope="col">{t('cart.price')}</th>
            <th scope="col">{t('cart.quantity')}</th>
            <th scope="col">{t('cart.total')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('cart.actions')}</span>
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
                    {t('cart.priceChanged', { price: formatPrice(item.priceAtAddCents, priceOpts) })}
                  </span>
                )}
                {rowErrors[item.productId] && (
                  <p className="field-error" role="alert" data-testid="cart-item-error">
                    {rowErrors[item.productId]}
                  </p>
                )}
              </th>
              <td data-label={t('cart.price')} data-testid="cart-item-price" data-cents={item.unitPriceCents}>
                {formatPrice(item.unitPriceCents, priceOpts)}
              </td>
              <td data-label={t('cart.quantity')}>
                <QuantityStepper
                  id={`qty-${item.productId}`}
                  label={`${t('cart.quantity')}: ${item.name}`}
                  value={item.quantity}
                  onCommit={(q) => onQuantity(item.productId, q)}
                  onInvalid={(m) => setRowError(item.productId, m)}
                />
              </td>
              <td data-label={t('cart.total')} data-testid="cart-item-line-total" data-cents={item.lineTotalCents}>
                {formatPrice(item.lineTotalCents, priceOpts)}
              </td>
              <td>
                <button type="button" className="link-button" onClick={() => onRemove(item.productId)} aria-label={`${t('cart.remove')}: ${item.name}`} data-testid="cart-item-remove">
                  {t('cart.remove')}
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
            {t('cart.summary')}
          </h2>
          <Totals totals={cart.totals} discount={cart.discount} currency={priceOpts.currency} />
          <Link to="/checkout/shipping" className="button" data-testid="checkout-button">
            {t('cart.checkout')}
          </Link>
        </section>
      </div>
    </div>
  );
}
