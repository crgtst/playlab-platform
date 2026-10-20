import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiRequestError, api, errorMessage } from '../api/client';
import { Field } from '../components/Field';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Forgotten password – PlayLab Shop';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 422 ? err.fieldErrors().email ?? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <h1>Forgotten password</h1>
      {sent ? (
        <div data-testid="forgot-password-sent">
          <p role="status">If an account exists for {email.trim()}, we have sent a password reset link. It expires in 1 hour.</p>
          <p>
            <Link to={`/mailbox?email=${encodeURIComponent(email.trim())}`} data-testid="forgot-password-mailbox-link">
              Open the test mailbox
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate data-testid="forgot-password-form">
          <Field id="forgot-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} testId="forgot-password-email" />
          <button type="submit" disabled={busy} data-testid="forgot-password-submit">
            Send reset link
          </button>
        </form>
      )}
      <p>
        <Link to="/login" data-testid="back-to-login-link">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
