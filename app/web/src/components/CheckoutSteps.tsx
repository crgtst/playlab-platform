import { Link } from 'react-router-dom';

const STEPS = [
  { path: '/checkout/shipping', label: 'Shipping' },
  { path: '/checkout/review', label: 'Review' },
  { path: '/checkout/payment', label: 'Payment' },
];

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Checkout progress" data-testid="checkout-steps">
      <ol className="steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          return (
            <li key={s.path} className={state} aria-current={n === current ? 'step' : undefined} data-testid={`checkout-step-${n}`}>
              {n < current ? (
                <Link to={s.path} data-testid={`checkout-step-${n}-link`}>
                  {n}. {s.label}
                </Link>
              ) : (
                <span>
                  {n}. {s.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
