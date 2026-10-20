import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { Forbidden } from '../pages/Forbidden';

/** Guests go to login; signed-in users without the role see a 403 page (never a blank page). */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <p className="muted" role="status" data-testid="auth-loading">
        Loading…
      </p>
    );
  }
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Forbidden />;
  return <>{children}</>;
}

export function isStaff(role: Role | undefined): boolean {
  return role === 'admin' || role === 'support';
}
