import { suite } from "@alinea/suite";
import { assert, assertRejects } from "@std/assert";
import { createSink, loadModuleExport } from "./loader.ts";
import { parseModuleReference } from "./parser.ts";
import { DEFAULT_SHORTHANDS } from "./shorthands.ts";
import { ConfigError } from "./types.ts";

const test = suite(import.meta);

test("loadModuleExport()", async () => {
  // Load built-in shorthand
  const consoleSink = await loadModuleExport(
    parseModuleReference("#console"),
    DEFAULT_SHORTHANDS,
    "sinks",
  );
  assert(typeof consoleSink === "function");

  // Load module export directly
  const textFormatter = await loadModuleExport(
    parseModuleReference("@logtape/logtape#getTextFormatter"),
    DEFAULT_SHORTHANDS,
    "formatters",
  );
  assert(typeof textFormatter === "function");

  // Invalid shorthand
  await assertRejects(
    () =>
      loadModuleExport(
        parseModuleReference("#invalid"),
        DEFAULT_SHORTHANDS,
        "sinks",
      ),
    ConfigError,
    "Unknown sink shorthand",
  );

  // Missing module
  await assertRejects(
    () =>
      loadModuleExport(
        parseModuleReference("non-existent#export"),
        DEFAULT_SHORTHANDS,
        "sinks",
      ),
    ConfigError,
    "Failed to load module",
  );

  // Missing export
  await assertRejects(
    () =>
      loadModuleExport(
        parseModuleReference("@logtape/logtape#nonExistent"),
        DEFAULT_SHORTHANDS,
        "sinks",
      ),
    ConfigError,
    "does not have export",
  );
});

test("createSink()", async () => {
  // Create console sink via shorthand
  const sink = await createSink(
    { type: "#console()" },
    DEFAULT_SHORTHANDS,
  );
  assert(typeof sink === "function");

  // Create sink with formatter shorthand
  const sinkWithFormatter = await createSink(
    {
      type: "#console()",
      formatter: "#text()",
    },
    DEFAULT_SHORTHANDS,
  );
  assert(typeof sinkWithFormatter === "function");
});
