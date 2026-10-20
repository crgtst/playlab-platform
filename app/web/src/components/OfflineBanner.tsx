import { useEffect, useState } from 'react';
import { NETWORK_ERROR_EVENT } from '../api/client';
import { t } from '../lib/i18n';

/** Friendly offline message (PLS-11.6). Pages reload their data on the browser's `online` event. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const goOffline = () => {
      setOffline(true);
      setBackOnline(false);
    };
    const goOnline = () => {
      setOffline(false);
      setBackOnline(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBackOnline(false), 4000);
    };
    const onNetworkError = () => {
      if (!navigator.onLine) goOffline();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    window.addEventListener(NETWORK_ERROR_EVENT, onNetworkError);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener(NETWORK_ERROR_EVENT, onNetworkError);
      window.clearTimeout(timer);
    };
  }, []);

  if (!offline && !backOnline) return null;
  return (
    <div className={offline ? 'offline-banner' : 'offline-banner back'} role="status" data-testid="offline-banner" data-state={offline ? 'offline' : 'online'}>
      {offline ? t('offline.message') : t('offline.back')}
    </div>
  );
}

/** True while the browser reports a network connection. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Runs `fn` when the browser comes back online. */
export function useOnline(fn: () => void) {
  useEffect(() => {
    window.addEventListener('online', fn);
    return () => window.removeEventListener('online', fn);
  }, [fn]);
}
