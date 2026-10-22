import { config } from '../config';
import { ApiError } from './errors';
import { paymentsDeclined } from './metrics';

export const TEST_CARDS = {
  success: '4242424242424242',
  decline: '4000000000000002',
  timeout: '4000000000000119',
} as const;

export function luhnValid(number: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return number.length >= 12 && sum % 10 === 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fake payment provider. Resolves on success, throws 402 on decline and 504 after a delay on timeout. */
export async function chargeCard(cardNumber: string): Promise<void> {
  if (cardNumber === TEST_CARDS.decline) {
    paymentsDeclined.inc();
    throw new ApiError(402, 'PAYMENT_DECLINED', 'Your card was declined');
  }
  if (cardNumber === TEST_CARDS.timeout) {
    await sleep(config.paymentTimeoutMs);
    throw new ApiError(504, 'PAYMENT_TIMEOUT', 'The payment provider did not respond in time. Please try again.');
  }
}
