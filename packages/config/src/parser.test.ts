import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert";
import { parseModuleReference } from "./parser.ts";

const test = suite(import.meta);

test("parseModuleReference()", () => {
  // Shorthands
  assertEquals(parseModuleReference("#console()"), {
    isShorthand: true,
    shorthandName: "console",
    isFactory: true,
  });
  assertEquals(parseModuleReference("#console"), {
    isShorthand: true,
    shorthandName: "console",
    isFactory: false,
  });

  // Named exports
  assertEquals(parseModuleReference("@logtape/file#getFileSink()"), {
    isShorthand: false,
    modulePath: "@logtape/file",
    exportName: "getFileSink",
    isFactory: true,
  });
  assertEquals(parseModuleReference("@logtape/file#getFileSink"), {
    isShorthand: false,
    modulePath: "@logtape/file",
    exportName: "getFileSink",
    isFactory: false,
  });

  // Default exports
  assertEquals(parseModuleReference("./custom()"), {
    isShorthand: false,
    modulePath: "./custom",
    exportName: "default",
    isFactory: true,
  });
  assertEquals(parseModuleReference("./custom"), {
    isShorthand: false,
    modulePath: "./custom",
    exportName: "default",
    isFactory: false,
  });

  // Relative paths with named export
  assertEquals(parseModuleReference("./sinks#custom()"), {
    isShorthand: false,
    modulePath: "./sinks",
    exportName: "custom",
    isFactory: true,
  });
});
