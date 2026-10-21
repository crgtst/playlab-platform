import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../api/client';
import type { Email } from '../api/types';
import { formatDateTime } from '../lib/format';

/** Fake inbox backed by GET /test/mailbox/{email}. Only works when the API runs with TEST_HOOKS=true. */
export function Mailbox() {
  const [params, setParams] = useSearchParams();
  const email = params.get('email') ?? '';
  const [input, setInput] = useState(email);
  const [messages, setMessages] = useState<Email[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Test mailbox – PlayLab Shop';
  }, []);

  const load = useCallback(async () => {
    if (!email) return;
    setError('');
    try {
      const r = await api<{ data: Email[] }>(`/mailbox/${encodeURIComponent(email)}`, { base: '/test' });
      setMessages(r.data);
    } catch (err) {
      setMessages(null);
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? 'Test hooks are switched off, so the mailbox is not available.'
          : errorMessage(err),
      );
    }
  }, [email]);

  useEffect(() => {
    setInput(email);
    load();
  }, [email, load]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) setParams({ email: input.trim() });
  };

  return (
    <div>
      <h1>Test mailbox</h1>
      <p className="muted">Emails the shop “sent”. Nothing leaves this machine.</p>
      <form onSubmit={onSubmit} className="inline-form" noValidate data-testid="mailbox-form">
        <label htmlFor="mailbox-email">Email address</label>
        <input id="mailbox-email" type="email" value={input} onChange={(e) => setInput(e.target.value)} data-testid="mailbox-email-input" />
        <button type="submit" data-testid="mailbox-open-button">
          Open mailbox
        </button>
        {email && (
          <button type="button" className="secondary" onClick={load} data-testid="mailbox-refresh-button">
            Refresh
          </button>
        )}
      </form>
      {error && (
        <p className="alert error" role="alert" data-testid="mailbox-error">
          {error}
        </p>
      )}
      {messages && messages.length === 0 && <p data-testid="mailbox-empty">No emails for {email} yet.</p>}
      {messages && messages.length > 0 && (
        <ul className="mailbox-list" data-testid="mailbox-list">
          {messages.map((m) => (
            <li key={m.id}>
              <article className="email" data-testid="mailbox-message" data-type={m.type}>
                <h2 className="h3" data-testid="mailbox-subject">
                  {m.subject}
                </h2>
                <p className="muted small">
                  To {m.to} · <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                </p>
                <pre className="email-body" data-testid="mailbox-body">
                  {m.body}
                </pre>
                {m.link && (
                  <a href={new URL(m.link).pathname + new URL(m.link).search} data-testid="mailbox-link">
                    {m.type === 'password-reset' ? 'Reset your password' : 'Confirm your email'}
                  </a>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
