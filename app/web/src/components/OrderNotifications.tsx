import { useEffect, useState } from 'react';
import { useBug } from '../context/ConfigContext';
import { useOrderEvents } from '../context/RealtimeContext';

const KEY = 'playlab.notifications';

export function notificationsWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setNotificationsWanted(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('playlab:notifications'));
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Shows a browser notification for each live order status change, when the shopper has turned them on. */
export function OrderNotifications() {
  // notification-spam: every status change notifies twice (and without a tag to de-duplicate them).
  const spam = useBug('notification-spam');
  useOrderEvents((e) => {
    if (!notificationsSupported() || Notification.permission !== 'granted' || !notificationsWanted()) return;
    const title = `Order ${e.number} is now ${e.status}`;
    const options: NotificationOptions = {
      body: `Was ${e.from}. Tap to see your order.`,
      tag: spam ? undefined : `order-${e.orderId}-${e.status}`,
    };
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      location.assign(`/account/orders/${e.orderId}`);
    };
    if (spam) new Notification(title, options);
  });
  return null;
}

type Status = 'on' | 'off' | 'blocked' | 'unsupported';

function currentStatus(): Status {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && notificationsWanted() ? 'on' : 'off';
}

const LABEL: Record<Status, string> = {
  on: 'Order notifications are on',
  off: 'Order notifications are off',
  blocked: 'Notifications are blocked in your browser settings',
  unsupported: 'This browser does not support notifications',
};

/** Turns order notifications on (asking for permission) or off. */
export function NotificationsToggle() {
  const [status, setStatus] = useState<Status>(currentStatus);

  useEffect(() => {
    const sync = () => setStatus(currentStatus());
    window.addEventListener('playlab:notifications', sync);
    return () => window.removeEventListener('playlab:notifications', sync);
  }, []);

  const onClick = async () => {
    if (status === 'on') {
      setNotificationsWanted(false);
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsWanted(permission === 'granted');
    setStatus(currentStatus());
  };

  return (
    <div className="notifications" data-testid="notifications">
      <button
        type="button"
        className="secondary"
        aria-pressed={status === 'on'}
        disabled={status === 'unsupported' || status === 'blocked'}
        onClick={onClick}
        data-testid="notifications-toggle"
      >
        {status === 'on' ? 'Turn off order notifications' : 'Notify me about my orders'}
      </button>{' '}
      <span className="muted small" role="status" data-testid="notifications-status" data-status={status}>
        {LABEL[status]}
      </span>
    </div>
  );
}
