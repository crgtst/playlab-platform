import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../api/client';
import type { Tracking } from '../api/types';
import { LiveIndicator } from '../components/LiveIndicator';
import { useOrderEvents } from '../context/RealtimeContext';
import { formatDate, formatDateTime } from '../lib/format';

/** Opened in a new tab from an order ("Track parcel"). */
export function Track() {
  const { id } = useParams();
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ data: Tracking }>(`/orders/${id}/tracking`)
      .then((r) => {
        setTracking(r.data);
        document.title = `Tracking ${r.data.number} – PlayLab Shop`;
      })
      .catch((err) => setError(err instanceof ApiRequestError && err.status === 404 ? 'Order not found' : errorMessage(err)));
  }, [id]);

  useEffect(() => {
    document.title = 'Track parcel – PlayLab Shop';
    load();
  }, [load]);

  useOrderEvents((e) => {
    if (e.orderId === Number(id)) load();
  });

  if (error) {
    return (
      <div data-testid="tracking-error">
        <h1>{error}</h1>
      </div>
    );
  }
  if (!tracking) return <p role="status">Loading tracking…</p>;

  return (
    <div data-testid="tracking-page" data-status={tracking.status}>
      <h1>Track order {tracking.number}</h1>
      <LiveIndicator />
      {/* Planted a11y fault (Phase 3): an icon-only link with no accessible name. */}
      <a href={`mailto:?subject=Tracking%20${tracking.number}`} className="icon-link" data-testid="tracking-share-link">
        <span aria-hidden="true">✉</span>
      </a>
      <dl className="meta">
        <div>
          <dt>Carrier</dt>
          <dd data-testid="tracking-carrier">{tracking.carrier}</dd>
        </div>
        <div>
          <dt>Tracking number</dt>
          <dd data-testid="tracking-number">{tracking.trackingNumber}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd data-testid="tracking-status">{tracking.status}</dd>
        </div>
        {tracking.estimatedDelivery && (
          <div>
            <dt>Expected</dt>
            <dd data-testid="tracking-estimated">{formatDate(`${tracking.estimatedDelivery}T12:00:00`)}</dd>
          </div>
        )}
      </dl>
      <h2>Progress</h2>
      <ol className="timeline" data-testid="tracking-events">
        {tracking.events.map((e) => (
          <li key={e.status} data-testid="tracking-event" data-status={e.status}>
            <strong>{e.label}</strong>
            <br />
            <time dateTime={e.at} className="muted small">
              {formatDateTime(e.at)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
