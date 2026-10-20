import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../api/client';
import type { Order } from '../api/types';
import { OrderSummary } from '../components/OrderSummary';

export function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Order – PlayLab Shop';
    api<{ data: Order }>(`/orders/${id}`)
      .then((r) => setOrder(r.data))
      .catch((err) => setError(err instanceof ApiRequestError && err.status === 404 ? 'Order not found' : errorMessage(err)));
  }, [id]);

  return (
    <div>
      <p>
        <Link to="/account" data-testid="order-back-link">
          ← Back to my account
        </Link>
      </p>
      {error && (
        <div data-testid="order-not-found">
          <h1>{error}</h1>
        </div>
      )}
      {!error && !order && <p role="status">Loading…</p>}
      {order && (
        <>
          <h1>Order {order.number}</h1>
          <OrderSummary order={order} />
        </>
      )}
    </div>
  );
}
