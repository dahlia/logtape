import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { parseFileMode } from "./file-mode.ts";

test("parseFileMode() defaults to creation-only when a mode is present", () => {
  assert.strictEqual(parseFileMode(undefined, undefined), undefined);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0o777 }), (mode) => {
      assert.deepStrictEqual(parseFileMode(mode, undefined), {
        mode,
        policy: "create",
      });
      assert.deepStrictEqual(parseFileMode(mode, "enforce"), {
        mode,
        policy: "enforce",
      });
    }),
  );
});

test("parseFileMode() rejects invalid options", () => {
  for (const mode of [undefined, null, "0600", 0n]) {
    assert.throws(() => parseFileMode(mode, "create"), TypeError);
  }
  for (const policy of [null, "chmod", 0]) {
    assert.throws(() => parseFileMode(0o600, policy), TypeError);
  }
  for (const mode of [-1, 0o4600, 0.5, NaN, Infinity]) {
    assert.throws(() => parseFileMode(mode, undefined), RangeError);
  }
});
