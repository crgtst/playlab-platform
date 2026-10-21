import { z } from 'zod';
import { clock } from './clock';
import { luhnValid } from './payments';

export const cardSchema = z.object({
  cardNumber: z
    .string({ required_error: 'Card number is required' })
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => /^\d{12,19}$/.test(s) && luhnValid(s), 'Enter a valid card number'),
  expiry: z
    .string({ required_error: 'Expiry date is required' })
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use the format MM/YY')
    .refine((v) => !cardExpired(v), 'This card has expired'),
  cvc: z
    .string({ required_error: 'Security code is required' })
    .trim()
    .regex(/^\d{3,4}$/, 'Enter 3 or 4 digits'),
  nameOnCard: z.string({ required_error: 'Name on card is required' }).trim().min(1, 'Name on card is required').max(200),
});

export function cardExpired(expiry: string): boolean {
  const [mm, yy] = expiry.split('/').map(Number);
  const endOfMonth = Date.UTC(2000 + yy, mm, 1); // first day of the following month
  return endOfMonth <= clock.now().getTime();
}
