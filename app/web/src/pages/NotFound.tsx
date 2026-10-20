import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div data-testid="not-found">
      <h1>Page not found</h1>
      <p>We could not find that page.</p>
      <Link to="/" data-testid="not-found-home-link">
        Go to the home page
      </Link>
    </div>
  );
}
