import { useCallback, useState } from 'react';
import type { ShippingAddress } from '../api/types';

/** Checkout progress survives a refresh (sessionStorage). Card details are never stored. */
export interface CheckoutState {
  shipping: ShippingAddress;
  deliveryDate: string;
  instructions: string;
  acceptPriceChanges: boolean;
  shippingComplete: boolean;
}

const KEY = 'playlab.checkout';

export const emptyShipping: ShippingAddress = {
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  county: '',
  postcode: '',
  country: 'IE',
  phone: '',
};

const initial: CheckoutState = {
  shipping: emptyShipping,
  deliveryDate: '',
  instructions: '',
  acceptPriceChanges: false,
  shippingComplete: false,
};

// Module-level copy so every page sees updates immediately (and state survives if storage is blocked).
let current: CheckoutState | null = null;

function read(): CheckoutState {
  if (current) return current;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw);
    current = { ...initial, ...parsed, shipping: { ...emptyShipping, ...(parsed?.shipping ?? {}) } };
    return current!;
  } catch {
    return initial;
  }
}

function write(next: CheckoutState) {
  current = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearCheckoutState() {
  current = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function useCheckoutState() {
  const [state, setState] = useState<CheckoutState>(read);
  // Persist synchronously, not inside a state updater: the next page may mount before React re-renders.
  const update = useCallback((patch: Partial<CheckoutState>) => {
    const next = { ...read(), ...patch };
    write(next);
    setState(next);
  }, []);
  return [state, update] as const;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Delivery can be booked from tomorrow up to 30 days ahead. */
export function deliveryWindow(): { min: string; max: string } {
  const now = new Date();
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  return { min: isoDay(min), max: isoDay(max) };
}
