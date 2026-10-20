import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Order } from '../api/types';
import { formatDateTime, formatPrice } from '../lib/format';

/** Print-friendly receipt shown in a popup window (window.open) with no site chrome. Never prints by itself. */
export function Receipt() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Receipt – PlayLab Shop';
    api<{ data: Order }>(`/orders/${id}`)
      .then((r) => {
        setOrder(r.data);
        document.title = `Receipt ${r.data.number} – PlayLab Shop`;
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  return (
    <main className="receipt" data-testid="receipt">
      {error && (
        <p role="alert" data-testid="receipt-error">
          {error}
        </p>
      )}
      {!order && !error && <p role="status">Loading…</p>}
      {order && (
        <>
          <h1>PlayLab Shop receipt</h1>
          <p>
            Order <strong data-testid="receipt-order-number">{order.number}</strong> ·{' '}
            <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
          </p>
          <table data-testid="receipt-items">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Qty</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.productId}>
                  <th scope="row">{i.name}</th>
                  <td>{i.quantity}</td>
                  <td>{formatPrice(i.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>Subtotal</th>
                <td>{formatPrice(order.totals.subtotalCents)}</td>
              </tr>
              {order.discount && (
                <tr>
                  <th scope="row" colSpan={2}>
                    Discount ({order.discount.code})
                  </th>
                  <td data-testid="receipt-discount">−{formatPrice(order.totals.discountCents)}</td>
                </tr>
              )}
              <tr>
                <th scope="row" colSpan={2}>VAT (23%)</th>
                <td>{formatPrice(order.totals.vatCents)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={2}>Delivery</th>
                <td>{formatPrice(order.totals.deliveryCents)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={2}>Total</th>
                <td data-testid="receipt-total">{formatPrice(order.totals.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="muted">Paid with card ending {order.cardLast4}</p>
          <div className="receipt-actions">
            <button type="button" onClick={() => window.print()} data-testid="receipt-print-button">
              Print
            </button>
            <button type="button" className="secondary" onClick={() => window.close()} data-testid="receipt-close-button">
              Close
            </button>
          </div>
        </>
      )}
    </main>
  );
}
