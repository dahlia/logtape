import assert from "node:assert/strict";
import test from "node:test";
import {
  createCircularReplacer,
  type JsonReplacer,
  stringifyWithoutCycles,
} from "./circular.ts";

// Mimics the error serializer in formatter.ts: it allocates a fresh object
// every time it sees an Error, so the replaced values are never identical
// even when the original ones are.
const errorReplacer: JsonReplacer = (_key, value) => {
  if (!(value instanceof Error)) return value;
  const serialized: Record<string, unknown> = {
    name: value.name,
    message: value.message,
  };
  const cause = (value as { cause?: unknown }).cause;
  if (cause !== undefined) serialized.cause = cause;
  if (value instanceof AggregateError) serialized.errors = value.errors;
  return serialized;
};

test("createCircularReplacer() renders a self-reference as [Circular]", () => {
  const value: Record<string, unknown> = { name: "session" };
  value.self = value;

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(value, createCircularReplacer())),
    { name: "session", self: "[Circular]" },
  );
});

test("createCircularReplacer() renders an indirect cycle as [Circular]", () => {
  const outer: Record<string, unknown> = { depth: 0 };
  const inner: Record<string, unknown> = { depth: 1, outer };
  outer.inner = inner;

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(outer, createCircularReplacer())),
    { depth: 0, inner: { depth: 1, outer: "[Circular]" } },
  );
});

test("createCircularReplacer() renders a cycle through an array", () => {
  const value: Record<string, unknown> = { name: "root" };
  value.items = [1, [value]];

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(value, createCircularReplacer())),
    { name: "root", items: [1, ["[Circular]"]] },
  );
});

test("createCircularReplacer() keeps shared references that are not cycles", () => {
  const shared = { id: 1 };
  const value = { a: shared, b: shared, c: [shared, shared] };

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(value, createCircularReplacer())),
    { a: { id: 1 }, b: { id: 1 }, c: [{ id: 1 }, { id: 1 }] },
  );
});

test("createCircularReplacer() detects a self-referencing error cause", () => {
  const error = new Error("boom") as Error & { cause?: unknown };
  error.cause = error;

  const actual = JSON.parse(
    JSON.stringify(error, createCircularReplacer(errorReplacer)),
  );

  assert.deepStrictEqual(actual, {
    name: "Error",
    message: "boom",
    cause: "[Circular]",
  });
});

test("createCircularReplacer() detects mutually referencing error causes", () => {
  const first = new Error("first") as Error & { cause?: unknown };
  const second = new Error("second") as Error & { cause?: unknown };
  first.cause = second;
  second.cause = first;

  const actual = JSON.parse(
    JSON.stringify(first, createCircularReplacer(errorReplacer)),
  );

  assert.deepStrictEqual(actual, {
    name: "Error",
    message: "first",
    cause: { name: "Error", message: "second", cause: "[Circular]" },
  });
});

test("createCircularReplacer() detects a self-containing AggregateError", () => {
  const error = new AggregateError([], "aggregate");
  error.errors.push(error);

  const actual = JSON.parse(
    JSON.stringify(error, createCircularReplacer(errorReplacer)),
  );

  assert.deepStrictEqual(actual, {
    name: "AggregateError",
    message: "aggregate",
    errors: ["[Circular]"],
  });
});

test("createCircularReplacer() keeps an error reached twice as siblings", () => {
  const error = new Error("shared");
  const value = { first: error, second: error };

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(value, createCircularReplacer(errorReplacer))),
    {
      first: { name: "Error", message: "shared" },
      second: { name: "Error", message: "shared" },
    },
  );
});

test("stringifyWithoutCycles() matches JSON.stringify() without cycles", () => {
  const values: readonly unknown[] = [
    null,
    0,
    "text",
    true,
    { a: 1, b: [2, 3], c: { d: null } },
    [1, "two", { three: 3 }],
    new Date(1700000000000),
    { omitted: undefined, kept: 1 },
  ];

  for (const value of values) {
    assert.strictEqual(stringifyWithoutCycles(value), JSON.stringify(value));
    assert.strictEqual(
      stringifyWithoutCycles(value, undefined, 2),
      JSON.stringify(value, null, 2),
    );
  }

  assert.strictEqual(stringifyWithoutCycles(undefined), undefined);
  assert.strictEqual(stringifyWithoutCycles(() => 0), undefined);
});

test("stringifyWithoutCycles() serializes cyclic values", () => {
  const value: Record<string, unknown> = { name: "session" };
  value.self = value;

  assert.strictEqual(
    stringifyWithoutCycles(value),
    '{"name":"session","self":"[Circular]"}',
  );
  assert.strictEqual(
    stringifyWithoutCycles(value, undefined, 2),
    '{\n  "name": "session",\n  "self": "[Circular]"\n}',
  );
});

test("stringifyWithoutCycles() still rejects unsupported values", () => {
  assert.throws(() => stringifyWithoutCycles(1n), TypeError);

  const value: Record<string, unknown> = { big: 1n };
  value.self = value;
  assert.throws(() => stringifyWithoutCycles(value), TypeError);
});

test("stringifyWithoutCycles() starts from fresh state on every call", () => {
  const shared: Record<string, unknown> = { id: 1 };
  shared.self = shared;

  const expected = '{"id":1,"self":"[Circular]"}';
  assert.strictEqual(stringifyWithoutCycles(shared), expected);
  assert.strictEqual(stringifyWithoutCycles(shared), expected);
});
