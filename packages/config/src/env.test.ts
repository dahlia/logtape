import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { expandEnvVars } from "./env.ts";

test("expandEnvVars()", () => {
  process.env["TEST_VAR"] = "value";

  const config = {
    simple: "${TEST_VAR}",
    withDefault: "${MISSING:default}",
    missing: "${MISSING}",
    nested: {
      array: ["${TEST_VAR}"],
      obj: {
        val: "${TEST_VAR}",
      },
    },
    mixed: "prefix-${TEST_VAR}-suffix",
  };

  const expanded = expandEnvVars(config);

  assert.strictEqual(expanded.simple, "value");
  assert.strictEqual(expanded.withDefault, "default");
  assert.strictEqual(expanded.missing, "");
  assert.strictEqual(expanded.nested.array[0], "value");
  assert.strictEqual(expanded.nested.obj.val, "value");
  assert.strictEqual(expanded.mixed, "prefix-value-suffix");

  delete process.env["TEST_VAR"];
});

test("expandEnvVars() with custom pattern", () => {
  process.env["TEST_VAR"] = "value";

  const config = {
    val: "%TEST_VAR%",
  };

  const expanded = expandEnvVars(config, {
    pattern: /%([^%]+)%/g,
  });

  assert.strictEqual(expanded.val, "value");

  delete process.env["TEST_VAR"];
});
