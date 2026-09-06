import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Elysia } from "elysia";
import { elysiaLogger } from "@logtape/elysia";

const require = createRequire(import.meta.url);
const { Elysia: CommonJsElysia } = require("elysia");
assert.notEqual(Elysia, CommonJsElysia);
assert.throws(
  () =>
    elysiaLogger({ scope: "local", context: true })
      .use(new CommonJsElysia().get("/", () => "wrong module graph")),
  /same Elysia copy and module format/,
);
