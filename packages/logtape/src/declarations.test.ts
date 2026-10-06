import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Deno tests run directly from source without building npm artifacts.
const skip = "Deno" in globalThis;

const cases = [
  {
    module: "logger",
    internalName: "LoggerImpl",
    internalDocs: "A logger implementation.",
    publicName: "getLogger",
    publicDocs: "Get a logger with the given category.",
  },
  {
    module: "sanitize",
    internalName: "getSanitizer",
    internalDocs: "Builds the sanitizer a formatter applies",
    publicName: "sanitizeControlSequences",
    publicDocs: "ESC itself is escaped rather than the whole sequence",
  },
  {
    module: "context",
    internalName: "getCategoryPrefix",
    internalDocs:
      "Gets the current category prefix from context local storage.",
    publicName: "withCategoryPrefix",
    publicDocs: "Runs a callback with the given category prefix prepended",
  },
  {
    module: "inspect",
    internalName: "collectSinkPaths",
    internalDocs: "Mirrors LoggerImpl.createSinkDispatchPlan()",
    publicName: "inspectLogger",
    publicDocs: "The inspection has no side effects.",
  },
] as const;

for (const extension of ["d.ts", "d.cts"]) {
  for (const entry of cases) {
    test(`${entry.module}.${extension} preserves only public JSDoc`, {
      skip,
    }, async () => {
      // Bun needs an early return as well as the skip option.
      if (skip) return;
      const source = await readFile(
        new URL(`./${entry.module}.ts`, import.meta.url),
        "utf8",
      );
      assert.ok(source.includes(entry.internalDocs));
      assert.ok(source.includes(entry.publicDocs));
      const declarations = await readFile(
        new URL(`../dist/${entry.module}.${extension}`, import.meta.url),
        "utf8",
      );
      assert.ok(!declarations.includes(entry.internalDocs));
      assert.doesNotMatch(
        declarations,
        new RegExp(`declare (?:class|function) ${entry.internalName}\\b`),
      );
      assert.match(
        declarations,
        new RegExp(`declare function ${entry.publicName}\\b`),
      );
      assert.ok(declarations.includes(entry.publicDocs));
    });
  }
}
