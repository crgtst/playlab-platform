import { sessionScoped } from './testSessions';

// The server's notion of "now". Tests can move it with POST /test/clock; each test session has its own offset.
const offset = sessionScoped(() => ({ ms: 0 }));

export const clock = {
  now(): Date {
    return new Date(Date.now() + offset().ms);
  },
  nowMs(): number {
    return Date.now() + offset().ms;
  },
  nowSec(): number {
    return Math.floor((Date.now() + offset().ms) / 1000);
  },
  set(at: Date) {
    offset().ms = at.getTime() - Date.now();
  },
  setOffset(ms: number) {
    offset().ms = ms;
  },
  reset() {
    offset().ms = 0;
  },
  state() {
    return { now: this.now().toISOString(), offsetMs: offset().ms };
  },
};
