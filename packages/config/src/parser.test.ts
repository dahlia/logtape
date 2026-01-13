import assert from "node:assert/strict";
import test from "node:test";
import { parseModuleReference } from "./parser.ts";

test("parseModuleReference()", () => {
  // Shorthands
  assert.deepStrictEqual(parseModuleReference("#console()"), {
    isShorthand: true,
    shorthandName: "console",
    isFactory: true,
  });
  assert.deepStrictEqual(parseModuleReference("#console"), {
    isShorthand: true,
    shorthandName: "console",
    isFactory: false,
  });

  // Named exports
  assert.deepStrictEqual(parseModuleReference("@logtape/file#getFileSink()"), {
    isShorthand: false,
    modulePath: "@logtape/file",
    exportName: "getFileSink",
    isFactory: true,
  });
  assert.deepStrictEqual(parseModuleReference("@logtape/file#getFileSink"), {
    isShorthand: false,
    modulePath: "@logtape/file",
    exportName: "getFileSink",
    isFactory: false,
  });

  // Default exports
  assert.deepStrictEqual(parseModuleReference("./custom()"), {
    isShorthand: false,
    modulePath: "./custom",
    exportName: "default",
    isFactory: true,
  });
  assert.deepStrictEqual(parseModuleReference("./custom"), {
    isShorthand: false,
    modulePath: "./custom",
    exportName: "default",
    isFactory: false,
  });

  // Relative paths with named export
  assert.deepStrictEqual(parseModuleReference("./sinks#custom()"), {
    isShorthand: false,
    modulePath: "./sinks",
    exportName: "custom",
    isFactory: true,
  });
});
