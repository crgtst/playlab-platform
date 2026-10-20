// The server's notion of "now". Tests can move it with POST /test/clock.
let offsetMs = 0;

export const clock = {
  now(): Date {
    return new Date(Date.now() + offsetMs);
  },
  nowMs(): number {
    return Date.now() + offsetMs;
  },
  nowSec(): number {
    return Math.floor((Date.now() + offsetMs) / 1000);
  },
  set(at: Date) {
    offsetMs = at.getTime() - Date.now();
  },
  setOffset(ms: number) {
    offsetMs = ms;
  },
  reset() {
    offsetMs = 0;
  },
  state() {
    return { now: this.now().toISOString(), offsetMs };
  },
};
