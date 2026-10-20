import { Link } from 'react-router-dom';
import type { Order } from '../api/types';
import { formatDate, formatDateTime, formatPrice } from '../lib/format';
import { useBug } from '../context/ConfigContext';
import { CopyButton } from './CopyButton';
import { Totals } from './Totals';

/**
 * A stable, labelled region (h2 + h3 sections) so tests can use toMatchAriaSnapshot.
 * Dates sit in <time> elements; match them with a regex in the snapshot.
 */
export function OrderSummary({ order }: { order: Order }) {
  const s = order.shipping;
  // aria-heading-skip: the sub-headings jump from h2 straight to h4.
  const Sub = useBug('aria-heading-skip') ? 'h4' : 'h3';
  const headingId = `order-summary-heading-${order.id}`;
  return (
    <section className="order-summary" aria-labelledby={headingId} data-testid="order-summary" data-order-id={order.id}>
      <h2 id={headingId}>Order summary</h2>
      <div className="order-actions" data-testid="order-actions">
        <CopyButton text={order.number} label="Copy order number" testId="copy-order-number-button" />
        {/* Opens in a new tab: tests catch it with context.waitForEvent('page'). */}
        <Link to={`/track/${order.id}`} target="_blank" rel="noopener" className="button secondary" data-testid="track-parcel-link">
          Track parcel <span className="visually-hidden">(opens in a new tab)</span>
        </Link>
        <button
          type="button"
          className="secondary"
          onClick={() => window.open(`/orders/${order.id}/receipt`, 'receipt', 'popup,width=640,height=800')}
          data-testid="print-receipt-button"
        >
          Print receipt
        </button>
      </div>
      <dl className="meta">
        <div>
          <dt>Order number</dt>
          <dd data-testid="order-number">{order.number}</dd>
        </div>
        <div>
          <dt>Placed</dt>
          <dd>
            <time dateTime={order.createdAt} data-testid="order-date">
              {formatDateTime(order.createdAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd data-testid="order-status" data-status={order.status}>
            {order.status}
          </dd>
        </div>
        {order.deliveryDate && (
          <div>
            <dt>Delivery</dt>
            <dd data-testid="order-delivery-date">{formatDate(`${order.deliveryDate}T12:00:00`)}</dd>
          </div>
        )}
      </dl>
      <Sub className="h3">Items</Sub>
      <table className="order-items" data-testid="order-items">
        <caption className="visually-hidden">Items in this order</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
            <th scope="col">Price</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.productId} data-testid="order-item" data-product-id={i.productId}>
              <th scope="row">{i.name}</th>
              <td>{i.quantity}</td>
              <td>{formatPrice(i.unitPriceCents)}</td>
              <td>{formatPrice(i.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.discount && (
        <p data-testid="order-discount">
          Code <strong data-testid="order-discount-code">{order.discount.code}</strong> saved you{' '}
          <strong data-testid="order-discount-saving">{formatPrice(order.discount.amountCents)}</strong>
        </p>
      )}
      <Sub className="h3">Totals</Sub>
      <Totals totals={order.totals} discount={order.discount} />
      <div className="order-address">
        <Sub className="h3">Delivery address</Sub>
        <address dir="auto" data-testid="order-address">
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
          {s.city} {s.postcode}
        </address>
        <p className="muted small">Paid with card ending {order.cardLast4}</p>
      </div>
    </section>
  );
}
