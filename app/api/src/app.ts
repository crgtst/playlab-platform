import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { config } from './config';
import { registry } from './lib/metrics';
import { correlation } from './lib/requestContext';
import { resolveTestSession } from './lib/testSessions';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimit } from './middleware/rateLimit';
import { requestLog } from './middleware/requestLog';
import { testFaults } from './middleware/testFaults';
import { addressesRouter } from './routes/addresses';
import { authRouter } from './routes/auth';
import { cartRouter } from './routes/cart';
import { configRouter } from './routes/config';
import { healthRouter } from './routes/health';
import { ordersRouter } from './routes/orders';
import { payFrameRouter, paymentsRouter } from './routes/payments';
import { categoriesRouter, productsRouter } from './routes/products';
import { reviewsRouter } from './routes/reviews';
import { offersRouter } from './routes/offers';
import { stockRouter } from './routes/stock';
import { storesRouter } from './routes/stores';
import { testRouter } from './routes/test';
import { usersRouter } from './routes/users';
import { wishlistRouter } from './routes/wishlist';

export function loadOpenApi(): Record<string, unknown> {
  const file = path.join(process.cwd(), 'openapi', 'openapi.yaml');
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.set('etag', false); // product reads set their own ETag
  // Keep Express 4's qs parsing (Express 5 defaults to 'simple'), so nested and array query params behave as before.
  app.set('query parser', 'extended');
  // First, so every response (errors included) carries a correlation ID and gets a log line.
  app.use(correlation);
  app.use(requestLog);
  app.use(cookieParser());
  // Test sessions (header, cookie or payment-frame URL) exist only with test hooks on.
  if (config.testHooks) app.use(resolveTestSession);
  app.use(express.json({ limit: '100kb' }));
  // Express 5 leaves req.body undefined when no body was parsed; Express 4 set {}, so validation reports each missing field.
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });
  // Injected latency and failures (POST /test/latency, /test/chaos). Never applies to /test/* or /health.
  if (config.testHooks) app.use(testFaults);

  const v1 = Router();
  v1.use('/health', healthRouter);
  v1.use('/config', configRouter);
  v1.use(apiRateLimit);
  v1.use('/auth', authRouter);
  v1.use('/products/:productId/reviews', reviewsRouter);
  v1.use('/products', productsRouter);
  v1.use('/categories', categoriesRouter);
  v1.use('/cart', cartRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/addresses', addressesRouter);
  v1.use('/payments', paymentsRouter);
  v1.use('/users', usersRouter);
  v1.use('/wishlist', wishlistRouter);
  v1.use('/stock', stockRouter);
  v1.use('/stores', storesRouter);
  v1.use('/offers', offersRouter);
  app.use('/api/v1', v1);
  app.use('/pay', payFrameRouter);

  const spec = loadOpenApi();
  // Prometheus metrics (PLS-25.4): outside /api/v1, so the rate limit never applies.
  app.get('/metrics', async (_req, res) => {
    res.type(registry.contentType).send(await registry.metrics());
  });
  app.get('/api/openapi.json', (_req, res) => res.json(spec));
  app.get('/api/openapi.yaml', (_req, res) => res.type('text/yaml').send(YAML.stringify(spec)));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'PlayLab Shop API' }));

  if (config.testHooks) app.use('/test', testRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
