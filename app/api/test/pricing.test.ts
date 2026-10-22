import { describe, expect, it } from 'vitest';
import { calculateTotals, DELIVERY_CENTS } from '../src/lib/pricing';

const earbuds = { unitPriceCents: 4999, quantity: 1 };

describe('calculateTotals', () => {
  it('charges nothing, not even delivery, for an empty cart', () => {
    expect(calculateTotals([], null)).toEqual({ subtotalCents: 0, discountCents: 0, vatCents: 0, deliveryCents: 0, totalCents: 0 });
  });

  it('adds 23% VAT and flat delivery', () => {
    expect(calculateTotals([earbuds], null)).toEqual({
      subtotalCents: 4999,
      discountCents: 0,
      vatCents: 1150,
      deliveryCents: DELIVERY_CENTS,
      totalCents: 6644,
    });
  });

  it('takes a percent code off goods only and charges VAT on the discounted value', () => {
    const t = calculateTotals([earbuds], { type: 'percent', value: 10 });
    expect(t.discountCents).toBe(500);
    expect(t.vatCents).toBe(1035); // 23% of 4499, rounded
    expect(t.deliveryCents).toBe(DELIVERY_CENTS);
    expect(t.totalCents).toBe(4499 + 1035 + DELIVERY_CENTS);
  });

  it('lets a fixed code larger than the goods eat into delivery but never below zero', () => {
    const t = calculateTotals([{ unitPriceCents: 1000, quantity: 1 }], { type: 'fixed', value: 2000 });
    expect(t.discountCents).toBe(1000 + DELIVERY_CENTS);
    expect(t.deliveryCents).toBe(0);
    expect(t.totalCents).toBe(0);
  });

  describe('bug-mode switches change only their own behaviour', () => {
    it('vatBeforeDiscount charges VAT on the pre-discount subtotal', () => {
      const correct = calculateTotals([earbuds], { type: 'percent', value: 10 });
      const buggy = calculateTotals([earbuds], { type: 'percent', value: 10 }, { vatBeforeDiscount: true });
      expect(buggy.vatCents).toBe(1150);
      expect({ ...buggy, vatCents: 0, totalCents: 0 }).toEqual({ ...correct, vatCents: 0, totalCents: 0 });
    });

    it('roundingBug adds a cent only with three or more items', () => {
      const two = [{ unitPriceCents: 1000, quantity: 2 }];
      const three = [{ unitPriceCents: 1000, quantity: 3 }];
      expect(calculateTotals(two, null, { roundingBug: true })).toEqual(calculateTotals(two, null));
      expect(calculateTotals(three, null, { roundingBug: true }).subtotalCents).toBe(3001);
    });

    it('allowNegative lets a fixed code push the total below zero', () => {
      const t = calculateTotals([{ unitPriceCents: 1000, quantity: 1 }], { type: 'fixed', value: 2000 }, { allowNegative: true });
      expect(t.totalCents).toBeLessThan(0);
    });
  });
});
