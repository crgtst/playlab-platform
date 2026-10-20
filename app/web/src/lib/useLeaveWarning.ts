import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export const LEAVE_CHECKOUT_MESSAGE = 'Your order is not finished. Leave checkout?';

// Destinations that are part of finishing the order, so they never trigger the warning.
const ALLOWED = [/^\/checkout\//, /^\/orders\/\d+\/confirmation$/, /^\/login$/, /^\/cart$/];

/**
 * While checkout is in progress:
 * - leaving the site (reload, closing the tab, typing a URL) triggers the browser's beforeunload prompt;
 * - in-app navigation elsewhere asks with a native confirm() dialog.
 */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!active || currentLocation.pathname === nextLocation.pathname) return false;
    return !ALLOWED.some((re) => re.test(nextLocation.pathname));
  });

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(LEAVE_CHECKOUT_MESSAGE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
