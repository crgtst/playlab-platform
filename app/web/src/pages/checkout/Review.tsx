import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CheckoutSteps } from '../../components/CheckoutSteps';
import { DiscountForm } from '../../components/DiscountForm';
import { Totals } from '../../components/Totals';
import { useCart } from '../../context/CartContext';
import { useCheckoutState } from '../../lib/checkoutState';
import { formatDate, formatPrice } from '../../lib/format';
import { t } from '../../lib/i18n';
import { CartNotices } from '../Cart';

export function PriceChangeWarning({ accepted, onAccept }: { accepted: boolean; onAccept: () => void }) {
  const { cart } = useCart();
  if (!cart?.priceChanged) return null;
  return (
    <div className="alert warn" role="alert" data-testid="price-change-warning">
      <p>
        <strong>Some prices have changed</strong> since you added these items:
      </p>
      <ul>
        {cart.items
          .filter((i) => i.priceChanged)
          .map((i) => (
            <li key={i.productId} data-testid="price-change-item" data-product-id={i.productId}>
              {i.name}: {formatPrice(i.priceAtAddCents)} → {formatPrice(i.unitPriceCents)}
            </li>
          ))}
      </ul>
      {accepted ? (
        <p data-testid="price-change-accepted">You have accepted the new prices.</p>
      ) : (
        <button type="button" onClick={onAccept} data-testid="price-change-accept-button">
          Accept new prices
        </button>
      )}
    </div>
  );
}

export function Review() {
  const navigate = useNavigate();
  const { cart } = useCart();
  const [state, update] = useCheckoutState();

  useEffect(() => {
    document.title = 'Checkout: review – PlayLab Shop';
  }, []);

  if (!state.shippingComplete) return <Navigate to="/checkout/shipping" replace />;
  if (!cart) return null;

  const blocked = cart.priceChanged && !state.acceptPriceChanges;
  const s = state.shipping;

  return (
    <div className="checkout">
      <h1>{t('checkout.title')}</h1>
      <CheckoutSteps current={2} />
      <h2>{t('review.heading')}</h2>
      <CartNotices />
      <PriceChangeWarning accepted={state.acceptPriceChanges} onAccept={() => update({ acceptPriceChanges: true })} />

      <section aria-labelledby="review-address-heading" className="panel" data-testid="review-address">
        <h3 id="review-address-heading">{t('review.deliveringTo')}</h3>
        <address dir="auto">
          {s.fullName}
          <br />
          {s.line1}
          {s.line2 && (
            <>
              <br />
              {s.line2}
            </>
          )}
          <br />
          {s.city}
          {s.county ? `, ${s.county}` : ''} {s.postcode}
        </address>
        <p>
          {t('review.deliveryOn')} <strong data-testid="review-delivery-date">{formatDate(`${state.deliveryDate}T12:00:00`)}</strong>
        </p>
        {state.instructions && <p dir="auto" data-testid="review-instructions">“{state.instructions}”</p>}
        <Link to="/checkout/shipping" data-testid="review-edit-shipping-link">
          {t('review.editShipping')}
        </Link>
      </section>

      <section aria-labelledby="review-items-heading" className="panel">
        <h3 id="review-items-heading">{t('review.items')}</h3>
        <ul className="review-items" data-testid="review-items">
          {cart.items.map((i) => (
            <li key={i.productId} data-testid="review-item" data-product-id={i.productId}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <span>{formatPrice(i.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <Link to="/cart" data-testid="review-edit-cart-link">
          {t('review.editCart')}
        </Link>
      </section>

      <div className="cart-summary">
        <DiscountForm />
        <section aria-labelledby="review-totals-heading">
          <h3 id="review-totals-heading">{t('review.total')}</h3>
          <Totals totals={cart.totals} discount={cart.discount} />
        </section>
      </div>

      <div className="form-actions">
        <button type="button" disabled={blocked} onClick={() => navigate('/checkout/payment')} data-testid="review-continue-button">
          {t('review.continue')}
        </button>
      </div>
    </div>
  );
}
