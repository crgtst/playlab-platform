import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiRequestError, AUTH_EXPIRED_EVENT } from '../api/client';
import type { User } from '../api/types';
import { clearCheckoutState } from '../lib/checkoutState';

interface AuthApi {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  reload: () => Promise<User | null>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await api<{ user: User }>('/auth/me');
      setUser(res.user);
      return res.user;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const onExpired = () => setUser(null);
    // Pages restored from the back/forward cache must re-check the session (PLS-1.4).
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reload();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } });
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clearCheckoutState();
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, reload }), [user, loading, login, logout, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
