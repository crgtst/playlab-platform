import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../../api/client';
import type { Order } from '../../api/types';
import { CheckoutSteps } from '../../components/CheckoutSteps';
import { Field } from '../../components/Field';
import { Totals } from '../../components/Totals';
import { useCart } from '../../context/CartContext';
import { clearCheckoutState, useCheckoutState } from '../../lib/checkoutState';
import { formatPrice } from '../../lib/format';
import { PriceChangeWarning } from './Review';

type CardErrors = Partial<Record<'nameOnCard' | 'cardNumber' | 'expiry' | 'cvc', string>>;

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function Payment() {
  const navigate = useNavigate();
  const { cart, refresh } = useCart();
  const [state, update] = useCheckoutState();
  const [card, setCard] = useState({ nameOnCard: state.shipping.fullName, cardNumber: '', expiry: '', cvc: '' });
  const [errors, setErrors] = useState<CardErrors>({});
  const [failure, setFailure] = useState<{ kind: 'declined' | 'timeout' | 'other'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per checkout attempt: a double click or a retry after a timeout can never create two orders.
  const idempotencyKey = useRef(newKey());
  const submitting = useRef(false);

  useEffect(() => {
    document.title = 'Checkout: payment – PlayLab Shop';
  }, []);

  if (!state.shippingComplete) return <Navigate to="/checkout/shipping" replace />;
  if (!cart) return null;

  const validate = (): CardErrors => {
    const e: CardErrors = {};
    const digits = card.cardNumber.replace(/[\s-]/g, '');
    if (!card.nameOnCard.trim()) e.nameOnCard = 'Name on card is required';
    if (!/^\d{12,19}$/.test(digits)) e.cardNumber = 'Enter a valid card number';
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry.trim())) e.expiry = 'Use the format MM/YY';
    if (!/^\d{3,4}$/.test(card.cvc.trim())) e.cvc = 'Enter 3 or 4 digits';
    return e;
  };

  const pay = async () => {
    if (submitting.current) return;
    setFailure(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    submitting.current = true;
    setBusy(true);
    try {
      const res = await api<{ data: Order }>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          shipping: state.shipping,
          deliveryDate: state.deliveryDate,
          instructions: state.instructions,
          acceptPriceChanges: state.acceptPriceChanges,
          payment: { ...card, cardNumber: card.cardNumber.replace(/[\s-]/g, '') },
        },
      });
      clearCheckoutState();
      // replace: pressing Back from the confirmation must not return to a submittable payment page.
      navigate(`/orders/${res.data.id}/confirmation`, { replace: true });
      refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 402) setFailure({ kind: 'declined', message: err.message });
        else if (err.status === 504) setFailure({ kind: 'timeout', message: err.message });
        else if (err.status === 422 && Array.isArray(err.details)) {
          const f = err.fieldErrors();
          setErrors({
            nameOnCard: f['payment.nameOnCard'],
            cardNumber: f['payment.cardNumber'],
            expiry: f['payment.expiry'],
            cvc: f['payment.cvc'],
          });
          setFailure({ kind: 'other', message: Object.values(f)[0] ?? err.message });
        } else {
          if (err.code === 'PRICE_CHANGED') update({ acceptPriceChanges: false });
          setFailure({ kind: 'other', message: err.message });
        }
        refresh();
      } else {
        setFailure({ kind: 'other', message: errorMessage(err) });
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    pay();
  };

  const blocked = cart.priceChanged && !state.acceptPriceChanges;

  return (
    <div className="checkout">
      <h1>Checkout</h1>
      <CheckoutSteps current={3} />
      <h2>Payment</h2>
      <PriceChangeWarning accepted={state.acceptPriceChanges} onAccept={() => update({ acceptPriceChanges: true })} />
      <div className="payment-grid">
        <form onSubmit={onSubmit} noValidate className="checkout-form" data-testid="payment-form" aria-describedby="test-cards">
          {failure?.kind === 'declined' && (
            <div className="alert error" role="alert" data-testid="payment-declined">
              <p>{failure.message}</p>
              <p className="small">Your cart has been kept. Try another card.</p>
            </div>
          )}
          {failure?.kind === 'timeout' && (
            <div className="alert error" role="alert" data-testid="payment-timeout">
              <p>{failure.message}</p>
              <button type="button" onClick={pay} disabled={busy} data-testid="payment-retry-button">
                Retry payment
              </button>
            </div>
          )}
          {failure?.kind === 'other' && (
            <p className="alert error" role="alert" data-testid="payment-error">
              {failure.message}
            </p>
          )}
          <Field id="card-name" label="Name on card" autoComplete="cc-name" value={card.nameOnCard} onChange={(e) => setCard({ ...card, nameOnCard: e.target.value })} error={errors.nameOnCard} testId="card-name" />
          <Field id="card-number" label="Card number" inputMode="numeric" autoComplete="cc-number" value={card.cardNumber} onChange={(e) => setCard({ ...card, cardNumber: e.target.value })} error={errors.cardNumber} testId="card-number" />
          <div className="row">
            <Field id="card-expiry" label="Expiry (MM/YY)" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} error={errors.expiry} testId="card-expiry" />
            <Field id="card-cvc" label="Security code" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} error={errors.cvc} testId="card-cvc" />
          </div>
          <div className="form-actions">
            <Link to="/checkout/review" className="button secondary" data-testid="payment-back-link">
              Back
            </Link>
            <button type="submit" disabled={busy || blocked} aria-busy={busy} data-testid="checkout-pay-button">
              {busy ? 'Processing…' : `Pay ${formatPrice(cart.totals.totalCents)}`}
            </button>
          </div>
          {busy && (
            <p role="status" className="muted" data-testid="payment-processing">
              Processing your payment…
            </p>
          )}
        </form>
        <aside aria-labelledby="payment-summary-heading">
          <h3 id="payment-summary-heading">Order total</h3>
          <Totals totals={cart.totals} discount={cart.discount} />
          <div id="test-cards" className="panel small" data-testid="test-cards">
            <p>
              <strong>Test cards</strong> (any future expiry, any CVC):
            </p>
            <ul>
              <li>4242 4242 4242 4242 – succeeds</li>
              <li>4000 0000 0000 0002 – declined</li>
              <li>4000 0000 0000 0119 – times out</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
