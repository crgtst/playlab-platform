import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../../api/client';
import type { Order, PaymentIntent } from '../../api/types';
import { CheckoutSteps } from '../../components/CheckoutSteps';
import { PaymentFrame } from '../../components/PaymentFrame';
import { Totals } from '../../components/Totals';
import { useCart } from '../../context/CartContext';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { clearCheckoutState, useCheckoutState } from '../../lib/checkoutState';
import { useBug } from '../../context/ConfigContext';
import { t } from '../../lib/i18n';
import { PriceChangeWarning } from './Review';

type Failure =
  | { kind: 'declined' | 'timeout' | 'frame'; message: string }
  | { kind: 'order'; message: string; retryable: boolean };

interface FrameMessage {
  type: 'playlab-payment';
  status: 'ready' | 'processing' | 'succeeded' | 'declined' | 'timed_out' | 'error';
  intentId: string;
  message?: string;
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function Payment() {
  const navigate = useNavigate();
  const config = useConfig();
  const { show } = useToast();
  const { cart, refresh } = useCart();
  const [state, update] = useCheckoutState();
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [intentError, setIntentError] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [processing, setProcessing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // One key per checkout attempt: retries and double submits can never create two orders.
  const idempotencyKey = useRef(newKey());
  const placingRef = useRef(false);
  // double-submit: the "already placing" guard is missing, so a successful payment places the order twice.
  const doubleSubmit = useBug('double-submit');

  const total = cart?.totals.totalCents ?? 0;
  const blocked = !!cart?.priceChanged && !state.acceptPriceChanges;
  const frameOrigin = config?.paymentFrameUrl ? new URL(config.paymentFrameUrl).origin : null;

  useEffect(() => {
    document.title = 'Checkout: payment – PlayLab Shop';
  }, []);

  // A payment intent is for an exact amount, so make a fresh one whenever the total changes.
  const createIntent = useCallback(async () => {
    setIntentError('');
    setIntent(null);
    try {
      const r = await api<{ data: PaymentIntent }>('/payments/intents', { method: 'POST' });
      setIntent(r.data);
    } catch (err) {
      setIntentError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!cart || cart.items.length === 0 || blocked || !state.shippingComplete) return;
    createIntent();
  }, [total, blocked, createIntent, state.shippingComplete, cart?.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeOrder = useCallback(
    async (paymentIntentId: string) => {
      if (placingRef.current && !doubleSubmit) return;
      placingRef.current = true;
      setPlacing(true);
      setFailure(null);
      try {
        const res = await api<{ data: Order }>('/orders', {
          method: 'POST',
          headers: { 'Idempotency-Key': doubleSubmit ? newKey() : idempotencyKey.current },
          body: {
            shipping: state.shipping,
            deliveryDate: state.deliveryDate,
            instructions: state.instructions,
            acceptPriceChanges: state.acceptPriceChanges,
            paymentIntentId,
          },
        });
        clearCheckoutState();
        // replace: pressing Back from the confirmation must not return to a submittable payment page.
        navigate(`/orders/${res.data.id}/confirmation`, { replace: true });
        refresh();
      } catch (err) {
        const e = err instanceof ApiRequestError ? err : null;
        if (e?.code === 'PAYMENT_AMOUNT_MISMATCH') {
          setFailure({ kind: 'order', message: e.message, retryable: false });
          refresh();
          createIntent();
        } else if (e?.code === 'PRICE_CHANGED') {
          update({ acceptPriceChanges: false });
          setFailure({ kind: 'order', message: e.message, retryable: false });
          refresh();
        } else {
          // Server errors and network failures can be retried: the payment has already been taken.
          const retryable = !e || e.status === 0 || e.status >= 500;
          setFailure({ kind: 'order', message: errorMessage(err), retryable });
          show(retryable ? 'We could not place your order. Please try again.' : errorMessage(err), 'error');
        }
      } finally {
        placingRef.current = false;
        setPlacing(false);
      }
    },
    [state, navigate, refresh, update, createIntent, show, doubleSubmit],
  );

  // Results from the payment iframe arrive by postMessage. Only trust messages from the frame's origin.
  useEffect(() => {
    if (!intent || !frameOrigin) return;
    const onMessage = (e: MessageEvent<FrameMessage>) => {
      if (e.origin !== frameOrigin || e.data?.type !== 'playlab-payment' || e.data.intentId !== intent.id) return;
      switch (e.data.status) {
        case 'processing':
          setFailure(null);
          setProcessing(true);
          break;
        case 'succeeded':
          setProcessing(false);
          placeOrder(intent.id);
          if (doubleSubmit) placeOrder(intent.id);
          break;
        case 'declined':
          setProcessing(false);
          setFailure({ kind: 'declined', message: e.data.message ?? 'Your card was declined' });
          break;
        case 'timed_out':
          setProcessing(false);
          setFailure({ kind: 'timeout', message: e.data.message ?? 'The payment provider did not respond in time.' });
          break;
        case 'error':
          setProcessing(false);
          setFailure({ kind: 'frame', message: e.data.message ?? 'Payment failed' });
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [intent, frameOrigin, placeOrder, doubleSubmit]);

  if (!state.shippingComplete) return <Navigate to="/checkout/shipping" replace />;
  if (!cart) return null;

  const retryPayment = () => {
    setFailure(null);
    frame.current?.contentWindow?.postMessage({ type: 'playlab-retry' }, frameOrigin ?? '*');
  };

  return (
    <div className="checkout">
      <h1>{t('checkout.title')}</h1>
      <CheckoutSteps current={3} />
      <h2>{t('payment.heading')}</h2>
      <PriceChangeWarning accepted={state.acceptPriceChanges} onAccept={() => update({ acceptPriceChanges: true })} />
      <div className="payment-grid">
        <section aria-labelledby="card-heading" data-testid="payment-section">
          <h3 id="card-heading">{t('payment.card')}</h3>
          {failure?.kind === 'declined' && (
            <div className="alert error" role="alert" data-testid="payment-declined">
              <p>{failure.message}</p>
              <p className="small">{t('payment.declinedKept')}</p>
            </div>
          )}
          {failure?.kind === 'timeout' && (
            <div className="alert error" role="alert" data-testid="payment-timeout">
              <p>{failure.message}</p>
              <button type="button" onClick={retryPayment} disabled={processing} data-testid="payment-retry-button">
                {t('payment.retry')}
              </button>
            </div>
          )}
          {(failure?.kind === 'frame' || failure?.kind === 'order') && (
            <div className="alert error" role="alert" data-testid="payment-error">
              <p>{failure.message}</p>
              {failure.kind === 'order' && failure.retryable && intent && (
                <button type="button" onClick={() => placeOrder(intent.id)} disabled={placing} data-testid="payment-order-retry-button">
                  {t('payment.tryAgain')}
                </button>
              )}
            </div>
          )}
          {intentError && (
            <div className="alert error" role="alert" data-testid="payment-setup-error">
              <p>{intentError}</p>
              <button type="button" onClick={createIntent} data-testid="payment-setup-retry-button">
                {t('payment.tryAgain')}
              </button>
            </div>
          )}
          {blocked ? (
            <p className="muted" data-testid="payment-blocked">
              {t('payment.blocked')}
            </p>
          ) : intent ? (
            <PaymentFrame ref={frame} src={intent.frameUrl} />
          ) : (
            !intentError && (
              <p role="status" className="muted" data-testid="payment-loading">
                {t('payment.loading')}
              </p>
            )
          )}
          {(processing || placing) && (
            <p role="status" className="muted" data-testid="payment-processing">
              {placing ? t('payment.placing') : t('payment.processing')}
            </p>
          )}
          <div className="form-actions">
            <Link to="/checkout/review" className="button secondary" data-testid="payment-back-link">
              {t('payment.back')}
            </Link>
          </div>
        </section>
        <aside aria-labelledby="payment-summary-heading">
          <h3 id="payment-summary-heading">{t('payment.orderTotal')}</h3>
          <Totals totals={cart.totals} discount={cart.discount} />
          <div id="test-cards" className="panel small" data-testid="test-cards">
            <p>
              <strong>{t('payment.testCards')}</strong> (any future expiry, any CVC):
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
