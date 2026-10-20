import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Order } from '../api/types';
import { OrderSummary } from '../components/OrderSummary';

export function OrderConfirmation() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Order confirmed – PlayLab Shop';
    api<{ data: Order }>(`/orders/${id}`)
      .then((r) => setOrder(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) {
    return (
      <p className="alert error" role="alert" data-testid="order-error">
        {error}
      </p>
    );
  }
  if (!order) return <p role="status">Loading your order…</p>;

  return (
    <div data-testid="order-confirmation">
      <h1>Thank you for your order</h1>
      <p className="alert success" role="status" data-testid="order-confirmation-message">
        Your order <strong>{order.number}</strong> has been placed.
      </p>
      <OrderSummary order={order} />
      <p>
        <Link to="/account" data-testid="confirmation-account-link">
          View order history
        </Link>{' '}
        ·{' '}
        <Link to="/products" data-testid="confirmation-continue-link">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
