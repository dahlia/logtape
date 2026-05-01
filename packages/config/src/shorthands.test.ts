import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { DEFAULT_SHORTHANDS, mergeShorthands } from "./shorthands.ts";
import type { ShorthandRegistry } from "./types.ts";

const shorthandKeyArb: fc.Arbitrary<string> = fc.stringMatching(
  /^k[A-Za-z0-9_]*$/,
);
const shorthandMapArb: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  shorthandKeyArb,
  fc.string(),
);
const shorthandRegistryArb: fc.Arbitrary<ShorthandRegistry> = fc.record(
  {
    sinks: fc.option(shorthandMapArb, { nil: undefined }),
    filters: fc.option(shorthandMapArb, { nil: undefined }),
    formatters: fc.option(shorthandMapArb, { nil: undefined }),
  },
  { requiredKeys: [] },
);

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

test("mergeShorthands() lets custom shorthands override defaults", () => {
  fc.assert(
    fc.property(
      shorthandRegistryArb,
      shorthandRegistryArb,
      (defaults, custom) => {
        const merged = mergeShorthands(defaults, custom);

        assert.deepStrictEqual(merged, {
          sinks: { ...defaults.sinks, ...custom.sinks },
          filters: { ...defaults.filters, ...custom.filters },
          formatters: { ...defaults.formatters, ...custom.formatters },
        });
      },
    ),
  );
});

test("mergeShorthands() does not mutate generated inputs", () => {
  fc.assert(
    fc.property(
      shorthandRegistryArb,
      shorthandRegistryArb,
      (defaults, custom) => {
        const defaultsBefore = JSON.stringify(defaults);
        const customBefore = JSON.stringify(custom);

        mergeShorthands(defaults, custom);

        assert.strictEqual(JSON.stringify(defaults), defaultsBefore);
        assert.strictEqual(JSON.stringify(custom), customBefore);
      },
    ),
  );
});
