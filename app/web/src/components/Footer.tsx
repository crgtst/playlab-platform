import { Link } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';
import { t } from '../lib/i18n';

export function Footer() {
  const config = useConfig();
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>{t('footer.note')}</p>
        <nav aria-label="Footer">
          <a href="/api/docs" data-testid="footer-api-docs-link">
            {t('footer.apiDocs')}
          </a>
          {config.testHooks && (
            <Link to="/mailbox" data-testid="footer-mailbox-link">
              {t('footer.mailbox')}
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
