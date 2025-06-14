import { suite } from "@alinea/suite";
import { assert } from "@std/assert/assert";
import { assertFalse } from "@std/assert/false";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { assertThrows } from "@std/assert/throws";
import { type Filter, getLevelFilter, toFilter } from "./filter.ts";
import { debug, error, fatal, info, trace, warning } from "./fixtures.ts";
import type { LogLevel } from "./level.ts";

const test = suite(import.meta);

test("getLevelFilter()", () => {
  const noneFilter = getLevelFilter(null);
  assertFalse(noneFilter(fatal));
  assertFalse(noneFilter(error));
  assertFalse(noneFilter(warning));
  assertFalse(noneFilter(info));
  assertFalse(noneFilter(debug));
  assertFalse(noneFilter(trace));

  const fatalFilter = getLevelFilter("fatal");
  assert(fatalFilter(fatal));
  assertFalse(fatalFilter(error));
  assertFalse(fatalFilter(warning));
  assertFalse(fatalFilter(info));
  assertFalse(fatalFilter(debug));
  assertFalse(fatalFilter(trace));

  const errorFilter = getLevelFilter("error");
  assert(errorFilter(fatal));
  assert(errorFilter(error));
  assertFalse(errorFilter(warning));
  assertFalse(errorFilter(info));
  assertFalse(errorFilter(debug));
  assertFalse(errorFilter(trace));

  const warningFilter = getLevelFilter("warning");
  assert(warningFilter(fatal));
  assert(warningFilter(error));
  assert(warningFilter(warning));
  assertFalse(warningFilter(info));
  assertFalse(warningFilter(debug));
  assertFalse(warningFilter(trace));

  const infoFilter = getLevelFilter("info");
  assert(infoFilter(fatal));
  assert(infoFilter(error));
  assert(infoFilter(warning));
  assert(infoFilter(info));
  assertFalse(infoFilter(debug));
  assertFalse(infoFilter(trace));

  const debugFilter = getLevelFilter("debug");
  assert(debugFilter(fatal));
  assert(debugFilter(error));
  assert(debugFilter(warning));
  assert(debugFilter(info));
  assert(debugFilter(debug));
  assertFalse(debugFilter(trace));

  const traceFilter = getLevelFilter("trace");
  assert(traceFilter(fatal));
  assert(traceFilter(error));
  assert(traceFilter(warning));
  assert(traceFilter(info));
  assert(traceFilter(debug));
  assert(traceFilter(trace));

  assertThrows(
    () => getLevelFilter("invalid" as LogLevel),
    TypeError,
    "Invalid log level: invalid.",
  );
});

test("toFilter()", () => {
  const hasJunk: Filter = (record) => record.category.includes("junk");
  assertStrictEquals(toFilter(hasJunk), hasJunk);

  const infoFilter = toFilter("info");
  assertFalse(infoFilter(debug));
  assert(infoFilter(info));
  assert(infoFilter(warning));
});
