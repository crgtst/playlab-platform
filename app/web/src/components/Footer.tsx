import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  const [hooks, setHooks] = useState(false);

  useEffect(() => {
    fetch('/test', { headers: { Accept: 'application/json' } })
      .then((r) => setHooks(r.ok))
      .catch(() => setHooks(false));
  }, []);

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>PlayLab Shop is a practice site. Nothing here is for sale.</p>
        <nav aria-label="Footer">
          <a href="/api/docs" data-testid="footer-api-docs-link">
            API docs
          </a>
          {hooks && (
            <Link to="/mailbox" data-testid="footer-mailbox-link">
              Test mailbox
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
