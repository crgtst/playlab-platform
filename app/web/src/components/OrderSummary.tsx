import { Link } from 'react-router-dom';
import type { Order } from '../api/types';
import { formatDate, formatDateTime, formatPrice } from '../lib/format';
import { Totals } from './Totals';

export function OrderSummary({ order }: { order: Order }) {
  const s = order.shipping;
  return (
    <div className="order-summary" data-testid="order-summary" data-order-id={order.id}>
      <div className="order-actions" data-testid="order-actions">
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
      <Totals totals={order.totals} discount={order.discount} />
      <section aria-label="Delivery address">
        <h3>Delivery address</h3>
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
      </section>
    </div>
  );
}
