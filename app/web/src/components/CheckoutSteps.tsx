import { Link } from 'react-router-dom';
import { MessageKey, t } from '../lib/i18n';

const STEPS: { path: string; label: MessageKey }[] = [
  { path: '/checkout/shipping', label: 'checkout.step1' },
  { path: '/checkout/review', label: 'checkout.step2' },
  { path: '/checkout/payment', label: 'checkout.step3' },
];

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label={t('checkout.progress')} data-testid="checkout-steps">
      <ol className="steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          return (
            <li key={s.path} className={state} aria-current={n === current ? 'step' : undefined} data-testid={`checkout-step-${n}`}>
              {n < current ? (
                <Link to={s.path} data-testid={`checkout-step-${n}-link`}>
                  {n}. {t(s.label)}
                </Link>
              ) : (
                <span>
                  {n}. {t(s.label)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
