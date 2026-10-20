import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors';
import { sendError } from './errorHandler';

/** Fault injection for POST /test/latency and POST /test/chaos. Only mounted when TEST_HOOKS=true. */

export interface LatencyRule {
  id: number;
  path: string;
  method: string | null;
  delayMs: number;
}

export interface ChaosRule {
  id: number;
  path: string;
  method: string | null;
  failureRate: number;
  failNext: number | null;
  status: number;
  failed: number;
}

let nextId = 1;
const latencyRules: LatencyRule[] = [];
const chaosRules: ChaosRule[] = [];

function toRegex(pattern: string): RegExp {
  const escaped = pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${escaped}$`);
}

function matches(rule: { path: string; method: string | null }, req: Request): boolean {
  if (rule.method && rule.method !== req.method) return false;
  return toRegex(rule.path).test(req.originalUrl.split('?')[0]);
}

export const faults = {
  addLatency(rule: Omit<LatencyRule, 'id'>): LatencyRule {
    const r = { id: nextId++, ...rule };
    latencyRules.push(r);
    return r;
  },
  addChaos(rule: Omit<ChaosRule, 'id' | 'failed'>): ChaosRule {
    const r = { id: nextId++, failed: 0, ...rule };
    chaosRules.push(r);
    return r;
  },
  latency: () => [...latencyRules],
  chaos: () => [...chaosRules],
  clearLatency: () => void latencyRules.splice(0),
  clearChaos: () => void chaosRules.splice(0),
  clearAll() {
    latencyRules.splice(0);
    chaosRules.splice(0);
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function testFaults(req: Request, res: Response, next: NextFunction) {
  const path = req.originalUrl.split('?')[0];
  if (path.startsWith('/test') || path.startsWith('/api/v1/health')) return next();

  const delay = latencyRules.filter((r) => matches(r, req)).reduce((sum, r) => sum + r.delayMs, 0);
  if (delay > 0) await sleep(delay);

  for (const rule of chaosRules) {
    if (!matches(rule, req)) continue;
    let fail: boolean;
    if (rule.failNext !== null) {
      fail = rule.failed < rule.failNext;
    } else {
      fail = Math.random() < rule.failureRate;
    }
    if (fail) {
      rule.failed++;
      res.setHeader('X-Chaos-Rule', String(rule.id));
      return sendError(res, new ApiError(rule.status, 'CHAOS_INJECTED', `Injected failure (rule ${rule.id})`, { ruleId: rule.id }));
    }
  }
  next();
}
