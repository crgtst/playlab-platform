import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBug } from '../context/ConfigContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, reload } = useAuth();
  const location = useLocation();
  // logout-incomplete: instead of trusting the logged-out state, re-ask the server, whose session was never ended.
  const leaky = useBug('logout-incomplete');
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (leaky && !loading && !user && !checked) reload().finally(() => setChecked(true));
  }, [leaky, loading, user, checked]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading || (leaky && !user && !checked)) {
    return (
      <p className="muted" role="status" data-testid="auth-loading">
        Loading…
      </p>
    );
  }
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <>{children}</>;
}
