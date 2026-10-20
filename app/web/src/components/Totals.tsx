import type { Cart, Totals as TotalsType } from '../api/types';
import { formatPrice } from '../lib/format';

interface Props {
  totals: TotalsType;
  discount?: Cart['discount'] | { code: string; amountCents: number } | null;
}

export function Totals({ totals, discount }: Props) {
  return (
    <dl className="totals" data-testid="totals">
      <div>
        <dt>Subtotal</dt>
        <dd data-testid="totals-subtotal" data-cents={totals.subtotalCents}>
          {formatPrice(totals.subtotalCents)}
        </dd>
      </div>
      {totals.discountCents > 0 && (
        <div className="saving">
          <dt>Discount{discount ? ` (${discount.code})` : ''}</dt>
          <dd data-testid="totals-discount" data-cents={totals.discountCents}>
            −{formatPrice(totals.discountCents)}
          </dd>
        </div>
      )}
      <div>
        <dt>VAT (23%)</dt>
        <dd data-testid="totals-vat" data-cents={totals.vatCents}>
          {formatPrice(totals.vatCents)}
        </dd>
      </div>
      <div>
        <dt>Delivery</dt>
        <dd data-testid="totals-delivery" data-cents={totals.deliveryCents}>
          {formatPrice(totals.deliveryCents)}
        </dd>
      </div>
      <div className="grand">
        <dt>Total</dt>
        <dd data-testid="totals-total" data-cents={totals.totalCents}>
          {formatPrice(totals.totalCents)}
        </dd>
      </div>
    </dl>
  );
}
