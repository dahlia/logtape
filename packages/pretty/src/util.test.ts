import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "./util.ts";

// This module is the fallback used in browsers, React Native, and any other
// runtime which is neither Deno, Node.js, nor Bun, so it is exercised directly
// rather than through the `#util` import map.

test("inspect() matches JSON serialization for ordinary values", () => {
  const value = { name: "session", tags: ["a", "b"], nested: { count: 1 } };

  assert.strictEqual(inspect(value, { compact: true }), JSON.stringify(value));
  assert.strictEqual(inspect(value), JSON.stringify(value, null, 2));
});

test("inspect() renders circular references instead of throwing", () => {
  const value: Record<string, unknown> = { name: "session" };
  value.self = value;

  assert.strictEqual(
    inspect(value, { compact: true }),
    '{"name":"session","self":"[Circular]"}',
  );
  assert.strictEqual(
    inspect(value),
    '{\n  "name": "session",\n  "self": "[Circular]"\n}',
  );
});

test("inspect() renders a circular reference inside an array", () => {
  const value: Record<string, unknown> = { name: "root" };
  value.items = [value];

  assert.strictEqual(
    inspect(value, { compact: true }),
    '{"name":"root","items":["[Circular]"]}',
  );
});

test("inspect() keeps shared references that are not cycles", () => {
  const shared = { id: 1 };

  assert.strictEqual(
    inspect({ a: shared, b: shared }, { compact: true }),
    '{"a":{"id":1},"b":{"id":1}}',
  );
});
