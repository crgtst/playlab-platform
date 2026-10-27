// Prints the -J properties for a plan, from tests/shared/load-model.json, so JMeter runs the same model as k6.
//
//   node lib/model.mjs products|journey|soak|overload      (RPS and DURATION in the environment override it; DURATION as 90s, 5m or 1h)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(here, '../../shared/load-model.json'), 'utf8'));

export function seconds(text) {
  const m = /^(\d+)(s|m|h)$/.exec(String(text));
  if (!m) throw new Error(`Cannot read the duration "${text}": use 90s, 5m or 1h`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
}

export function propertiesFor(plan, env = process.env) {
  const rps = (fallback) => env.RPS || fallback;
  const duration = (fallback) => seconds(env.DURATION || fallback);
  switch (plan) {
    case 'products':
      return { rps: rps(model.products.rps), duration: duration(model.products.duration) };
    case 'journey':
      return { rps: rps(model.orders.rps), duration: duration(model.orders.duration) };
    case 'soak':
      return { rps: rps(model.soak.rps), duration: duration(model.soak.duration) };
    case 'overload': {
      const o = model.overload;
      const overloadSeconds = seconds(env.OVERLOAD_DURATION || o.overloadDuration);
      return {
        overload_rps: rps(o.overloadRps),
        overload_seconds: overloadSeconds,
        recovery_rps: o.recoveryRps,
        recovery_seconds: Number(env.RECOVERY_SECONDS || o.recoverySeconds),
        recovered_seconds: 30,
        // The timers need the whole test's length to pace themselves.
        duration: overloadSeconds + Number(env.RECOVERY_SECONDS || o.recoverySeconds) + 30,
      };
    }
    default:
      throw new Error(`Unknown plan "${plan}": use products, journey, soak or overload`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(
    Object.entries(propertiesFor(process.argv[2]))
      .map(([k, v]) => `-J${k}=${v}`)
      .join(' '),
  );
}
