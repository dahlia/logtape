import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { type Filter, getLevelFilter, toFilter } from "./filter.ts";
import { debug, error, fatal, info, trace, warning } from "./fixtures.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";

const logLevelArb = fc.constantFrom<LogLevel>(
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
);

test("getLevelFilter()", () => {
  const noneFilter = getLevelFilter(null);
  assert.ok(!noneFilter(fatal));
  assert.ok(!noneFilter(error));
  assert.ok(!noneFilter(warning));
  assert.ok(!noneFilter(info));
  assert.ok(!noneFilter(debug));
  assert.ok(!noneFilter(trace));

  const fatalFilter = getLevelFilter("fatal");
  assert.ok(fatalFilter(fatal));
  assert.ok(!fatalFilter(error));
  assert.ok(!fatalFilter(warning));
  assert.ok(!fatalFilter(info));
  assert.ok(!fatalFilter(debug));
  assert.ok(!fatalFilter(trace));

  const errorFilter = getLevelFilter("error");
  assert.ok(errorFilter(fatal));
  assert.ok(errorFilter(error));
  assert.ok(!errorFilter(warning));
  assert.ok(!errorFilter(info));
  assert.ok(!errorFilter(debug));
  assert.ok(!errorFilter(trace));

  const warningFilter = getLevelFilter("warning");
  assert.ok(warningFilter(fatal));
  assert.ok(warningFilter(error));
  assert.ok(warningFilter(warning));
  assert.ok(!warningFilter(info));
  assert.ok(!warningFilter(debug));
  assert.ok(!warningFilter(trace));

  const infoFilter = getLevelFilter("info");
  assert.ok(infoFilter(fatal));
  assert.ok(infoFilter(error));
  assert.ok(infoFilter(warning));
  assert.ok(infoFilter(info));
  assert.ok(!infoFilter(debug));
  assert.ok(!infoFilter(trace));

  const debugFilter = getLevelFilter("debug");
  assert.ok(debugFilter(fatal));
  assert.ok(debugFilter(error));
  assert.ok(debugFilter(warning));
  assert.ok(debugFilter(info));
  assert.ok(debugFilter(debug));
  assert.ok(!debugFilter(trace));

  const traceFilter = getLevelFilter("trace");
  assert.ok(traceFilter(fatal));
  assert.ok(traceFilter(error));
  assert.ok(traceFilter(warning));
  assert.ok(traceFilter(info));
  assert.ok(traceFilter(debug));
  assert.ok(traceFilter(trace));

  assert.throws(
    () => getLevelFilter("invalid" as LogLevel),
    TypeError,
    "Invalid log level: invalid.",
  );
});

test("getLevelFilter() accepts records at or above the minimum level", () => {
  fc.assert(
    fc.property(logLevelArb, logLevelArb, (minimum, level) => {
      const filter = getLevelFilter(minimum);

      assert.strictEqual(
        filter(recordWithLevel(level)),
        compareLogLevel(level, minimum) >= 0,
      );
    }),
  );
});

test("getLevelFilter() rejects every record when level is null", () => {
  fc.assert(
    fc.property(logLevelArb, (level) => {
      const filter = getLevelFilter(null);

      assert.strictEqual(filter(recordWithLevel(level)), false);
    }),
  );
});

test("toFilter()", () => {
  const hasJunk: Filter = (record) => record.category.includes("junk");
  assert.strictEqual(toFilter(hasJunk), hasJunk);

  const infoFilter = toFilter("info");
  assert.ok(!infoFilter(debug));
  assert.ok(infoFilter(info));
  assert.ok(infoFilter(warning));
});

test("toFilter() accepts records at or above a minimum level", () => {
  fc.assert(
    fc.property(logLevelArb, logLevelArb, (minimum, level) => {
      const filter = toFilter(minimum);

      assert.strictEqual(
        filter(recordWithLevel(level)),
        compareLogLevel(level, minimum) >= 0,
      );
    }),
  );
});

function recordWithLevel(level: LogLevel) {
  return {
    level,
    category: ["test"],
    message: ["message"],
    rawMessage: "message",
    timestamp: 0,
    properties: {},
  };
}
