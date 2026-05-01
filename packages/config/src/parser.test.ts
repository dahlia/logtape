import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { parseModuleReference } from "./parser.ts";

const referencePartArb: fc.Arbitrary<string> = fc.stringMatching(
  /^[A-Za-z0-9_./@-]*$/,
);

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

test("parseModuleReference() parses generated shorthand references", () => {
  fc.assert(
    fc.property(referencePartArb, fc.boolean(), (name, isFactory) => {
      const reference = `#${name}${isFactory ? "()" : ""}`;

      assert.deepStrictEqual(parseModuleReference(reference), {
        isShorthand: true,
        shorthandName: name,
        isFactory,
      });
    }),
  );
});

test("parseModuleReference() parses generated named exports", () => {
  fc.assert(
    fc.property(
      referencePartArb.map((path) => `./module${path}`),
      referencePartArb.map((name) => `export${name}`),
      fc.boolean(),
      (modulePath, exportName, isFactory) => {
        const reference = `${modulePath}#${exportName}${isFactory ? "()" : ""}`;

        assert.deepStrictEqual(parseModuleReference(reference), {
          isShorthand: false,
          modulePath,
          exportName,
          isFactory,
        });
      },
    ),
  );
});

test("parseModuleReference() parses generated default exports", () => {
  fc.assert(
    fc.property(
      referencePartArb.map((path) => `./module${path}`),
      fc.boolean(),
      (modulePath, isFactory) => {
        const reference = `${modulePath}${isFactory ? "()" : ""}`;

        assert.deepStrictEqual(parseModuleReference(reference), {
          isShorthand: false,
          modulePath,
          exportName: "default",
          isFactory,
        });
      },
    ),
  );
});
