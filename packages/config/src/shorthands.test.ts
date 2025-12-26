import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert";
import { DEFAULT_SHORTHANDS, mergeShorthands } from "./shorthands.ts";

const test = suite(import.meta);

test("mergeShorthands()", () => {
  // Merge with empty custom
  assertEquals(mergeShorthands(DEFAULT_SHORTHANDS), DEFAULT_SHORTHANDS);
  assertEquals(mergeShorthands(DEFAULT_SHORTHANDS, {}), DEFAULT_SHORTHANDS);

  // Merge with custom shorthands
  const custom = {
    sinks: {
      custom: "./custom#getSink",
      console: "./custom#getConsole", // Override
    },
    formatters: {
      xml: "./xml#getFormatter",
    },
  };

  const merged = mergeShorthands(DEFAULT_SHORTHANDS, custom);

  assertEquals(merged.sinks?.custom, "./custom#getSink");
  assertEquals(merged.sinks?.console, "./custom#getConsole");
  assertEquals(merged.sinks?.stream, DEFAULT_SHORTHANDS.sinks?.stream);
  assertEquals(merged.formatters?.xml, "./xml#getFormatter");
  assertEquals(merged.formatters?.text, DEFAULT_SHORTHANDS.formatters?.text);
});
