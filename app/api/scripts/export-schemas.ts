// Exports the OpenAPI component schemas as JSON Schema (draft-07) files in tests/shared/schemas/, one per component,
// for the suites that validate responses against a schema (Karate, REST Assured, Postman with ajv).
//
//   npm run export:schemas
//
// A unit test fails when the committed files no longer match the OpenAPI file, so rerun this after editing it.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const OPENAPI_FILE = path.join(__dirname, '../openapi/openapi.yaml');
export const SCHEMAS_DIR = path.join(__dirname, '../../../tests/shared/schemas');

type Json = { [key: string]: unknown };

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Turns one OpenAPI 3.0 schema into draft-07 JSON Schema:
 * - `nullable: true` becomes a `null` type (or an `anyOf` with null, for a `$ref` or composed schema);
 * - `example` becomes `examples`;
 * - `#/components/schemas/X` references point at the sibling file `X.json`.
 */
export function toJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toJsonSchema);
  if (!isObject(schema)) return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'nullable') continue;
    if (key === 'example') out.examples = [value];
    else if (key === '$ref' && typeof value === 'string') out.$ref = value.replace(/^#\/components\/schemas\/(.+)$/, '$1.json');
    else if (key === 'properties' && isObject(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, s]) => [name, toJsonSchema(s)]));
    } else out[key] = toJsonSchema(value);
  }
  if (schema.nullable !== true) return out;
  if (typeof out.type === 'string') {
    out.type = [out.type, 'null'];
    if (Array.isArray(out.enum)) out.enum = [...out.enum, null];
    return out;
  }
  // A $ref ignores its siblings, so wrap it.
  const { description, ...rest } = out;
  return { ...(description === undefined ? {} : { description }), anyOf: [rest, { type: 'null' }] };
}

export function readOpenApi(): Json {
  return YAML.parse(fs.readFileSync(OPENAPI_FILE, 'utf8'));
}

/** File name to file contents, for every component schema. */
export function buildSchemaFiles(openapi: Json = readOpenApi()): Map<string, string> {
  const schemas = (openapi.components as Json).schemas as Json;
  const files = new Map<string, string>();
  for (const [name, schema] of Object.entries(schemas)) {
    const body = { $schema: 'http://json-schema.org/draft-07/schema#', title: name, ...(toJsonSchema(schema) as Json) };
    files.set(`${name}.json`, JSON.stringify(body, null, 2) + '\n');
  }
  return files;
}

if (require.main === module) {
  const files = buildSchemaFiles();
  fs.rmSync(SCHEMAS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCHEMAS_DIR, { recursive: true });
  for (const [name, body] of files) fs.writeFileSync(path.join(SCHEMAS_DIR, name), body);
  console.log(`Wrote ${files.size} schemas to ${path.relative(process.cwd(), SCHEMAS_DIR)}`);
}
