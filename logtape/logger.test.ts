import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/assert-equals";
import { assertFalse } from "@std/assert/assert-false";
import { assertGreaterOrEqual } from "@std/assert/assert-greater-or-equal";
import { assertLessOrEqual } from "@std/assert/assert-less-or-equal";
import { assertStrictEquals } from "@std/assert/assert-strict-equals";
import { toFilter } from "./filter.ts";
import { debug, error, info, warning } from "./fixtures.ts";
import {
  getLogger,
  LoggerCtx,
  LoggerImpl,
  parseMessageTemplate,
  renderMessage,
} from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

function templateLiteral(tpl: TemplateStringsArray, ..._: unknown[]) {
  return tpl;
}

Deno.test("getLogger()", () => {
  assertEquals(getLogger().category, []);
  assertStrictEquals(getLogger(), getLogger());
  assertStrictEquals(getLogger([]), getLogger());
  assertEquals(getLogger("foo").category, ["foo"]);
  assertStrictEquals(getLogger("foo"), getLogger("foo"));
  assertStrictEquals(getLogger("foo"), getLogger(["foo"]));
  assertStrictEquals(getLogger("foo"), getLogger().getChild("foo"));
  assertEquals(getLogger(["foo", "bar"]).category, ["foo", "bar"]);
  assertStrictEquals(
    getLogger(["foo", "bar"]),
    getLogger().getChild(["foo", "bar"]),
  );
  assertStrictEquals(
    getLogger(["foo", "bar"]),
    getLogger().getChild("foo").getChild("bar"),
  );
});

Deno.test("Logger.getChild()", () => {
  const foo = getLogger("foo");
  const fooBar = foo.getChild("bar");
  assertEquals(fooBar.category, ["foo", "bar"]);
  assertStrictEquals(fooBar.parent, foo);
  const fooBarBaz = foo.getChild(["bar", "baz"]);
  assertEquals(fooBarBaz.category, ["foo", "bar", "baz"]);
  assertEquals(fooBarBaz.parent, fooBar);

  const fooCtx = foo.with({ a: 1, b: 2 });
  const fooBarCtx = fooCtx.getChild("bar");
  assertEquals(fooBarCtx.category, ["foo", "bar"]);
  // @ts-ignore: internal attribute:
  assertEquals(fooBarCtx.properties, { a: 1, b: 2 });
});

Deno.test("Logger.with()", () => {
  const foo = getLogger("foo");
  const ctx = foo.with({ a: 1, b: 2 });
  assertEquals(ctx.parent, getLogger());
  assertEquals(ctx.category, ["foo"]);
  // @ts-ignore: internal attribute:
  assertEquals(ctx.properties, { a: 1, b: 2 });
  // @ts-ignore: internal attribute:
  assertEquals(ctx.with({ c: 3 }).properties, { a: 1, b: 2, c: 3 });
});

Deno.test("LoggerImpl.filter()", async (t) => {
  const root = LoggerImpl.getLogger([]);
  const foo = LoggerImpl.getLogger("foo");
  const fooBar = foo.getChild("bar");
  const fooBaz = foo.getChild("baz");
  const fooBarQux = fooBar.getChild("qux");
  const fooQuux = foo.getChild("quux");

  await t.step("test", () => {
    foo.filters.push((log) => log.level === "info");
    fooBar.filters.push((log) => log.message.includes("!"));
    fooBaz.filters.push((log) => log.message.includes("."));
    fooBarQux.filters.push(() => true);
    assert(root.filter(info));
    assert(foo.filter(info));
    assert(fooBar.filter(info));
    assertFalse(fooBaz.filter(info));
    assert(fooBarQux.filter(info));
    assert(fooQuux.filter(info));
    assert(root.filter(debug));
    assertFalse(foo.filter(debug));
    assert(fooBar.filter(debug));
    assertFalse(fooBaz.filter(debug));
    assert(fooBarQux.filter(debug));
    assertFalse(fooQuux.filter(debug));
  });

  await t.step("tear down", () => {
    root.resetDescendants();
  });
});

Deno.test("LoggerImpl.getSinks()", async (t) => {
  const root = LoggerImpl.getLogger([]);
  const foo = LoggerImpl.getLogger("foo");
  const fooBar = foo.getChild("bar");
  const fooBaz = foo.getChild("baz");
  const fooBarQux = fooBar.getChild("qux");

  await t.step("test", () => {
    const sinkA: Sink = () => {};
    foo.sinks.push(sinkA);
    const sinkB: Sink = () => {};
    fooBar.sinks.push(sinkB);
    const sinkC: Sink = () => {};
    fooBaz.sinks.push(sinkC);
    const sinkD: Sink = () => {};
    fooBarQux.sinks.push(sinkD);
    assertEquals([...root.getSinks("debug")], []);
    assertEquals([...foo.getSinks("debug")], [sinkA]);
    assertEquals([...fooBar.getSinks("debug")], [sinkA, sinkB]);
    assertEquals([...fooBaz.getSinks("debug")], [sinkA, sinkC]);
    assertEquals([...fooBarQux.getSinks("debug")], [sinkA, sinkB, sinkD]);
    fooBarQux.parentSinks = "override";
    assertEquals([...fooBarQux.getSinks("debug")], [sinkD]);
  });

  await t.step("tear down", () => {
    root.resetDescendants();
  });
});

Deno.test("LoggerImpl.emit()", async (t) => {
  const root = LoggerImpl.getLogger([]);
  const foo = root.getChild("foo");
  const fooBar = foo.getChild("bar");
  const fooBarBaz = fooBar.getChild("baz");
  const fooQux = foo.getChild("qux");

  const rootRecords: LogRecord[] = [];
  root.sinks.push(rootRecords.push.bind(rootRecords));
  root.filters.push(toFilter("warning"));
  const fooRecords: LogRecord[] = [];
  foo.sinks.push(fooRecords.push.bind(fooRecords));
  foo.filters.push(toFilter("info"));
  const fooBarRecords: LogRecord[] = [];
  fooBar.sinks.push(fooBarRecords.push.bind(fooBarRecords));
  fooBar.filters.push(toFilter("error"));
  const fooQuxRecords: LogRecord[] = [];
  fooQux.sinks.push(fooQuxRecords.push.bind(fooQuxRecords));

  await t.step("filter and sink", () => {
    root.emit(info);
    assertEquals(rootRecords, []);
    assertEquals(fooRecords, []);
    assertEquals(fooBarRecords, []);
    root.emit(warning);
    assertEquals(rootRecords, [warning]);
    assertEquals(fooRecords, []);
    assertEquals(fooBarRecords, []);

    foo.emit(debug);
    assertEquals(rootRecords, [warning]);
    assertEquals(fooRecords, []);
    assertEquals(fooBarRecords, []);
    foo.emit(info);
    assertEquals(rootRecords, [warning, info]);
    assertEquals(fooRecords, [info]);
    assertEquals(fooBarRecords, []);

    fooBar.emit(warning);
    assertEquals(rootRecords, [warning, info]);
    assertEquals(fooRecords, [info]);
    assertEquals(fooBarRecords, []);
    fooBar.emit(error);
    assertEquals(rootRecords, [warning, info, error]);
    assertEquals(fooRecords, [info, error]);
    assertEquals(fooBarRecords, [error]);
  });

  while (rootRecords.length > 0) rootRecords.pop();
  while (fooRecords.length > 0) fooRecords.pop();
  while (fooBarRecords.length > 0) fooBarRecords.pop();

  const errorSink: Sink = () => {
    throw new Error("This is an error");
  };
  fooBarBaz.sinks.push(errorSink);

  await t.step("error handling", () => {
    fooBarBaz.emit(error);
    assertEquals(rootRecords.length, 2);
    assertEquals(rootRecords[0], error);
    assertEquals(fooRecords, [error]);
    assertEquals(fooBarRecords, [error]);
    assertEquals(rootRecords[1].category, ["logtape", "meta"]);
    assertEquals(rootRecords[1].level, "fatal");
    assertEquals(rootRecords[1].message, [
      "Failed to emit a log record to sink ",
      errorSink,
      ": ",
      rootRecords[1].properties.error,
      "",
    ]);
    assertEquals(rootRecords[1].properties, {
      record: error,
      sink: errorSink,
      error: rootRecords[1].properties.error,
    });

    root.sinks.push(errorSink);
    fooBarBaz.emit(error);
  });

  while (rootRecords.length > 0) rootRecords.pop();
  while (fooRecords.length > 0) fooRecords.pop();
  while (fooBarRecords.length > 0) fooBarRecords.pop();
  while (root.filters.length > 0) root.filters.pop();
  while (foo.filters.length > 0) foo.filters.pop();
  while (fooBar.filters.length > 0) fooBar.filters.pop();
  root.sinks.pop();

  root.lowestLevel = "debug";
  foo.lowestLevel = "error";
  fooBar.lowestLevel = "info";

  await t.step("lowestLevel", () => {
    fooBar.emit({ ...debug, category: ["foo", "bar"] });
    assertEquals(rootRecords, []);
    assertEquals(fooRecords, []);
    assertEquals(fooBarRecords, []);

    const debugRecord = { ...debug, category: ["foo", "qux"] };
    fooQux.emit(debugRecord);
    assertEquals(rootRecords, []);
    assertEquals(fooRecords, []);
    assertEquals(fooQuxRecords, [debugRecord]);

    foo.emit({ ...debug, category: ["foo"] });
    assertEquals(rootRecords, []);
    assertEquals(fooRecords, []);

    const debugRecord2 = { ...debug, category: [] };
    root.emit(debugRecord2);
    assertEquals(rootRecords, [debugRecord2]);

    const infoRecord = { ...info, category: ["foo", "bar"] };
    fooBar.emit(infoRecord);
    assertEquals(rootRecords, [debugRecord2]);
    assertEquals(fooRecords, []);
    assertEquals(fooBarRecords, [infoRecord]);
  });

  await t.step("tear down", () => {
    root.resetDescendants();
  });
});

Deno.test("LoggerImpl.log()", async (t) => {
  const logger = LoggerImpl.getLogger("foo");

  await t.step("test", () => {
    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));
    const before = Date.now();
    logger.log("info", "Hello, {foo}!", { foo: 123 });
    const after = Date.now();
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 123, "!"],
        rawMessage: "Hello, {foo}!",
        timestamp: logs[0].timestamp,
        properties: { foo: 123 },
      },
    ]);
    assertGreaterOrEqual(logs[0].timestamp, before);
    assertLessOrEqual(logs[0].timestamp, after);

    logs.shift();
    logger.filters.push(toFilter("error"));
    let called = 0;
    logger.log("warning", "Hello, {foo}!", () => {
      called++;
      return { foo: 123 };
    });
    assertEquals(logs, []);
    assertEquals(called, 0);

    logger.log("error", "Hello, {foo}!", () => {
      called++;
      return { foo: 123 };
    });
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 123, "!"],
        rawMessage: "Hello, {foo}!",
        timestamp: logs[0].timestamp,
        properties: { foo: 123 },
      },
    ]);
    assertEquals(called, 1);
  });

  await t.step("tear down", () => {
    logger.resetDescendants();
  });
});

Deno.test("LoggerImpl.logLazily()", async (t) => {
  const logger = LoggerImpl.getLogger("foo");

  await t.step("test", () => {
    let called = 0;
    function calc() {
      called++;
      return 123;
    }

    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));
    logger.filters.push(toFilter("error"));
    logger.logLazily("warning", (l) => l`Hello, ${calc()}!`);
    assertEquals(logs, []);
    assertEquals(called, 0);

    const before = Date.now();
    logger.logLazily("error", (l) => l`Hello, ${calc()}!`);
    const after = Date.now();
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: logs[0].timestamp,
        properties: {},
      },
    ]);
    assertGreaterOrEqual(logs[0].timestamp, before);
    assertLessOrEqual(logs[0].timestamp, after);
    assertEquals(called, 1);
  });

  await t.step("tear down", () => {
    logger.resetDescendants();
  });
});

Deno.test("LoggerImpl.logTemplate()", async (t) => {
  const logger = LoggerImpl.getLogger("foo");

  await t.step("test", () => {
    function info(tpl: TemplateStringsArray, ...values: unknown[]) {
      logger.logTemplate("info", tpl, values);
    }
    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));

    const before = Date.now();
    info`Hello, ${123}!`;
    const after = Date.now();
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: logs[0].timestamp,
        properties: {},
      },
    ]);
    assertGreaterOrEqual(logs[0].timestamp, before);
    assertLessOrEqual(logs[0].timestamp, after);
  });

  await t.step("tear down", () => {
    logger.resetDescendants();
  });
});

Deno.test("LoggerCtx.log()", async (t) => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  await t.step("test", () => {
    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));
    const before = Date.now();
    ctx.log("info", "Hello, {a} {b} {c}!", { c: 3 });
    const after = Date.now();
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
        rawMessage: "Hello, {a} {b} {c}!",
        timestamp: logs[0].timestamp,
        properties: { a: 1, b: 2, c: 3 },
      },
    ]);
    assertGreaterOrEqual(logs[0].timestamp, before);
    assertLessOrEqual(logs[0].timestamp, after);

    logs.shift();
    logger.filters.push(toFilter("error"));
    let called = 0;
    ctx.log("warning", "Hello, {a} {b} {c}!", () => {
      called++;
      return { c: 3 };
    });
    assertEquals(logs, []);
    assertEquals(called, 0);

    ctx.log("error", "Hello, {a} {b} {c}!", () => {
      called++;
      return { c: 3 };
    });
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
        rawMessage: "Hello, {a} {b} {c}!",
        timestamp: logs[0].timestamp,
        properties: { a: 1, b: 2, c: 3 },
      },
    ]);
    assertEquals(called, 1);
  });

  await t.step("tear down", () => {
    logger.resetDescendants();
  });
});

Deno.test("LoggerCtx.logLazily()", async (t) => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  await t.step("test", () => {
    let called = 0;
    function calc() {
      called++;
      return 123;
    }

    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));
    logger.filters.push(toFilter("error"));
    logger.logLazily("warning", (l) => l`Hello, ${calc()}!`);
    assertEquals(logs, []);
    assertEquals(called, 0);

    const before = Date.now();
    ctx.logLazily("error", (l) => l`Hello, ${calc()}!`);
    const after = Date.now();
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: logs[0].timestamp,
        properties: { a: 1, b: 2 },
      },
    ]);
    assertGreaterOrEqual(logs[0].timestamp, before);
    assertLessOrEqual(logs[0].timestamp, after);
    assertEquals(called, 1);
  });

  await t.step("tear down", () => {
    logger.resetDescendants();
  });
});

Deno.test("LoggerCtx.logTemplate()", async (t) => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  await t.step("test", () => {
    function info(tpl: TemplateStringsArray, ...values: unknown[]) {
      ctx.logTemplate("info", tpl, values);
    }
    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));

    const before = Date.now();
    info`Hello, ${123}!`;
    const after = Date.now();
    assertEquals(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: logs[0].timestamp,
        properties: { a: 1, b: 2 },
      },
    ]);
    assertGreaterOrEqual(logs[0].timestamp, before);
    assertLessOrEqual(logs[0].timestamp, after);
  });

  await t.step("tear down", () => {
    logger.resetDescendants();
  });
});

const methods = ["debug", "info", "warn", "error", "fatal"] as const;
for (const method of methods) {
  Deno.test(`Logger.${method}()`, async (t) => {
    const logger = LoggerImpl.getLogger("foo");
    const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

    await t.step("template", () => {
      function tpl(tpl: TemplateStringsArray, ...values: unknown[]) {
        logger[method](tpl, ...values);
      }

      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));
      let before = Date.now();
      tpl`Hello, ${123}!`;
      let after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: logs[0].timestamp,
          properties: {},
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);

      function ctxTpl(tpl: TemplateStringsArray, ...values: unknown[]) {
        ctx[method](tpl, ...values);
      }

      logs.shift();
      before = Date.now();
      ctxTpl`Hello, ${123}!`;
      after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: logs[0].timestamp,
          properties: { a: 1, b: 2 },
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);
    });

    await t.step("tear down", () => {
      logger.resetDescendants();
    });

    await t.step("lazy template", () => {
      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));
      let before = Date.now();
      logger[method]((l) => l`Hello, ${123}!`);
      let after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: logs[0].timestamp,
          properties: {},
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);

      logs.shift();
      before = Date.now();
      ctx[method]((l) => l`Hello, ${123}!`);
      after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: logs[0].timestamp,
          properties: { a: 1, b: 2 },
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);
    });

    await t.step("tear down", () => {
      logger.resetDescendants();
    });

    await t.step("eager", () => {
      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));
      let before = Date.now();
      logger[method]("Hello, {foo}!", { foo: 123 });
      let after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: "Hello, {foo}!",
          timestamp: logs[0].timestamp,
          properties: { foo: 123 },
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);

      logs.shift();
      logger[method]("Hello, world!");
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, world!"],
          rawMessage: "Hello, world!",
          timestamp: logs[0].timestamp,
          properties: {},
        },
      ]);

      logs.shift();
      before = Date.now();
      ctx[method]("Hello, {a} {b} {c}!", { c: 3 });
      after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
          rawMessage: "Hello, {a} {b} {c}!",
          timestamp: logs[0].timestamp,
          properties: { a: 1, b: 2, c: 3 },
        },
      ]);

      logs.shift();
      ctx[method]("Hello, world!");
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, world!"],
          rawMessage: "Hello, world!",
          timestamp: logs[0].timestamp,
          properties: { a: 1, b: 2 },
        },
      ]);
    });

    await t.step("tear down", () => {
      logger.resetDescendants();
    });

    await t.step("lazy", () => {
      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));
      let before = Date.now();
      logger[method]("Hello, {foo}!", () => {
        return { foo: 123 };
      });
      let after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: "Hello, {foo}!",
          timestamp: logs[0].timestamp,
          properties: { foo: 123 },
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);

      logs.shift();
      before = Date.now();
      ctx[method]("Hello, {a} {b} {c}!", () => {
        return { c: 3 };
      });
      after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
          rawMessage: "Hello, {a} {b} {c}!",
          timestamp: logs[0].timestamp,
          properties: { a: 1, b: 2, c: 3 },
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);
    });

    await t.step("tear down", () => {
      logger.resetDescendants();
    });

    await t.step("with no message", () => {
      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));
      const before = Date.now();
      logger[method]({ foo: 123, bar: 456 });
      const after = Date.now();
      assertEquals(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["", { foo: 123, bar: 456 }, ""],
          rawMessage: "{*}",
          timestamp: logs[0].timestamp,
          properties: { foo: 123, bar: 456 },
        },
      ]);
      assertGreaterOrEqual(logs[0].timestamp, before);
      assertLessOrEqual(logs[0].timestamp, after);
    });

    await t.step("tear down", () => {
      logger.resetDescendants();
    });
  });
}

Deno.test("parseMessageTemplate()", () => {
  assertEquals(parseMessageTemplate("Hello, world!", {}), ["Hello, world!"]);
  assertEquals(
    parseMessageTemplate("Hello, world!", { foo: 123 }),
    ["Hello, world!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {{world}}!", { foo: 123 }),
    ["Hello, {world}!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {foo}!", { foo: 123 }),
    ["Hello, ", 123, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, { foo\t}!", { " foo\t": 123, foo: 456 }),
    ["Hello, ", 123, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, { foo\t}!", { foo: 456 }),
    ["Hello, ", 456, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, { foo\t}!", { " foo": 456 }),
    ["Hello, ", undefined, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {{foo}}!", { foo: 123 }),
    ["Hello, {foo}!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {bar}!", { foo: 123 }),
    ["Hello, ", undefined, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {bar}!", { foo: 123, bar: 456 }),
    ["Hello, ", 456, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {foo}, {bar}!", { foo: 123, bar: 456 }),
    ["Hello, ", 123, ", ", 456, "!"],
  );
  assertEquals(
    parseMessageTemplate("Hello, {foo}, {bar}", { foo: 123, bar: 456 }),
    ["Hello, ", 123, ", ", 456, ""],
  );
  assertEquals(
    parseMessageTemplate("Hello, {*}", { foo: 123, bar: 456 }),
    ["Hello, ", { foo: 123, bar: 456 }, ""],
  );
  assertEquals(
    parseMessageTemplate("Hello, { *\t}", { foo: 123, bar: 456 }),
    ["Hello, ", { foo: 123, bar: 456 }, ""],
  );
  assertEquals(
    parseMessageTemplate("Hello, {*}", { foo: 123, bar: 456, "*": 789 }),
    ["Hello, ", 789, ""],
  );
  assertEquals(
    parseMessageTemplate("Hello, { *\t}", { foo: 123, bar: 456, " *\t": 789 }),
    ["Hello, ", 789, ""],
  );
  assertEquals(
    parseMessageTemplate("Hello, { *\t}", { foo: 123, bar: 456, "*": 789 }),
    ["Hello, ", 789, ""],
  );
  assertEquals(
    parseMessageTemplate("Hello, {{world!", { foo: 123 }),
    ["Hello, {world!"],
  );
});

Deno.test("renderMessage()", () => {
  function rm(tpl: TemplateStringsArray, ...values: unknown[]) {
    return renderMessage(tpl, values);
  }
  assertEquals(rm`Hello, world!`, ["Hello, world!"]);
  assertEquals(rm`Hello, ${123}!`, ["Hello, ", 123, "!"]);
  assertEquals(rm`Hello, ${123}, ${456}!`, ["Hello, ", 123, ", ", 456, "!"]);
  assertEquals(rm`Hello, ${123}, ${456}`, ["Hello, ", 123, ", ", 456, ""]);
});
