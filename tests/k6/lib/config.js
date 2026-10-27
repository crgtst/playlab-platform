// Settings every script shares. The load model (rates, durations, SLOs) is tests/shared/load-model.json, which the JMeter plans read too.
// The environment can override a figure for a quick local run (RPS, DURATION); a run with an override is not evidence for an AC.
import { check } from 'k6';

export const model = JSON.parse(open('../../shared/load-model.json'));

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

/** A figure from the model, unless the environment overrides it. */
export const figure = (envName, fallback) => (__ENV[envName] !== undefined && __ENV[envName] !== '' ? __ENV[envName] : fallback);

/** `5m`, `90s`, `1h` as seconds. */
export function seconds(duration) {
  const match = /^(\d+)(s|m|h)$/.exec(String(duration));
  if (!match) throw new Error(`Cannot read the duration "${duration}": use 90s, 5m or 1h`);
  return Number(match[1]) * { s: 1, m: 60, h: 3600 }[match[2]];
}

export const authHeaders = (token) => ({ ...JSON_HEADERS, Authorization: `Bearer ${token}` });

/** A check that stops the run with a clear message when set-up fails, rather than failing 10,000 requests later. */
export function mustBe(response, status, what) {
  const ok = check(response, { [`${what}: ${status}`]: (r) => r.status === status });
  if (!ok) throw new Error(`${what}: expected ${status}, got ${response.status} ${String(response.body).slice(0, 200)}. Is the perf stack running, with the test hooks on?`);
}
