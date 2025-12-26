import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert";
import { expandEnvVars } from "./env.ts";

const test = suite(import.meta);

test("expandEnvVars()", () => {
  Deno.env.set("TEST_VAR", "value");

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

  assertEquals(expanded.simple, "value");
  assertEquals(expanded.withDefault, "default");
  assertEquals(expanded.missing, "");
  assertEquals(expanded.nested.array[0], "value");
  assertEquals(expanded.nested.obj.val, "value");
  assertEquals(expanded.mixed, "prefix-value-suffix");

  Deno.env.delete("TEST_VAR");
});

test("expandEnvVars() with custom pattern", () => {
  Deno.env.set("TEST_VAR", "value");

  const config = {
    val: "%TEST_VAR%",
  };

  const expanded = expandEnvVars(config, {
    pattern: /%([^%]+)%/g,
  });

  assertEquals(expanded.val, "value");

  Deno.env.delete("TEST_VAR");
});
