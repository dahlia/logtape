import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SHORTHANDS, mergeShorthands } from "./shorthands.ts";

test("mergeShorthands()", () => {
  // Merge with empty custom
  assert.deepStrictEqual(
    mergeShorthands(DEFAULT_SHORTHANDS),
    DEFAULT_SHORTHANDS,
  );
  assert.deepStrictEqual(
    mergeShorthands(DEFAULT_SHORTHANDS, {}),
    DEFAULT_SHORTHANDS,
  );

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

  assert.strictEqual(merged.sinks?.custom, "./custom#getSink");
  assert.strictEqual(merged.sinks?.console, "./custom#getConsole");
  assert.strictEqual(merged.sinks?.stream, DEFAULT_SHORTHANDS.sinks?.stream);
  assert.strictEqual(merged.formatters?.xml, "./xml#getFormatter");
  assert.strictEqual(
    merged.formatters?.text,
    DEFAULT_SHORTHANDS.formatters?.text,
  );
});
