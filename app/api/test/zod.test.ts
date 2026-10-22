import { describe, expect, it } from 'vitest';
import { typeErrors, z, zod3Issues } from '../src/lib/zod';

// Validation messages are part of the API (the ACs quote them), so they must read as they did under zod 3.
// Each expected message here was recorded from the API on zod 3.24.1 before the upgrade.

function messages(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected a validation failure');
  return zod3Issues(result.error.issues).map((i) => i.message);
}

describe("zod 3's default wording", () => {
  it.each([
    ['a missing value', z.object({ a: z.string() }), {}, 'Required'],
    ['a wrong type', z.string(), 5, 'Expected string, received number'],
    ['an array for an object', z.object({}), [], 'Expected object, received array'],
    ['null', z.number(), null, 'Expected number, received null'],
    ['text that is not a number', z.coerce.number(), 'abc', 'Expected number, received nan'],
    ['a fraction for an integer', z.number().int(), 1.5, 'Expected integer, received float'],
    ['a number below a minimum', z.number().min(1), 0, 'Number must be greater than or equal to 1'],
    ['zero for a positive number', z.number().positive(), 0, 'Number must be greater than 0'],
    ['a number above a maximum', z.number().max(90), 91, 'Number must be less than or equal to 90'],
    ['a short string', z.string().min(1), '', 'String must contain at least 1 character(s)'],
    ['a long string', z.string().max(3), 'abcd', 'String must contain at most 3 character(s)'],
    ['a short array', z.array(z.number()).min(1), [], 'Array must contain at least 1 element(s)'],
    ['a bad email', z.string().email(), 'nope', 'Invalid email'],
    ['an unknown option', z.enum(['a', 'b']), 'c', "Invalid enum value. Expected 'a' | 'b', received 'c'"],
    ['a non-string option', z.enum(['a', 'b']), 5, "Expected 'a' | 'b', received number"],
    ['a wrong literal', z.literal(true), false, 'Invalid literal value, expected true'],
  ])('%s', (_name, schema, input, expected) => {
    expect(messages(schema, input)).toEqual([expected]);
  });

  it('keeps messages written in the schema', () => {
    expect(messages(z.string().min(8, 'Too short'), 'abc')).toEqual(['Too short']);
  });

  it('reports only the type error for a value of the wrong type', () => {
    expect(messages(z.string().min(8, 'Too short'), [])).toEqual(['Expected string, received array']);
    expect(messages(z.array(z.number()).min(1, 'Pick one'), '')).toEqual(['Expected array, received string']);
  });
});

describe('typeErrors', () => {
  const schema = z.object({ n: z.number(typeErrors({ required: 'n is required', invalid: 'n must be a number' })).max(5) });

  it('gives the required message for a missing value', () => {
    expect(messages(schema, {})).toEqual(['n is required']);
  });

  it('gives the invalid message for a wrong type', () => {
    expect(messages(schema, { n: 'x' })).toEqual(['n must be a number']);
  });

  it('leaves other problems with their usual message', () => {
    expect(messages(schema, { n: 6 })).toEqual(['Number must be less than or equal to 5']);
  });
});
