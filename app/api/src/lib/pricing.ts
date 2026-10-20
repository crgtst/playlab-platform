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

export function lineTotal(line: PricedLine): number {
  return line.unitPriceCents * line.quantity;
}

/**
 * Single source of truth for money maths. All values are integer cents.
 * - Percent codes come off goods only.
 * - Fixed codes come off goods, then delivery; the total never goes below zero.
 * - VAT is charged on the discounted goods value.
 */
export function calculateTotals(lines: PricedLine[], discount: Discount | null): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const fullDelivery = lines.length > 0 ? DELIVERY_CENTS : 0;

  let goodsDiscount = 0;
  let deliveryDiscount = 0;
  if (discount && subtotalCents > 0) {
    if (discount.type === 'percent') {
      goodsDiscount = Math.round((subtotalCents * discount.value) / 100);
    } else {
      goodsDiscount = Math.min(discount.value, subtotalCents);
      deliveryDiscount = Math.min(discount.value - goodsDiscount, fullDelivery);
    }
  }

  const goodsAfter = subtotalCents - goodsDiscount;
  const deliveryCents = fullDelivery - deliveryDiscount;
  const vatCents = Math.round(goodsAfter * VAT_RATE);
  return {
    subtotalCents,
    discountCents: goodsDiscount + deliveryDiscount,
    vatCents,
    deliveryCents,
    totalCents: goodsAfter + vatCents + deliveryCents,
  };
}
