import { Router } from 'express';
import { config } from '../config';

export const configRouter = Router();

/** Public runtime settings for the web app. */
configRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ paymentFrameUrl: config.paymentFrameUrl, testHooks: config.testHooks });
});
