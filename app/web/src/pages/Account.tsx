import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Order } from '../api/types';
import { AvatarUpload } from '../components/AvatarUpload';
import { LiveIndicator } from '../components/LiveIndicator';
import { useOrderEvents } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatPrice } from '../lib/format';

export function Account() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  useOrderEvents((e) => setOrders((list) => list?.map((o) => (o.id === e.orderId ? { ...o, status: e.status as Order['status'] } : o)) ?? null));

  useEffect(() => {
    document.title = 'My account – PlayLab Shop';
    api<{ data: Order[] }>('/orders?limit=100')
      .then((r) => setOrders(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!user) return null;

  return (
    <div>
      <h1>My account</h1>
      {!user.emailVerified && (
        <p className="alert info" role="status" data-testid="email-unverified-banner">
          Please confirm your email address using the link we sent to {user.email}.
        </p>
      )}
      <section aria-labelledby="profile-heading" className="panel" data-testid="account-profile">
        <h2 id="profile-heading" className="h3">
          Profile
        </h2>
        <dl className="meta">
          <div>
            <dt>Name</dt>
            <dd data-testid="account-name" dir="auto">
              {user.name}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd data-testid="account-email">{user.email}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd data-testid="account-role">{user.role}</dd>
          </div>
        </dl>
      </section>

      <AvatarUpload />

      <section aria-labelledby="orders-heading" id="orders">
        <h2 id="orders-heading">Order history</h2>
        <LiveIndicator />
        {error && (
          <p className="alert error" role="alert" data-testid="order-history-error">
            {error}
          </p>
        )}
        {!error && !orders && <p role="status">Loading orders…</p>}
        {orders && orders.length === 0 && (
          <p data-testid="order-history-empty">
            You have no orders yet.{' '}
            <Link to="/products" data-testid="order-history-shop-link">
              Start shopping
            </Link>
          </p>
        )}
        {orders && orders.length > 0 && (
          <table className="order-history" data-testid="order-history">
            <caption className="visually-hidden">Your orders, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-testid="order-row" data-order-id={o.id}>
                  <th scope="row">
                    <Link to={`/account/orders/${o.id}`} data-testid="order-link">
                      {o.number}
                    </Link>
                  </th>
                  <td>
                    <time dateTime={o.createdAt} data-testid="order-row-date">
                      {formatDate(o.createdAt)}
                    </time>
                  </td>
                  <td data-testid="order-row-status" data-status={o.status}>
                    {o.status}
                  </td>
                  <td data-testid="order-row-total">{formatPrice(o.totals.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
