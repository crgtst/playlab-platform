import { useEffect, useState } from 'react';
import { api, ApiRequestError, errorMessage } from '../api/client';
import type { TestGuide as Guide } from '../api/types';
import { CopyButton } from '../components/CopyButton';

/** Accounts, cards, codes, fixtures, scenarios and defects on one page, from GET /test/guide (PLS-12.7). Only works with TEST_HOOKS=true. */
export function TestGuide() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Test guide – PlayLab Shop';
    api<Guide>('/guide', { base: '/test' })
      .then(setGuide)
      .catch((err) =>
        setError(
          err instanceof ApiRequestError && err.status === 404
            ? 'Test hooks are switched off, so the test guide is not available.'
            : errorMessage(err),
        ),
      );
  }, []);

  if (error)
    return (
      <p className="alert error" role="alert" data-testid="guide-error">
        {error}
      </p>
    );
  if (!guide) return <p>Loading…</p>;

  return (
    <div className="test-guide">
      <h1>Test guide</h1>
      <p className="muted">
        Everything you need to start testing, in one place. Nothing here works unless the API runs with test hooks on, and none of it is
        safe for real data.
      </p>
      <p data-testid="guide-links">
        {guide.links.map((l) => (
          <a key={l.href} href={l.href} className="guide-link">
            {l.label}
          </a>
        ))}
      </p>

      <section className="panel" aria-labelledby="guide-accounts">
        <h2 id="guide-accounts">Test accounts</h2>
        <div className="table-scroll">
          <table className="guide-table" data-testid="guide-accounts">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Email</th>
                <th scope="col">Password</th>
                <th scope="col">Name</th>
              </tr>
            </thead>
            <tbody>
              {guide.accounts.map((a) => (
                <tr key={a.email}>
                  <th scope="row">{a.role}</th>
                  <td>
                    <code>{a.email}</code> <CopyButton text={a.email} label="Copy email" testId={`guide-copy-email-${a.role}`} />
                  </td>
                  <td>
                    <code>{a.password}</code>{' '}
                    <CopyButton text={a.password} shown="password" label="Copy password" testId={`guide-copy-password-${a.role}`} />
                  </td>
                  <td>{a.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="guide-cards">
        <h2 id="guide-cards">Test cards</h2>
        <p className="muted">
          Any name, expiry <code>{guide.cards.defaults.expiry}</code> or later, CVC <code>{guide.cards.defaults.cvc}</code>.
        </p>
        <div className="table-scroll">
          <table className="guide-table" data-testid="guide-cards">
            <thead>
              <tr>
                <th scope="col">Card number</th>
                <th scope="col">What happens</th>
              </tr>
            </thead>
            <tbody>
              {guide.cards.list.map((c) => (
                <tr key={c.kind}>
                  <th scope="row">
                    <code>{c.number}</code>{' '}
                    <CopyButton text={c.number.replace(/ /g, '')} shown={c.number} label="Copy" testId={`guide-copy-card-${c.kind}`} />
                  </th>
                  <td>{c.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="guide-codes">
        <h2 id="guide-codes">Discount codes and fixtures</h2>
        <p className="muted">
          The codes below exist after a reset. The others come from fixtures: <code>POST /test/seed</code> with{' '}
          <code>{'{"fixtures":["expired-discount"]}'}</code>.
        </p>
        <ul data-testid="guide-discounts">
          {guide.discounts.map((d) => (
            <li key={d.code}>
              <code>{d.code}</code>: {d.description}
            </li>
          ))}
        </ul>
        <ul data-testid="guide-fixtures">
          {guide.fixtures.map((f) => (
            <li key={f.name}>
              <code>{f.name}</code>: {f.description}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="guide-scenarios">
        <h2 id="guide-scenarios">Scenarios to try</h2>
        <div data-testid="guide-scenarios">
          {guide.scenarios.map((s) => (
            <details key={s.title}>
              <summary>
                {s.title} <span className="muted small">({s.ac})</span>
              </summary>
              <ol>
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="guide-bugs">
        <h2 id="guide-bugs">Defects</h2>
        <p className="muted">
          {guide.bugs.length} planted defects. Switch them on with <code>POST /test/bugs</code>. This is the state for your session.
        </p>
        <div className="table-scroll">
          <table className="guide-table" data-testid="guide-bugs">
            <thead>
              <tr>
                <th scope="col">Defect</th>
                <th scope="col">State</th>
                <th scope="col">Breaks</th>
                <th scope="col">What you will see</th>
              </tr>
            </thead>
            <tbody>
              {guide.bugs.map((b) => (
                <tr key={b.name} data-testid="guide-bug" data-enabled={b.enabled}>
                  <th scope="row">
                    <code>{b.name}</code>
                  </th>
                  <td>{b.enabled ? 'On' : 'Off'}</td>
                  <td>{b.ac}</td>
                  <td>{b.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="guide-hooks">
        <h2 id="guide-hooks">Test hooks</h2>
        <ul data-testid="guide-hooks">
          {guide.hooks.map((h) => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
