import { suite } from "@alinea/suite";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertFalse } from "@std/assert/false";
import { assertThrows } from "@std/assert/throws";
import {
  compareLogLevel,
  getLogLevels,
  isLogLevel,
  type LogLevel,
  parseLogLevel,
} from "./level.ts";

const test = suite(import.meta);

test("getLogLevels()", () => {
  const levels: readonly LogLevel[] = getLogLevels();
  assertEquals(levels, [
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
  assertEquals(levels3, [
    "trace",
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ]);
});

test("parseLogLevel()", () => {
  assertEquals(parseLogLevel("debug"), "debug");
  assertEquals(parseLogLevel("info"), "info");
  assertEquals(parseLogLevel("warning"), "warning");
  assertEquals(parseLogLevel("error"), "error");
  assertEquals(parseLogLevel("fatal"), "fatal");
  assertEquals(parseLogLevel("DEBUG"), "debug");
  assertEquals(parseLogLevel("INFO"), "info");
  assertEquals(parseLogLevel("WARNING"), "warning");
  assertEquals(parseLogLevel("ERROR"), "error");
  assertEquals(parseLogLevel("FATAL"), "fatal");
  assertThrows(
    () => parseLogLevel("invalid"),
    TypeError,
    "Invalid log level: invalid.",
  );
});

test("isLogLevel()", () => {
  assert(isLogLevel("debug"));
  assert(isLogLevel("info"));
  assert(isLogLevel("warning"));
  assert(isLogLevel("error"));
  assert(isLogLevel("fatal"));
  assertFalse(isLogLevel("DEBUG"));
  assertFalse(isLogLevel("invalid"));
});

test("compareLogLevel()", () => {
  const levels: LogLevel[] = ["info", "debug", "error", "warning", "fatal"];
  levels.sort(compareLogLevel);
  assertEquals(levels, ["debug", "info", "warning", "error", "fatal"]);
});
