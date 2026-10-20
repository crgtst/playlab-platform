export const VAT_RATE = 0.23;
export const DELIVERY_CENTS = 495;

export interface PricedLine {
  unitPriceCents: number;
  quantity: number;
}

export interface Discount {
  type: 'percent' | 'fixed';
  value: number; // percent (e.g. 10) or cents
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  deliveryCents: number;
  totalCents: number;
}

/** Switches used only by bug-mode defects. All off means correct pricing. */
export interface PricingOptions {
  vatBeforeDiscount?: boolean;
  allowNegative?: boolean;
  roundingBug?: boolean;
}

export function lineTotal(line: PricedLine): number {
  return line.unitPriceCents * line.quantity;
}

/**
 * Single source of truth for money maths. All values are integer cents.
 * - Percent codes come off goods only.
 * - Fixed codes come off goods, then delivery; the total never goes below zero.
 * - VAT is charged on the discounted goods value.
 * Normally there is at most one discount; a list exists for the discount-stacking defect.
 */
export function calculateTotals(lines: PricedLine[], discounts: Discount | Discount[] | null, opts: PricingOptions = {}): Totals {
  const list = discounts === null ? [] : Array.isArray(discounts) ? discounts : [discounts];
  const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  let subtotalCents = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  if (opts.roundingBug && quantity >= 3) subtotalCents += 1;
  const fullDelivery = lines.length > 0 ? DELIVERY_CENTS : 0;

  let goodsDiscount = 0;
  let deliveryDiscount = 0;
  if (subtotalCents > 0) {
    for (const d of list) {
      const remainingGoods = subtotalCents - goodsDiscount;
      if (d.type === 'percent') {
        const amount = Math.round((subtotalCents * d.value) / 100);
        goodsDiscount += opts.allowNegative ? amount : Math.min(amount, Math.max(remainingGoods, 0));
      } else if (opts.allowNegative) {
        goodsDiscount += d.value;
      } else {
        const g = Math.min(d.value, Math.max(remainingGoods, 0));
        goodsDiscount += g;
        deliveryDiscount += Math.min(d.value - g, fullDelivery - deliveryDiscount);
      }
    }
  }

  const goodsAfter = subtotalCents - goodsDiscount;
  const deliveryCents = fullDelivery - deliveryDiscount;
  const vatCents = Math.round((opts.vatBeforeDiscount ? subtotalCents : goodsAfter) * VAT_RATE);
  return {
    subtotalCents,
    discountCents: goodsDiscount + deliveryDiscount,
    vatCents,
    deliveryCents,
    totalCents: goodsAfter + vatCents + deliveryCents,
  };
}
