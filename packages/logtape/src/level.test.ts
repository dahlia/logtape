import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import {
  compareLogLevel,
  getLogLevels,
  isLogLevel,
  type LogLevel,
  parseLogLevel,
} from "./level.ts";

const logLevelArb = fc.constantFrom<LogLevel>(
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
);

test("getLogLevels()", () => {
  const levels: readonly LogLevel[] = getLogLevels();
  assert.deepStrictEqual(levels, [
    "trace",
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ]);
  const levels2 = levels as LogLevel[];
  levels2.push("trace");
  const levels3 = getLogLevels();
  assert.deepStrictEqual(levels3, [
    "trace",
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ]);
});

test("parseLogLevel()", () => {
  assert.deepStrictEqual(parseLogLevel("debug"), "debug");
  assert.deepStrictEqual(parseLogLevel("info"), "info");
  assert.deepStrictEqual(parseLogLevel("warning"), "warning");
  assert.deepStrictEqual(parseLogLevel("error"), "error");
  assert.deepStrictEqual(parseLogLevel("fatal"), "fatal");
  assert.deepStrictEqual(parseLogLevel("DEBUG"), "debug");
  assert.deepStrictEqual(parseLogLevel("INFO"), "info");
  assert.deepStrictEqual(parseLogLevel("WARNING"), "warning");
  assert.deepStrictEqual(parseLogLevel("ERROR"), "error");
  assert.deepStrictEqual(parseLogLevel("FATAL"), "fatal");
  assert.throws(
    () => parseLogLevel("invalid"),
    TypeError,
    "Invalid log level: invalid.",
  );
});

test("parseLogLevel() accepts lowercase and uppercase valid levels", () => {
  fc.assert(
    fc.property(logLevelArb, fc.boolean(), (level, uppercase) => {
      const input = uppercase ? level.toUpperCase() : level;

      assert.strictEqual(parseLogLevel(input), level);
    }),
  );
});

test("isLogLevel()", () => {
  assert.ok(isLogLevel("debug"));
  assert.ok(isLogLevel("info"));
  assert.ok(isLogLevel("warning"));
  assert.ok(isLogLevel("error"));
  assert.ok(isLogLevel("fatal"));
  assert.ok(!isLogLevel("DEBUG"));
  assert.ok(!isLogLevel("invalid"));
});

test("isLogLevel() accepts exactly canonical log levels", () => {
  fc.assert(
    fc.property(fc.string(), (level) => {
      const expected = getLogLevels().includes(level as LogLevel);

      assert.strictEqual(isLogLevel(level), expected);
    }),
  );
});

test("compareLogLevel()", () => {
  const levels: LogLevel[] = ["info", "debug", "error", "warning", "fatal"];
  levels.sort(compareLogLevel);
  assert.deepStrictEqual(levels, [
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ]);
});

test("compareLogLevel() follows the order from getLogLevels()", () => {
  fc.assert(
    fc.property(logLevelArb, logLevelArb, (a, b) => {
      const levels = getLogLevels();
      const expected = levels.indexOf(a) - levels.indexOf(b);

      assert.strictEqual(compareLogLevel(a, b), expected);
    }),
  );
});

test("getLogLevels() always returns a fresh copy", () => {
  fc.assert(
    fc.property(fc.array(logLevelArb), (extraLevels) => {
      const levels = getLogLevels() as LogLevel[];
      levels.push(...extraLevels);

      assert.deepStrictEqual(getLogLevels(), [
        "trace",
        "debug",
        "info",
        "warning",
        "error",
        "fatal",
      ]);
    }),
  );
});
