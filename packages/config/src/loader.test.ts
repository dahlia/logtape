import assert from "node:assert/strict";
import test from "node:test";
import { createSink, loadModuleExport } from "./loader.ts";
import { parseModuleReference } from "./parser.ts";
import { DEFAULT_SHORTHANDS } from "./shorthands.ts";
import { ConfigError } from "./types.ts";

test("loadModuleExport()", async () => {
  // Load built-in shorthand
  const consoleSink = await loadModuleExport(
    parseModuleReference("#console"),
    DEFAULT_SHORTHANDS,
    "sinks",
  );
  assert.ok(typeof consoleSink === "function");

  // Load module export directly
  const textFormatter = await loadModuleExport(
    parseModuleReference("@logtape/logtape#getTextFormatter"),
    DEFAULT_SHORTHANDS,
    "formatters",
  );
  assert.ok(typeof textFormatter === "function");

  // Invalid shorthand
  await assert.rejects(
    () =>
      loadModuleExport(
        parseModuleReference("#invalid"),
        DEFAULT_SHORTHANDS,
        "sinks",
      ),
    ConfigError,
  );

  // Missing module
  await assert.rejects(
    () =>
      loadModuleExport(
        parseModuleReference("non-existent#export"),
        DEFAULT_SHORTHANDS,
        "sinks",
      ),
    ConfigError,
  );

  // Missing export
  await assert.rejects(
    () =>
      loadModuleExport(
        parseModuleReference("@logtape/logtape#nonExistent"),
        DEFAULT_SHORTHANDS,
        "sinks",
      ),
    ConfigError,
  );
});

test("createSink()", async () => {
  // Create console sink via shorthand
  const sink = await createSink(
    { type: "#console()" },
    DEFAULT_SHORTHANDS,
  );
  assert.ok(typeof sink === "function");

  // Create sink with formatter shorthand
  const sinkWithFormatter = await createSink(
    {
      type: "#console()",
      formatter: "#text()",
    },
    DEFAULT_SHORTHANDS,
  );
  assert.ok(typeof sinkWithFormatter === "function");
});
