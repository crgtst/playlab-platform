import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';
import { t } from '../lib/i18n';

export function Footer() {
  const config = useConfig();
  // Shown once the service worker controls the page, i.e. the catalogue will load offline.
  const [offlineReady, setOfflineReady] = useState(() => !!navigator.serviceWorker?.controller);
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const update = () => setOfflineReady(!!sw.controller);
    sw.addEventListener('controllerchange', update);
    return () => sw.removeEventListener('controllerchange', update);
  }, []);
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>
          {t('footer.note')}
          {offlineReady && (
            <span className="muted small" data-testid="offline-ready">
              {' '}
              · Catalogue available offline
            </span>
          )}
        </p>
        <nav aria-label="Footer">
          <a href="/api/docs" data-testid="footer-api-docs-link">
            {t('footer.apiDocs')}
          </a>
          {config.testHooks && (
            <>
              <Link to="/guide" data-testid="footer-test-guide-link">
                {t('footer.testGuide')}
              </Link>
              <Link to="/mailbox" data-testid="footer-mailbox-link">
                {t('footer.mailbox')}
              </Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
