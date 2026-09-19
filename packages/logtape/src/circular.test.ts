import assert from "node:assert/strict";
import test from "node:test";
import {
  createCircularReplacer,
  type JsonReplacer,
  stringifyKeyWithoutCycles,
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

// The key encoding puts the serialized body and the table of replaced
// references in a `~`-prefixed envelope; spelling it out here keeps the
// expectations below readable.
function key(body: string, references: readonly unknown[]): string {
  return `~${JSON.stringify([body, references])}`;
}

test("stringifyKeyWithoutCycles() matches JSON.stringify() without cycles", () => {
  const values: readonly unknown[] = [
    null,
    0,
    "text",
    true,
    { a: 1, b: [2, 3], c: { d: null } },
    [1, "two", { three: 3 }],
    new Date(1700000000000),
    { omitted: undefined, kept: 1 },
    // Ordinary data which spells the marker is left exactly as it is.
    { ctx: { id: 1, self: "[Circular]" } },
  ];

  for (const value of values) {
    assert.strictEqual(stringifyKeyWithoutCycles(value), JSON.stringify(value));
  }

  assert.strictEqual(stringifyKeyWithoutCycles(undefined), undefined);
  assert.strictEqual(stringifyKeyWithoutCycles(() => 0), undefined);
  assert.strictEqual(
    stringifyKeyWithoutCycles({ toJSON: () => undefined }),
    undefined,
  );
});

test("stringifyKeyWithoutCycles() records a self-reference", () => {
  const value: Record<string, unknown> = { name: "session" };
  value.self = value;

  assert.strictEqual(
    stringifyKeyWithoutCycles({ ctx: value }),
    key('{"ctx":{"name":"session","self":"[Circular]"}}', [
      [["ctx", "self"], 1],
    ]),
  );
});

test("stringifyKeyWithoutCycles() records the location of a nested reference", () => {
  const value: Record<string, unknown> = { name: "root" };
  value.items = [1, [value]];

  assert.strictEqual(
    stringifyKeyWithoutCycles({ ctx: value }),
    key('{"ctx":{"name":"root","items":[1,["[Circular]"]]}}', [
      [["ctx", "items", "1", "0"], 1],
    ]),
  );
});

test("stringifyKeyWithoutCycles() distinguishes the target of a reference", () => {
  const toRoot: Record<string, unknown> = { p: {} as Record<string, unknown> };
  (toRoot.p as Record<string, unknown>).q = toRoot;
  const toParent: Record<string, unknown> = {
    p: {} as Record<string, unknown>,
  };
  (toParent.p as Record<string, unknown>).q = toParent.p;

  // The two serialize to the same body, and are told apart only by the depth
  // of the ancestor each reference points back to.
  const body = '{"ctx":{"p":{"q":"[Circular]"}}}';
  assert.strictEqual(
    stringifyKeyWithoutCycles({ ctx: toRoot }),
    key(body, [[["ctx", "p", "q"], 1]]),
  );
  assert.strictEqual(
    stringifyKeyWithoutCycles({ ctx: toParent }),
    key(body, [[["ctx", "p", "q"], 2]]),
  );
  assert.notStrictEqual(
    stringifyKeyWithoutCycles({ ctx: toRoot }),
    stringifyKeyWithoutCycles({ ctx: toParent }),
  );
});

test("stringifyKeyWithoutCycles() distinguishes a reference from the marker", () => {
  // Both values are cyclic, and differ only in which property holds the
  // reference and which merely spells the marker.
  const left: Record<string, unknown> = { right: "[Circular]" };
  left.left = left;
  const right: Record<string, unknown> = { left: "[Circular]" };
  right.right = right;

  assert.strictEqual(
    stringifyKeyWithoutCycles({ ctx: left }),
    key('{"ctx":{"right":"[Circular]","left":"[Circular]"}}', [
      [["ctx", "left"], 1],
    ]),
  );
  assert.strictEqual(
    stringifyKeyWithoutCycles({ ctx: right }),
    key('{"ctx":{"left":"[Circular]","right":"[Circular]"}}', [
      [["ctx", "right"], 1],
    ]),
  );

  // And a cyclic value is never confused with an acyclic one which spells the
  // marker in the same place.
  const faked = { ctx: { right: "[Circular]", left: "[Circular]" } };
  assert.notStrictEqual(
    stringifyKeyWithoutCycles({ ctx: left }),
    stringifyKeyWithoutCycles(faked),
  );
});

test("stringifyKeyWithoutCycles() locates references under awkward keys", () => {
  const value: Record<string, unknown> = {};
  const nested: Record<string, unknown> = {};
  value[""] = nested;
  nested["a.b"] = value;

  assert.strictEqual(
    stringifyKeyWithoutCycles(value),
    key('{"":{"a.b":"[Circular]"}}', [[["", "a.b"], 0]]),
  );
});

test("stringifyKeyWithoutCycles() records a reference spanning two values", () => {
  const first: Record<string, unknown> = {};
  const second: Record<string, unknown> = { first };
  first.second = second;

  assert.strictEqual(
    stringifyKeyWithoutCycles({ first, second }),
    key(
      '{"first":{"second":{"first":"[Circular]"}},' +
        '"second":{"first":{"second":"[Circular]"}}}',
      [[["first", "second", "first"], 1], [["second", "first", "second"], 1]],
    ),
  );
});

test("stringifyKeyWithoutCycles() sees a reference a toJSON() returns", () => {
  const value: Record<string, unknown> = {};
  value.child = { toJSON: () => ({ back: value }) };

  assert.strictEqual(
    stringifyKeyWithoutCycles(value),
    key('{"child":{"back":"[Circular]"}}', [[["child", "back"], 0]]),
  );
});

test("stringifyKeyWithoutCycles() keeps shared references that are not cycles", () => {
  const shared = { id: 1 };
  const value: Record<string, unknown> = {
    a: shared,
    b: [shared, 0, { c: shared }],
  };
  value.self = value;

  assert.strictEqual(
    stringifyKeyWithoutCycles(value),
    key(
      '{"a":{"id":1},"b":[{"id":1},0,{"c":{"id":1}}],"self":"[Circular]"}',
      [[["self"], 0]],
    ),
  );
});

test("stringifyKeyWithoutCycles() does not encode a value without references", () => {
  // The first attempt throws, but the second one replaces nothing, so the key
  // has to be the one the value gets once the getter stops throwing.
  let thrown = false;
  const value = {
    get id(): number {
      if (!thrown) {
        thrown = true;
        throw new Error("transient");
      }
      return 1;
    },
  };

  assert.strictEqual(stringifyKeyWithoutCycles(value), '{"id":1}');
  assert.strictEqual(stringifyKeyWithoutCycles(value), '{"id":1}');
});

test("stringifyKeyWithoutCycles() still rejects unsupported values", () => {
  assert.throws(() => stringifyKeyWithoutCycles(1n), TypeError);

  const value: Record<string, unknown> = { big: 1n };
  value.self = value;
  assert.throws(() => stringifyKeyWithoutCycles(value), TypeError);
});

test("stringifyKeyWithoutCycles() starts from fresh state on every call", () => {
  const value: Record<string, unknown> = { id: 1 };
  value.self = value;

  const expected = key('{"id":1,"self":"[Circular]"}', [[["self"], 0]]);
  assert.strictEqual(stringifyKeyWithoutCycles(value), expected);
  assert.strictEqual(stringifyKeyWithoutCycles(value), expected);
});
