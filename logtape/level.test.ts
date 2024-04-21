import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/assert-equals";
import { assertFalse } from "@std/assert/assert-false";
import { assertThrows } from "@std/assert/assert-throws";
import { isLogLevel, parseLogLevel } from "./level.ts";

Deno.test("parseLogLevel()", () => {
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

Deno.test("isLogLevel()", () => {
  assert(isLogLevel("debug"));
  assert(isLogLevel("info"));
  assert(isLogLevel("warning"));
  assert(isLogLevel("error"));
  assert(isLogLevel("fatal"));
  assertFalse(isLogLevel("DEBUG"));
  assertFalse(isLogLevel("invalid"));
});
