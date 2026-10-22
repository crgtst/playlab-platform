import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { pool } from '../db/pool';
import { bugs } from './bugs';

/** Prometheus metrics for GET /metrics (PLS-25.4, 25.5). Process-wide: test sessions don't split them. */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration by method, matched route and status. Requests that match no route use route="unmatched".',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 0.8, 1, 2, 5],
  registers: [registry],
});

export const ordersCreated = new Counter({
  name: 'playlab_orders_created_total',
  help: 'Orders created (idempotent replays not counted)',
  registers: [registry],
});

export const paymentsDeclined = new Counter({
  name: 'playlab_payments_declined_total',
  help: 'Card payments the provider declined',
  registers: [registry],
});

new Gauge({
  name: 'playlab_defects_active',
  help: 'Bug-mode defects switched on: the global state, unless the scrape itself names a test session',
  registers: [registry],
  collect() {
    this.set(bugs.active().length);
  },
});

new Gauge({
  name: 'playlab_db_pool_connections',
  help: 'Database pool connections: total, idle, and requests waiting for one',
  labelNames: ['state'],
  registers: [registry],
  collect() {
    this.set({ state: 'total' }, pool.totalCount);
    this.set({ state: 'idle' }, pool.idleCount);
    this.set({ state: 'waiting' }, pool.waitingCount);
  },
});
