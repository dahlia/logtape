import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import fc from "fast-check";
import { expandEnvVars } from "./env.ts";

const envNameArb = fc.stringMatching(/^[A-Z0-9_]*$/).map((name) =>
  `LOGTAPE_PBT_${name}`
);
const envValueArb = fc.string().map((value) => value.replaceAll("\0", ""));
const defaultValueArb = fc.string().map((value) =>
  `default${value.replace(/[}\0]/g, "")}`
);

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

test("expandEnvVars() expands generated environment references", () => {
  fc.assert(
    fc.property(
      envNameArb,
      envValueArb,
      fc.string().map((text) => text.replace(/[{}]/g, "")),
      fc.string().map((text) => text.replace(/[{}]/g, "")),
      (name, value, prefix, suffix) => {
        const previous = process.env[name];
        process.env[name] = value;
        try {
          const expanded = expandEnvVars({
            value: `${prefix}\${${name}}${suffix}`,
            nested: {
              array: [`\${${name}}`],
            },
          });

          assert.strictEqual(expanded.value, `${prefix}${value}${suffix}`);
          assert.strictEqual(expanded.nested.array[0], value);
        } finally {
          if (previous == null) delete process.env[name];
          else process.env[name] = previous;
        }
      },
    ),
  );
});

test("expandEnvVars() uses generated defaults for missing variables", () => {
  fc.assert(
    fc.property(envNameArb, defaultValueArb, (name, defaultValue) => {
      const previous = process.env[name];
      delete process.env[name];
      try {
        const expanded = expandEnvVars({
          value: `\${${name}:${defaultValue}}`,
        });

        assert.strictEqual(expanded.value, defaultValue);
      } finally {
        if (previous != null) process.env[name] = previous;
      }
    }),
  );
});
