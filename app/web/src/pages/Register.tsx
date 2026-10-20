import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiRequestError, api, errorMessage } from '../api/client';
import { Field } from '../components/Field';
import { useBug } from '../context/ConfigContext';

type Errors = { name?: string; email?: string; password?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Register() {
  // missing-label: the email field's label is no longer tied to the input.
  const missingLabel = useBug('missing-label');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Register – PlayLab Shop';
  }, []);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Name is required';
    else if (name.trim().length > 500) e.name = 'Name must be at most 500 characters';
    if (!email.trim()) e.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    return e;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await api<{ user: { email: string } }>('/auth/register', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password },
      });
      setDone(res.user.email);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) setErrors({ email: err.message });
      else if (err instanceof ApiRequestError && err.status === 422) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="narrow" data-testid="register-success">
        <h1>Check your email</h1>
        <p role="status">
          We have sent a confirmation link to <strong data-testid="register-success-email">{done}</strong>. You can log in straight away.
        </p>
        <p>
          <Link to="/login" className="button" data-testid="register-login-link">
            Log in
          </Link>{' '}
          <Link to={`/mailbox?email=${encodeURIComponent(done)}`} data-testid="register-mailbox-link">
            Open the test mailbox
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>Create an account</h1>
      <form onSubmit={onSubmit} noValidate data-testid="register-form">
        {formError && (
          <p className="alert error" role="alert" data-testid="register-error">
            {formError}
          </p>
        )}
        <Field
          id="register-name"
          label="Full name"
          autoComplete="name"
          value={name}
          dir="auto"
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          testId="register-name"
          hint={<span data-testid="register-name-counter">{name.length}/500 characters</span>}
        />
        <Field id="register-email" label="Email" unlabelled={missingLabel} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} testId="register-email" />
        <Field
          id="register-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          testId="register-password"
          hint="At least 8 characters"
        />
        <button type="submit" disabled={busy} data-testid="register-submit">
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account?{' '}
        <Link to="/login" data-testid="login-link">
          Log in
        </Link>
      </p>
    </div>
  );
}
