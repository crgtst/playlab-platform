import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Offer } from '../api/types';
import { useBug } from '../context/ConfigContext';
import { CopyButton } from './CopyButton';

/** "Current offers": public discount codes, each with a copy-to-clipboard button. */
export function OffersStrip() {
  const [offers, setOffers] = useState<Offer[]>([]);
  // clipboard-wrong-value: each button copies the previous code in the list (the first copies the last).
  const wrongValue = useBug('clipboard-wrong-value');

  useEffect(() => {
    api<{ data: Offer[] }>('/offers')
      .then((r) => setOffers(r.data))
      .catch(() => setOffers([]));
  }, []);

  if (offers.length === 0) return null;
  return (
    <section className="offers-strip" aria-labelledby="offers-heading" data-testid="offers-strip">
      <h2 id="offers-heading" className="h3">
        Current offers
      </h2>
      <ul>
        {offers.map((o, i) => {
          const copied = wrongValue ? offers[(i - 1 + offers.length) % offers.length].code : o.code;
          return (
            <li key={o.code} data-testid="offer" data-code={o.code}>
              <strong className="offer-code" data-testid="offer-code">
                {o.code}
              </strong>{' '}
              <span>{o.description}</span>{' '}
              <CopyButton text={copied} shown={o.code} label={`Copy code ${o.code}`} testId={`copy-code-${o.code}`} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
