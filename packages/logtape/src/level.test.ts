import assert from "node:assert/strict";
import test from "node:test";
import {
  compareLogLevel,
  getLogLevels,
  isLogLevel,
  type LogLevel,
  parseLogLevel,
} from "./level.ts";

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

test("isLogLevel()", () => {
  assert.ok(isLogLevel("debug"));
  assert.ok(isLogLevel("info"));
  assert.ok(isLogLevel("warning"));
  assert.ok(isLogLevel("error"));
  assert.ok(isLogLevel("fatal"));
  assert.ok(!isLogLevel("DEBUG"));
  assert.ok(!isLogLevel("invalid"));
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
