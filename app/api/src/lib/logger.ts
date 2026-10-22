import pino from 'pino';
import { Writable } from 'stream';
import { config } from '../config';

/** One JSON object per log line, as written to stdout and kept for GET /test/logs. */
export type LogLine = Record<string, unknown> & { correlationId?: string };

export const REDACTED = '[REDACTED]';

// Secrets never reach the logs (PLS-25.3): credentials, tokens and card details, wherever they appear in a request.
const SECRET_FIELDS = [
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'refreshToken',
  'clientSecret',
  'cardNumber',
  'cvc',
  'expiry',
];
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.secret',
  'req.query.token',
  ...SECRET_FIELDS.flatMap((f) => [`req.body.${f}`, `req.body.*.${f}`]),
];

// The most recent lines, after redaction, for GET /test/logs.
const MAX_LINES = 5000;
const recent: LogLine[] = [];
const memory = new Writable({
  write(chunk, _encoding, done) {
    recent.push(JSON.parse(chunk.toString()));
    if (recent.length > MAX_LINES) recent.splice(0, recent.length - MAX_LINES);
    done();
  },
});

const streams: pino.StreamEntry[] = [{ level: 'info', stream: memory }];
if (config.logLevel !== 'silent') streams.push({ level: config.logLevel as pino.Level, stream: process.stdout });

export const logger = pino(
  {
    level: 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: REDACTED },
  },
  pino.multistream(streams),
);

export const logs = {
  forCorrelationId: (id: string) => recent.filter((l) => l.correlationId === id),
  clear: () => void recent.splice(0),
};
