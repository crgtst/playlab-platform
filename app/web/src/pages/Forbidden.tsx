import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function Forbidden() {
  useEffect(() => {
    document.title = '403 Access denied – PlayLab Shop';
  }, []);
  return (
    <div data-testid="forbidden" className="narrow">
      <h1>403 – Access denied</h1>
      <p>You do not have permission to view this page.</p>
      <Link to="/" className="button" data-testid="forbidden-home-link">
        Go to the home page
      </Link>
    </div>
  );
}
