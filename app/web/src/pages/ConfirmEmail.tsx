import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function ConfirmEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, reload } = useAuth();
  const [state, setState] = useState<{ status: 'pending' | 'ok' | 'error'; message?: string }>({ status: 'pending' });
  const sent = useRef(false);

  useEffect(() => {
    document.title = 'Confirm email – PlayLab Shop';
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState({ status: 'error', message: 'This confirmation link is missing its token.' });
      return;
    }
    api('/auth/confirm-email', { method: 'POST', body: { token } })
      .then(() => {
        setState({ status: 'ok' });
        if (user) reload();
      })
      .catch((err) => setState({ status: 'error', message: errorMessage(err) }));
  }, [token, user, reload]);

  return (
    <div className="narrow">
      <h1>Confirm your email</h1>
      {state.status === 'pending' && <p role="status">Confirming…</p>}
      {state.status === 'ok' && (
        <div data-testid="confirm-email-success">
          <p role="status">Thanks, your email address is confirmed.</p>
          <Link to={user ? '/account' : '/login'} className="button" data-testid="confirm-email-continue">
            {user ? 'Go to my account' : 'Log in'}
          </Link>
        </div>
      )}
      {state.status === 'error' && (
        <p className="alert error" role="alert" data-testid="confirm-email-error">
          {state.message}
        </p>
      )}
    </div>
  );
}
