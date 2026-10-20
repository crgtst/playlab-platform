import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { useBug } from '../context/ConfigContext';
import { useAuth } from '../context/AuthContext';
import { safeReturnTo } from '../lib/format';

export function Login() {
  // missing-label: the email field's label is no longer tied to the input.
  const missingLabel = useBug('missing-label');
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Log in – PlayLab Shop';
  }, []);

  useEffect(() => {
    if (user) navigate(returnTo, { replace: true });
  }, [user, returnTo, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address';
    if (!password) next.password = 'Enter your password';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      // navigation happens in the effect above once the user is set
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <h1>Log in</h1>
      {params.get('returnTo') && (
        <p className="alert info" role="status" data-testid="login-required-message">
          Please log in to continue.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate data-testid="login-form">
        {formError && (
          <p className="alert error" role="alert" data-testid="login-error">
            {formError}
          </p>
        )}
        <Field id="login-email" label="Email" unlabelled={missingLabel} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} testId="login-email" />
        <Field id="login-password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} testId="login-password" />
        <button type="submit" disabled={busy} data-testid="login-submit">
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p>
        <Link to="/forgot-password" data-testid="forgot-password-link">
          Forgotten your password?
        </Link>
      </p>
      <p>
        New here?{' '}
        <Link to="/register" data-testid="register-link">
          Create an account
        </Link>
      </p>
    </div>
  );
}
