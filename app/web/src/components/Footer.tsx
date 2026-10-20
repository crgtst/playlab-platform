import { Link } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';

export function Footer() {
  const config = useConfig();
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>PlayLab Shop is a practice site. Nothing here is for sale.</p>
        <nav aria-label="Footer">
          <a href="/api/docs" data-testid="footer-api-docs-link">
            API docs
          </a>
          {config?.testHooks && (
            <Link to="/mailbox" data-testid="footer-mailbox-link">
              Test mailbox
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
