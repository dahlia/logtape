import assert from "node:assert/strict";
import test from "node:test";
import type { LogLevel, LogRecord } from "@logtape/logtape";
import { getWorkersConsoleSink } from "./mod.ts";

test("getWorkersConsoleSink() emits one structured argument at each level", () => {
  const levels = {
    trace: "debug",
    debug: "debug",
    info: "info",
    warning: "warn",
    error: "error",
    fatal: "error",
  } as const satisfies Record<LogLevel, string>;
  for (const level of Object.keys(levels) as LogLevel[]) {
    const [method, entry] = capture({ level });
    assert.equal(method, levels[level]);
    assert.deepEqual(entry, {
      level: levels[level],
      message: "Loaded catalog",
      category: "app.catalog",
    });
  }
});

test("getWorkersConsoleSink() preserves fields without replacing record metadata", () => {
  const properties = Object.freeze({
    level: "wrong",
    message: "wrong",
    category: "wrong",
    ["__proto__"]: { source: "catalog" },
    count: 3,
  });
  const [, entry] = capture({ properties });
  assert.deepEqual(entry, {
    level: "info",
    message: "Loaded catalog",
    category: "app.catalog",
    ["__proto__"]: { source: "catalog" },
    count: 3,
  });
});

test("getWorkersConsoleSink() preserves a handled error's stack and cause", () => {
  const cause = new TypeError("Bad catalog data");
  const error = new Error("Catalog unavailable", { cause });
  const [method, entry] = capture({ level: "warning", properties: { error } });
  assert.equal(method, "warn");
  assert.deepEqual(entry.error, {
    name: "Error",
    message: "Catalog unavailable",
    stack: error.stack,
    cause: { name: "TypeError", message: cause.message, stack: cause.stack },
  });
});

test("getWorkersConsoleSink() does not invent stacks for thrown values", () => {
  const error = new Error("No stack");
  delete error.stack;
  assert.deepEqual(capture({ properties: { error } })[1].error, {
    name: "Error",
    message: "No stack",
  });
  assert.deepEqual(capture({ properties: { error: null } })[1].error, {
    name: "Error",
    message: "null",
  });
  assert.ok(
    !Object.hasOwn(capture({ properties: { error: undefined } })[1], "error"),
  );
});

test("getWorkersConsoleSink() isolates values that cannot be serialized", () => {
  let calls = 0;
  const nested: Record<string, unknown> = {
    count: 9007199254740993n,
    date: new Date("2026-01-01T00:00:00Z"),
    invalidDate: new Date(NaN),
    get secret() {
      calls++;
      throw new Error("not for logs");
    },
    toJSON() {
      calls++;
      return {};
    },
  };
  nested.self = nested;
  const stack = new TypeError("Invalid value");
  const [, entry] = capture({
    message: ["Loaded ", 42n, " items"],
    properties: { nested, shared: nested, count: 42, detail: stack },
  });
  assert.equal(calls, 0);
  assert.equal(entry.message, "Loaded 42 items");
  assert.equal(entry.count, 42);
  assert.deepEqual(entry.detail, {
    name: "TypeError",
    message: stack.message,
    stack: stack.stack,
  });
  assert.ok(!Object.hasOwn(entry, "error"));
  assert.deepEqual(entry.nested, {
    count: "9007199254740993",
    date: "2026-01-01T00:00:00.000Z",
    invalidDate: "[unserializable]",
    secret: "[unserializable]",
    toJSON: "[unserializable]",
    self: "[unserializable]",
  });
  assert.deepEqual(entry.shared, entry.nested);
});

test("getWorkersConsoleSink() renders non-finite numbers in messages", () => {
  const [, entry] = capture({
    message: ["Counts: ", NaN, ", ", Infinity, ", ", -Infinity, ""],
    properties: { failed: NaN },
  });
  assert.equal(entry.message, "Counts: NaN, Infinity, -Infinity");
  assert.equal(entry.failed, null);
});

test("getWorkersConsoleSink() keeps the explicit error when the value budget runs out", () => {
  const error = new Error("Failure");
  error.stack = "known stack\n" + "frame\n".repeat(2048);
  const [, entry] = capture({
    level: "error",
    message: ["Details: ", Array.from({ length: 5000 }, () => 1), ""],
    properties: { error },
  });
  assert.equal(entry.level, "error");
  assert.equal(entry.category, "app.catalog");
  assert.match(String(entry.message), /^Details: \[/);
  assert.deepEqual(entry.error, {
    name: "Error",
    message: "Failure",
    stack: error.stack,
  });
});

function capture(
  values: Partial<LogRecord>,
): readonly [string, Record<string, unknown>] {
  const original = globalThis.console;
  const calls: Array<readonly [string, unknown[]]> = [];
  const stub = Object.fromEntries(
    ["debug", "info", "warn", "error"].map((method) => [
      method,
      (...args: unknown[]) => calls.push([method, args]),
    ]),
  );
  try {
    globalThis.console = stub as unknown as Console;
    getWorkersConsoleSink()({
      category: ["app", "catalog"],
      level: "info",
      message: ["Loaded catalog"],
      rawMessage: "Loaded catalog",
      timestamp: 0,
      properties: {},
      ...values,
    });
  } finally {
    globalThis.console = original;
  }
  assert.equal(calls.length, 1);
  const [method, args] = calls[0];
  assert.equal(args.length, 1);
  const [entry] = args;
  assert.ok(
    typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
  return [method, entry as Record<string, unknown>];
}
