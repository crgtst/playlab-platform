import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimit } from './middleware/rateLimit';
import { addressesRouter } from './routes/addresses';
import { authRouter } from './routes/auth';
import { cartRouter } from './routes/cart';
import { healthRouter } from './routes/health';
import { ordersRouter } from './routes/orders';
import { categoriesRouter, productsRouter } from './routes/products';
import { testRouter } from './routes/test';

export function loadOpenApi(): Record<string, unknown> {
  const file = path.join(process.cwd(), 'openapi', 'openapi.yaml');
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.set('etag', false); // product reads set their own ETag
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  const v1 = Router();
  v1.use('/health', healthRouter);
  v1.use(apiRateLimit);
  v1.use('/auth', authRouter);
  v1.use('/products', productsRouter);
  v1.use('/categories', categoriesRouter);
  v1.use('/cart', cartRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/addresses', addressesRouter);
  app.use('/api/v1', v1);

  const spec = loadOpenApi();
  app.get('/api/openapi.json', (_req, res) => res.json(spec));
  app.get('/api/openapi.yaml', (_req, res) => res.type('text/yaml').send(YAML.stringify(spec)));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'PlayLab Shop API' }));

  if (config.testHooks) app.use('/test', testRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
