import { z } from 'zod';

// Validation messages reach clients in error.details, and the ACs quote them, so they must not change with the zod
// version. zod 4 reworded its defaults ("Required" became "Invalid input: expected string, received undefined"), so this
// puts zod 3's English wording back. Messages written in a schema still win; this only fills in the defaults.
// Schemas import z from here rather than from 'zod', so the wording is set before any of them runs.

/** zod 3's names for what it received. */
function receivedType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isNaN(v) ? 'nan' : Number.isFinite(v) ? 'number' : String(v);
  if (v instanceof Date) return 'date';
  if (v instanceof Map) return 'map';
  if (v instanceof Set) return 'set';
  if (v instanceof Promise) return 'promise';
  return typeof v;
}

const joinValues = (values: readonly unknown[], separator = ' | ') =>
  values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(separator);

// zod 3's words for a size limit, as [exact, inclusive, exclusive].
const SIZE_WORDS = {
  string: { min: ['exactly', 'at least', 'over'], max: ['exactly', 'at most', 'under'] },
  array: { min: ['exactly', 'at least', 'more than'], max: ['exactly', 'at most', 'less than'] },
  number: {
    min: ['exactly equal to', 'greater than or equal to', 'greater than'],
    max: ['exactly', 'less than or equal to', 'less than'],
  },
};

function sizeMessage(origin: string, bound: 'min' | 'max', limit: number | bigint, inclusive = false, exact = false): string {
  const kind = origin === 'string' || origin === 'array' ? origin : ['number', 'int', 'bigint'].includes(origin) ? 'number' : null;
  if (!kind) return 'Invalid input';
  const word = SIZE_WORDS[kind][bound][exact ? 0 : inclusive ? 1 : 2];
  if (kind === 'number') return `Number must be ${word} ${limit}`;
  return kind === 'string' ? `String must contain ${word} ${limit} character(s)` : `Array must contain ${word} ${limit} element(s)`;
}

export function zod3Message(iss: z.core.$ZodRawIssue): string {
  if (iss.input === undefined && (iss.code === 'invalid_type' || iss.code === 'invalid_value')) return 'Required';
  switch (iss.code) {
    case 'invalid_type':
      if (iss.expected === 'int') return 'Expected integer, received float';
      return `Expected ${iss.expected}, received ${receivedType(iss.input)}`;
    case 'invalid_value':
      if (iss.inst instanceof z.ZodLiteral) return `Invalid literal value, expected ${JSON.stringify(iss.values[0])}`;
      // zod 3 reported a non-string given to an enum as a type error.
      if (typeof iss.input !== 'string') return `Expected ${joinValues(iss.values)}, received ${receivedType(iss.input)}`;
      return `Invalid enum value. Expected ${joinValues(iss.values)}, received '${iss.input}'`;
    case 'too_small':
      return sizeMessage(iss.origin, 'min', iss.minimum, iss.inclusive, iss.exact);
    case 'too_big':
      return sizeMessage(iss.origin, 'max', iss.maximum, iss.inclusive, iss.exact);
    case 'invalid_format':
      if (iss.format === 'regex') return 'Invalid';
      return `Invalid ${iss.format === 'guid' ? 'uuid' : iss.format}`;
    case 'not_multiple_of':
      return `Number must be a multiple of ${iss.divisor}`;
    case 'unrecognized_keys':
      return `Unrecognized key(s) in object: ${joinValues(iss.keys, ', ')}`;
    default:
      return 'Invalid input';
  }
}

z.config({ customError: zod3Message });

/**
 * zod 3 stopped checking a value once it had the wrong type. zod 4 still runs length checks on anything with a length,
 * so `password: []` also gets "Password must be at least 8 characters". This drops those follow-on issues.
 */
export function zod3Issues(issues: readonly z.core.$ZodIssue[]): z.core.$ZodIssue[] {
  const wrongType = new Set<string>();
  return issues.filter((i) => {
    const key = JSON.stringify(i.path);
    if (wrongType.has(key)) return false;
    if (i.code === 'invalid_type') wrongType.add(key);
    return true;
  });
}

/**
 * zod 3's required_error and invalid_type_error: the message for a missing value, and for a value of the wrong type.
 * Any other problem keeps its usual message.
 */
export function typeErrors(messages: { required?: string; invalid?: string }) {
  return {
    error: (iss: z.core.$ZodRawIssue) =>
      iss.code !== 'invalid_type' ? undefined : iss.input === undefined ? messages.required : messages.invalid,
  };
}

export { z };
