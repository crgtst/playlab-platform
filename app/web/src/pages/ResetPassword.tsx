import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiRequestError, api, errorMessage } from '../api/client';
import { Field } from '../components/Field';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Choose a new password – PlayLab Shop';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (password.length < 8) next.password = 'Password must be at least 8 characters';
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 422) setErrors({ password: err.fieldErrors().password ?? err.message });
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="narrow">
        <h1>Choose a new password</h1>
        <p className="alert error" role="alert" data-testid="reset-password-error">
          This reset link is missing its token.
        </p>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>Choose a new password</h1>
      {done ? (
        <div data-testid="reset-password-success">
          <p role="status">Your password has been changed.</p>
          <Link to="/login" className="button" data-testid="reset-login-link">
            Log in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate data-testid="reset-password-form">
          {formError && (
            <p className="alert error" role="alert" data-testid="reset-password-error">
              {formError}
            </p>
          )}
          <Field id="reset-password" label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} testId="reset-password-input" />
          <Field id="reset-confirm" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} testId="reset-password-confirm" />
          <button type="submit" disabled={busy} data-testid="reset-password-submit">
            Change password
          </button>
        </form>
      )}
    </div>
  );
}
