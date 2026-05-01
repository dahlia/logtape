import assert from "node:assert/strict";
import test from "node:test";
import { getBunyanSink } from "./mod.ts";

test("getBunyanSink() exports a callable", () => {
  assert.equal(typeof getBunyanSink, "function");
});
