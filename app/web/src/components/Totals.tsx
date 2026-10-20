import type { Cart, Currency, Totals as TotalsType } from '../api/types';
import { formatPrice } from '../lib/format';
import { t } from '../lib/i18n';
import { Tooltip } from './Tooltip';

interface Props {
  totals: TotalsType;
  discount?: Cart['discount'] | { code: string; amountCents: number } | null;
  /** Forces a currency; normally the shopper's chosen currency is used. */
  currency?: Currency;
}

export function Totals({ totals, discount, currency }: Props) {
  const money = (cents: number) => formatPrice(cents, { currency });
  return (
    <dl className="totals" data-testid="totals">
      <div>
        <dt>{t('totals.subtotal')}</dt>
        <dd data-testid="totals-subtotal" data-cents={totals.subtotalCents}>
          {money(totals.subtotalCents)}
        </dd>
      </div>
      {totals.discountCents > 0 && (
        <div className="saving">
          <dt>
            {t('totals.discount')}
            {discount ? ` (${discount.code})` : ''}
          </dt>
          <dd data-testid="totals-discount" data-cents={totals.discountCents}>
            −{money(totals.discountCents)}
          </dd>
        </div>
      )}
      <div>
        <dt>
          {t('totals.vat')}{' '}
          <Tooltip content={t('totals.vatTooltip')} testId="vat-tooltip">
            <button type="button" className="info-button" aria-label={t('totals.vatInfo')} data-testid="vat-info-button">
              i
            </button>
          </Tooltip>
        </dt>
        <dd data-testid="totals-vat" data-cents={totals.vatCents}>
          {money(totals.vatCents)}
        </dd>
      </div>
      <div>
        <dt>{t('totals.delivery')}</dt>
        <dd data-testid="totals-delivery" data-cents={totals.deliveryCents}>
          {money(totals.deliveryCents)}
        </dd>
      </div>
      <div className="grand">
        <dt>{t('totals.total')}</dt>
        <dd data-testid="totals-total" data-cents={totals.totalCents}>
          {money(totals.totalCents)}
        </dd>
      </div>
    </dl>
  );
}
