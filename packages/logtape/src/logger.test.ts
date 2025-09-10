import { suite } from "@alinea/suite";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertFalse } from "@std/assert/false";
import { assertGreaterOrEqual } from "@std/assert/greater-or-equal";
import { assertLessOrEqual } from "@std/assert/less-or-equal";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { toFilter } from "./filter.ts";
import { debug, error, info, warning } from "./fixtures.ts";
import {
  getLogger,
  LoggerCtx,
  LoggerImpl,
  type LogMethod,
  parseMessageTemplate,
  renderMessage,
} from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

const test = suite(import.meta);

function templateLiteral(tpl: TemplateStringsArray, ..._: unknown[]) {
  return tpl;
}

test("getLogger()", () => {
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

test("Logger.getChild()", () => {
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

test("Logger.with()", () => {
  const foo = getLogger("foo");
  const ctx = foo.with({ a: 1, b: 2 });
  assertEquals(ctx.parent, getLogger());
  assertEquals(ctx.category, ["foo"]);
  // @ts-ignore: internal attribute:
  assertEquals(ctx.properties, { a: 1, b: 2 });
  // @ts-ignore: internal attribute:
  assertEquals(ctx.with({ c: 3 }).properties, { a: 1, b: 2, c: 3 });
});

test("LoggerImpl.filter()", () => {
  const root = LoggerImpl.getLogger([]);
  const foo = LoggerImpl.getLogger("foo");
  const fooBar = foo.getChild("bar");
  const fooBaz = foo.getChild("baz");
  const fooBarQux = fooBar.getChild("qux");
  const fooQuux = foo.getChild("quux");

  try {
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
  } finally {
    root.resetDescendants();
  }
});

test("LoggerImpl.getSinks()", () => {
  const root = LoggerImpl.getLogger([]);
  const foo = LoggerImpl.getLogger("foo");
  const fooBar = foo.getChild("bar");
  const fooBaz = foo.getChild("baz");
  const fooBarQux = fooBar.getChild("qux");

  try {
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
  } finally {
    root.resetDescendants();
  }
});

test("LoggerImpl.emit()", () => {
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

  try {
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
  } finally {
    while (rootRecords.length > 0) rootRecords.pop();
    while (fooRecords.length > 0) fooRecords.pop();
    while (fooBarRecords.length > 0) fooBarRecords.pop();
  }

  const errorSink: Sink = () => {
    throw new Error("This is an error");
  };
  fooBarBaz.sinks.push(errorSink);

  try {
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
  } finally {
    while (rootRecords.length > 0) rootRecords.pop();
    while (fooRecords.length > 0) fooRecords.pop();
    while (fooBarRecords.length > 0) fooBarRecords.pop();
    while (root.filters.length > 0) root.filters.pop();
    while (foo.filters.length > 0) foo.filters.pop();
    while (fooBar.filters.length > 0) fooBar.filters.pop();
    root.sinks.pop();
  }

  root.lowestLevel = "debug";
  foo.lowestLevel = "error";
  fooBar.lowestLevel = "info";

  try {
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
  } finally {
    root.resetDescendants();
  }
});

test("LoggerImpl.log()", () => {
  const logger = LoggerImpl.getLogger("foo");

  try {
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
  } finally {
    logger.resetDescendants();
  }
});

test("LoggerImpl.logLazily()", () => {
  const logger = LoggerImpl.getLogger("foo");

  let called = 0;
  function calc() {
    called++;
    return 123;
  }

  try {
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
  } finally {
    logger.resetDescendants();
  }
});

test("LoggerImpl.logTemplate()", () => {
  const logger = LoggerImpl.getLogger("foo");

  function info(tpl: TemplateStringsArray, ...values: unknown[]) {
    logger.logTemplate("info", tpl, values);
  }

  try {
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
  } finally {
    logger.resetDescendants();
  }
});

test("LoggerCtx.log()", () => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  try {
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
  } finally {
    logger.resetDescendants();
  }
});

test("LoggerCtx.logLazily()", () => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  let called = 0;
  function calc() {
    called++;
    return 123;
  }

  try {
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
  } finally {
    logger.resetDescendants();
  }
});

test("LoggerCtx.logTemplate()", () => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  function info(tpl: TemplateStringsArray, ...values: unknown[]) {
    ctx.logTemplate("info", tpl, values);
  }

  try {
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
  } finally {
    logger.resetDescendants();
  }
});

const methods = [
  "trace",
  "debug",
  "info",
  "warn",
  "warning",
  "error",
  "fatal",
] as const;

for (const method of methods) {
  test(`Logger.${method}() [template]`, () => {
    const logger = LoggerImpl.getLogger("foo");
    const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

    function tpl(tpl: TemplateStringsArray, ...values: unknown[]) {
      logger[method](tpl, ...values);
    }

    const logs: LogRecord[] = [];
    try {
      logger.sinks.push(logs.push.bind(logs));
      const before = Date.now();
      tpl`Hello, ${123}!`;
      const after = Date.now();
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
    } finally {
      logs.shift();
    }

    function ctxTpl(tpl: TemplateStringsArray, ...values: unknown[]) {
      ctx[method](tpl, ...values);
    }

    try {
      const before = Date.now();
      ctxTpl`Hello, ${123}!`;
      const after = Date.now();
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
    } finally {
      logger.resetDescendants();
    }
  });

  test(`Logger.${method}() [lazy template]`, () => {
    const logger = LoggerImpl.getLogger("foo");
    const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

    try {
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
    } finally {
      logger.resetDescendants();
    }
  });

  test(`Logger.${method}() [eager]`, () => {
    const logger = LoggerImpl.getLogger("foo");
    const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

    try {
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
    } finally {
      logger.resetDescendants();
    }
  });

  test(`Logger.${method}() [lazy]`, () => {
    const logger = LoggerImpl.getLogger("foo");
    const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

    try {
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
    } finally {
      logger.resetDescendants();
    }
  });

  test(`Logger.${method}() [with no message]`, () => {
    const logger = LoggerImpl.getLogger("foo");

    try {
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
    } finally {
      logger.resetDescendants();
    }
  });
}

test("parseMessageTemplate()", () => {
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

test("renderMessage()", () => {
  function rm(tpl: TemplateStringsArray, ...values: unknown[]) {
    return renderMessage(tpl, values);
  }
  assertEquals(rm`Hello, world!`, ["Hello, world!"]);
  assertEquals(rm`Hello, ${123}!`, ["Hello, ", 123, "!"]);
  assertEquals(rm`Hello, ${123}, ${456}!`, ["Hello, ", 123, ", ", 456, "!"]);
  assertEquals(rm`Hello, ${123}, ${456}`, ["Hello, ", 123, ", ", 456, ""]);
});

test("LogMethod", () => {
  // The below test ensures that the LogMethod type is correctly inferred,
  // which is checked at compile time:
  const logger = LoggerImpl.getLogger("foo");
  let _method: LogMethod = logger.trace;
  _method = logger.debug;
  _method = logger.info;
  _method = logger.warn;
  _method = logger.warning;
  _method = logger.error;
  _method = logger.fatal;
  const ctx = logger.with({});
  _method = ctx.trace;
  _method = ctx.debug;
  _method = ctx.info;
  _method = ctx.warn;
  _method = ctx.warning;
  _method = ctx.error;
  _method = ctx.fatal;
});

test("Logger.emit() with custom timestamp", () => {
  const logger = getLogger(["test", "emit"]);
  const records: LogRecord[] = [];
  const sink: Sink = (record) => records.push(record);

  try {
    (logger as LoggerImpl).sinks.push(sink);

    const customTimestamp = Date.now() - 60000; // 1 minute ago
    logger.emit({
      timestamp: customTimestamp,
      level: "info",
      message: ["Custom message with", "value"],
      rawMessage: "Custom message with {value}",
      properties: { value: "test", source: "external" },
    });

    assertEquals(records.length, 1);
    assertEquals(records[0].category, ["test", "emit"]);
    assertEquals(records[0].level, "info");
    assertEquals(records[0].timestamp, customTimestamp);
    assertEquals(records[0].message, ["Custom message with", "value"]);
    assertEquals(records[0].rawMessage, "Custom message with {value}");
    assertEquals(records[0].properties, { value: "test", source: "external" });
  } finally {
    (logger as LoggerImpl).reset();
  }
});

test("Logger.emit() preserves all fields", () => {
  const logger = getLogger("emit-test");
  const records: LogRecord[] = [];
  const sink: Sink = (record) => records.push(record);

  try {
    (logger as LoggerImpl).sinks.push(sink);

    const testTimestamp = 1672531200000; // Fixed timestamp
    const testMessage = ["Log from", "Kafka", "at", "partition 0"];
    const testRawMessage =
      "Log from {source} at {location} partition {partition}";
    const testProperties = {
      partition: 0,
      offset: 12345,
      topic: "test-topic",
      source: "kafka",
    };

    logger.emit({
      timestamp: testTimestamp,
      level: "debug",
      message: testMessage,
      rawMessage: testRawMessage,
      properties: testProperties,
    });

    assertEquals(records.length, 1);
    const record = records[0];
    assertEquals(record.category, ["emit-test"]);
    assertEquals(record.level, "debug");
    assertEquals(record.timestamp, testTimestamp);
    assertEquals(record.message, testMessage);
    assertEquals(record.rawMessage, testRawMessage);
    assertEquals(record.properties, testProperties);
  } finally {
    (logger as LoggerImpl).reset();
  }
});

test("LoggerCtx.emit() merges contextual properties", () => {
  const logger = getLogger("ctx-emit");
  const ctx = logger.with({ requestId: "req-123", userId: "user-456" });
  const records: LogRecord[] = [];
  const sink: Sink = (record) => records.push(record);

  try {
    (logger as LoggerImpl).sinks.push(sink);

    ctx.emit({
      timestamp: Date.now(),
      level: "warning",
      message: ["External warning from", "system"],
      rawMessage: "External warning from {system}",
      properties: { system: "external", priority: "high" },
    });

    assertEquals(records.length, 1);
    const record = records[0];
    assertEquals(record.category, ["ctx-emit"]);
    assertEquals(record.level, "warning");
    assertEquals(record.properties, {
      system: "external",
      priority: "high",
      requestId: "req-123",
      userId: "user-456",
    });
  } finally {
    (logger as LoggerImpl).reset();
  }
});

test("LoggerCtx.emit() record properties override context properties", () => {
  const logger = getLogger("override-test");
  const ctx = logger.with({ source: "context", shared: "from-context" });
  const records: LogRecord[] = [];
  const sink: Sink = (record) => records.push(record);

  try {
    (logger as LoggerImpl).sinks.push(sink);

    ctx.emit({
      timestamp: Date.now(),
      level: "error",
      message: ["Override test"],
      rawMessage: "Override test",
      properties: { source: "record", priority: "critical" },
    });

    assertEquals(records.length, 1);
    const record = records[0];
    assertEquals(record.properties, {
      source: "record", // record properties override context
      shared: "from-context", // context properties are preserved
      priority: "critical",
    });
  } finally {
    (logger as LoggerImpl).reset();
  }
});

test("Logger.emit() respects filters", () => {
  const logger = getLogger("filtered-emit");
  const records: LogRecord[] = [];
  const sink: Sink = (record) => records.push(record);

  try {
    (logger as LoggerImpl).sinks.push(sink);
    (logger as LoggerImpl).filters.push((record) => record.level !== "debug");

    // This should be filtered out
    logger.emit({
      timestamp: Date.now(),
      level: "debug",
      message: ["Debug message"],
      rawMessage: "Debug message",
      properties: {},
    });

    // This should pass through
    logger.emit({
      timestamp: Date.now(),
      level: "info",
      message: ["Info message"],
      rawMessage: "Info message",
      properties: {},
    });

    assertEquals(records.length, 1);
    assertEquals(records[0].level, "info");
  } finally {
    (logger as LoggerImpl).reset();
  }
});

test("Logger.emit() respects log level threshold", () => {
  const logger = getLogger("level-emit");
  const records: LogRecord[] = [];
  const sink: Sink = (record) => records.push(record);

  try {
    (logger as LoggerImpl).sinks.push(sink);
    (logger as LoggerImpl).lowestLevel = "warning";

    // This should be filtered out (below threshold)
    logger.emit({
      timestamp: Date.now(),
      level: "info",
      message: ["Info message"],
      rawMessage: "Info message",
      properties: {},
    });

    // This should pass through (at threshold)
    logger.emit({
      timestamp: Date.now(),
      level: "warning",
      message: ["Warning message"],
      rawMessage: "Warning message",
      properties: {},
    });

    assertEquals(records.length, 1);
    assertEquals(records[0].level, "warning");
  } finally {
    (logger as LoggerImpl).reset();
  }
});
