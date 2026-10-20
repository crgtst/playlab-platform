import { Router } from 'express';
import { config } from '../config';
import { bugs } from '../lib/bugs';

export const GBP_RATE = 0.85;

export const configRouter = Router();

/** Public runtime settings for the web app. */
configRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    paymentFrameUrl: config.paymentFrameUrl,
    testHooks: config.testHooks,
    // EUR is the only real currency; GBP is a display conversion at this fixed rate.
    currencies: { EUR: 1, GBP: GBP_RATE },
    // Bug-mode defects the web app or payment frame must act out (empty unless TEST_HOOKS=true).
    bugs: bugs.active(),
  });
});
