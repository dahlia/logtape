import assert from "node:assert/strict";
import test from "node:test";
import { toFilter } from "./filter.ts";
import { debug, error, info, warning } from "./fixtures.ts";
import {
  getLogger,
  isLazy,
  lazy,
  LoggerCtx,
  LoggerImpl,
  type LogMethod,
  parseMessageTemplate,
  renderMessage,
} from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

function templateLiteral(tpl: TemplateStringsArray, ..._: unknown[]) {
  return tpl;
}

test("getLogger()", () => {
  assert.deepStrictEqual(getLogger().category, []);
  assert.strictEqual(getLogger(), getLogger());
  assert.strictEqual(getLogger([]), getLogger());
  assert.deepStrictEqual(getLogger("foo").category, ["foo"]);
  assert.strictEqual(getLogger("foo"), getLogger("foo"));
  assert.strictEqual(getLogger("foo"), getLogger(["foo"]));
  assert.strictEqual(getLogger("foo"), getLogger().getChild("foo"));
  assert.deepStrictEqual(getLogger(["foo", "bar"]).category, ["foo", "bar"]);
  assert.strictEqual(
    getLogger(["foo", "bar"]),
    getLogger().getChild(["foo", "bar"]),
  );
  assert.strictEqual(
    getLogger(["foo", "bar"]),
    getLogger().getChild("foo").getChild("bar"),
  );
});

test("Logger.getChild()", () => {
  const foo = getLogger("foo");
  const fooBar = foo.getChild("bar");
  assert.deepStrictEqual(fooBar.category, ["foo", "bar"]);
  assert.strictEqual(fooBar.parent, foo);
  const fooBarBaz = foo.getChild(["bar", "baz"]);
  assert.deepStrictEqual(fooBarBaz.category, ["foo", "bar", "baz"]);
  assert.deepStrictEqual(fooBarBaz.parent, fooBar);

  const fooCtx = foo.with({ a: 1, b: 2 });
  const fooBarCtx = fooCtx.getChild("bar");
  assert.deepStrictEqual(fooBarCtx.category, ["foo", "bar"]);
  // @ts-ignore: internal attribute:
  assert.deepStrictEqual(fooBarCtx.properties, { a: 1, b: 2 });
});

test("Logger.with()", () => {
  const foo = getLogger("foo");
  const ctx = foo.with({ a: 1, b: 2 });
  assert.deepStrictEqual(ctx.parent, getLogger());
  assert.deepStrictEqual(ctx.category, ["foo"]);
  // @ts-ignore: internal attribute:
  assert.deepStrictEqual(ctx.properties, { a: 1, b: 2 });
  // @ts-ignore: internal attribute:
  assert.deepStrictEqual(ctx.with({ c: 3 }).properties, { a: 1, b: 2, c: 3 });
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
    assert.ok(root.filter(info));
    assert.ok(foo.filter(info));
    assert.ok(fooBar.filter(info));
    assert.ok(!fooBaz.filter(info));
    assert.ok(fooBarQux.filter(info));
    assert.ok(fooQuux.filter(info));
    assert.ok(root.filter(debug));
    assert.ok(!foo.filter(debug));
    assert.ok(fooBar.filter(debug));
    assert.ok(!fooBaz.filter(debug));
    assert.ok(fooBarQux.filter(debug));
    assert.ok(!fooQuux.filter(debug));
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
    assert.deepStrictEqual([...root.getSinks("debug")], []);
    assert.deepStrictEqual([...foo.getSinks("debug")], [sinkA]);
    assert.deepStrictEqual([...fooBar.getSinks("debug")], [sinkA, sinkB]);
    assert.deepStrictEqual([...fooBaz.getSinks("debug")], [sinkA, sinkC]);
    assert.deepStrictEqual([...fooBarQux.getSinks("debug")], [
      sinkA,
      sinkB,
      sinkD,
    ]);
    fooBarQux.parentSinks = "override";
    assert.deepStrictEqual([...fooBarQux.getSinks("debug")], [sinkD]);
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
    assert.deepStrictEqual(rootRecords, []);
    assert.deepStrictEqual(fooRecords, []);
    assert.deepStrictEqual(fooBarRecords, []);
    root.emit(warning);
    assert.deepStrictEqual(rootRecords, [warning]);
    assert.deepStrictEqual(fooRecords, []);
    assert.deepStrictEqual(fooBarRecords, []);

    foo.emit(debug);
    assert.deepStrictEqual(rootRecords, [warning]);
    assert.deepStrictEqual(fooRecords, []);
    assert.deepStrictEqual(fooBarRecords, []);
    foo.emit(info);
    assert.deepStrictEqual(rootRecords, [warning, info]);
    assert.deepStrictEqual(fooRecords, [info]);
    assert.deepStrictEqual(fooBarRecords, []);

    fooBar.emit(warning);
    assert.deepStrictEqual(rootRecords, [warning, info]);
    assert.deepStrictEqual(fooRecords, [info]);
    assert.deepStrictEqual(fooBarRecords, []);
    fooBar.emit(error);
    assert.deepStrictEqual(rootRecords, [warning, info, error]);
    assert.deepStrictEqual(fooRecords, [info, error]);
    assert.deepStrictEqual(fooBarRecords, [error]);
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
    assert.strictEqual(rootRecords.length, 2);
    assert.deepStrictEqual(rootRecords[0], error);
    assert.deepStrictEqual(fooRecords, [error]);
    assert.deepStrictEqual(fooBarRecords, [error]);
    const metaRecord = rootRecords[1] as LogRecord;
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "fatal");
    assert.deepStrictEqual(metaRecord.message, [
      "Failed to emit a log record to sink ",
      errorSink,
      ": ",
      metaRecord.properties.error,
      "",
    ]);
    assert.deepStrictEqual(metaRecord.properties, {
      record: error,
      sink: errorSink,
      error: metaRecord.properties.error,
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
    assert.deepStrictEqual(rootRecords, []);
    assert.deepStrictEqual(fooRecords, []);
    assert.deepStrictEqual(fooBarRecords, []);

    const debugRecord = { ...debug, category: ["foo", "qux"] };
    fooQux.emit(debugRecord);
    assert.deepStrictEqual(rootRecords, []);
    assert.deepStrictEqual(fooRecords, []);
    assert.deepStrictEqual(fooQuxRecords, [debugRecord]);

    foo.emit({ ...debug, category: ["foo"] });
    assert.deepStrictEqual(rootRecords, []);
    assert.deepStrictEqual(fooRecords, []);

    const debugRecord2 = { ...debug, category: [] };
    root.emit(debugRecord2);
    assert.deepStrictEqual(rootRecords, [debugRecord2]);

    const infoRecord = { ...info, category: ["foo", "bar"] };
    fooBar.emit(infoRecord);
    assert.deepStrictEqual(rootRecords, [debugRecord2]);
    assert.deepStrictEqual(fooRecords, []);
    assert.deepStrictEqual(fooBarRecords, [infoRecord]);
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
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 123, "!"],
        rawMessage: "Hello, {foo}!",
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: { foo: 123 },
      },
    ]);
    assert.ok(logs[0].timestamp >= before);
    assert.ok(logs[0].timestamp <= after);

    logs.shift();
    logger.filters.push(toFilter("error"));
    let called = 0;
    logger.log("warning", "Hello, {foo}!", () => {
      called++;
      return { foo: 123 };
    });
    assert.deepStrictEqual(logs, []);
    assert.strictEqual(called, 0);

    logger.log("error", "Hello, {foo}!", () => {
      called++;
      return { foo: 123 };
    });
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 123, "!"],
        rawMessage: "Hello, {foo}!",
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: { foo: 123 },
      },
    ]);
    assert.strictEqual(called, 1);
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
    assert.deepStrictEqual(logs, []);
    assert.strictEqual(called, 0);

    const before = Date.now();
    logger.logLazily("error", (l) => l`Hello, ${calc()}!`);
    const after = Date.now();
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: {},
      },
    ]);
    assert.ok((logs[0] as LogRecord).timestamp >= before);
    assert.ok((logs[0] as LogRecord).timestamp <= after);
    assert.strictEqual(called, 1);
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
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: {},
      },
    ]);
    assert.ok(logs[0].timestamp >= before);
    assert.ok(logs[0].timestamp <= after);
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
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
        rawMessage: "Hello, {a} {b} {c}!",
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: { a: 1, b: 2, c: 3 },
      },
    ]);
    assert.ok(logs[0].timestamp >= before);
    assert.ok(logs[0].timestamp <= after);

    logs.shift();
    logger.filters.push(toFilter("error"));
    let called = 0;
    ctx.log("warning", "Hello, {a} {b} {c}!", () => {
      called++;
      return { c: 3 };
    });
    assert.deepStrictEqual(logs, []);
    assert.strictEqual(called, 0);

    ctx.log("error", "Hello, {a} {b} {c}!", () => {
      called++;
      return { c: 3 };
    });
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
        rawMessage: "Hello, {a} {b} {c}!",
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: { a: 1, b: 2, c: 3 },
      },
    ]);
    assert.strictEqual(called, 1);
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
    assert.deepStrictEqual(logs, []);
    assert.strictEqual(called, 0);

    const before = Date.now();
    ctx.logLazily("error", (l) => l`Hello, ${calc()}!`);
    const after = Date.now();
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "error",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: { a: 1, b: 2 },
      },
    ]);
    assert.ok((logs[0] as LogRecord).timestamp >= before);
    assert.ok((logs[0] as LogRecord).timestamp <= after);
    assert.strictEqual(called, 1);
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
    assert.deepStrictEqual(logs, [
      {
        category: ["foo"],
        level: "info",
        message: ["Hello, ", 123, "!"],
        rawMessage: templateLiteral`Hello, ${null}!`,
        timestamp: (logs[0] as LogRecord).timestamp,
        properties: { a: 1, b: 2 },
      },
    ]);
    assert.ok(logs[0].timestamp >= before);
    assert.ok(logs[0].timestamp <= after);
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
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: {},
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
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
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2 },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
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
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: {},
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);

      logs.shift();
      before = Date.now();
      ctx[method]((l) => l`Hello, ${123}!`);
      after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: templateLiteral`Hello, ${null}!`,
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2 },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
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
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: "Hello, {foo}!",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { foo: 123 },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);

      logs.shift();
      logger[method]("Hello, world!");
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, world!"],
          rawMessage: "Hello, world!",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: {},
        },
      ]);

      logs.shift();
      before = Date.now();
      ctx[method]("Hello, {a} {b} {c}!", { c: 3 });
      after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
          rawMessage: "Hello, {a} {b} {c}!",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, c: 3 },
        },
      ]);

      logs.shift();
      ctx[method]("Hello, world!");
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, world!"],
          rawMessage: "Hello, world!",
          timestamp: (logs[0] as LogRecord).timestamp,
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
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 123, "!"],
          rawMessage: "Hello, {foo}!",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { foo: 123 },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);

      logs.shift();
      before = Date.now();
      ctx[method]("Hello, {a} {b} {c}!", () => {
        return { c: 3 };
      });
      after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["Hello, ", 1, " ", 2, " ", 3, "!"],
          rawMessage: "Hello, {a} {b} {c}!",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, c: 3 },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
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
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: method === "warn" ? "warning" : method,
          message: ["", { foo: 123, bar: 456 }, ""],
          rawMessage: "{*}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { foo: 123, bar: 456 },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    } finally {
      logger.resetDescendants();
    }
  });
}

test("Logger.error() [error overload]", () => {
  const logger = LoggerImpl.getLogger("foo");
  const ctx = new LoggerCtx(logger, { a: 1, b: 2 });

  try {
    const logs: LogRecord[] = [];
    logger.sinks.push(logs.push.bind(logs));

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.error(err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "error",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.error(err, { extra: "my extra value" });
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "error",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err, extra: "my extra value" },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.error("Something happened", err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "error",
          message: ["Something happened"],
          rawMessage: "Something happened",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.error(err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "error",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.error(err, { extra: "my extra value" });
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "error",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err, extra: "my extra value" },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.error("Something happened", err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "error",
          message: ["Something happened"],
          rawMessage: "Something happened",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.warn(err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "warning",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.warn("Something happened", err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "warning",
          message: ["Something happened"],
          rawMessage: "Something happened",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.warn(err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "warning",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.warn("Something happened", err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "warning",
          message: ["Something happened"],
          rawMessage: "Something happened",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.fatal(err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "fatal",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      logger.fatal("Something happened", err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "fatal",
          message: ["Something happened"],
          rawMessage: "Something happened",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.fatal(err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "fatal",
          message: ["", "boom", ""],
          rawMessage: "{error.message}",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }

    logs.shift();

    {
      const err = new Error("boom");
      const before = Date.now();
      ctx.fatal("Something happened", err);
      const after = Date.now();
      assert.deepStrictEqual(logs, [
        {
          category: ["foo"],
          level: "fatal",
          message: ["Something happened"],
          rawMessage: "Something happened",
          timestamp: (logs[0] as LogRecord).timestamp,
          properties: { a: 1, b: 2, error: err },
        },
      ]);
      assert.ok(logs[0].timestamp >= before);
      assert.ok(logs[0].timestamp <= after);
    }
  } finally {
    logger.resetDescendants();
  }
});

test("parseMessageTemplate()", () => {
  assert.deepStrictEqual(parseMessageTemplate("Hello, world!", {}), [
    "Hello, world!",
  ]);
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, world!", { foo: 123 }),
    ["Hello, world!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {{world}}!", { foo: 123 }),
    ["Hello, {world}!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {foo}!", { foo: 123 }),
    ["Hello, ", 123, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, { foo\t}!", { " foo\t": 123, foo: 456 }),
    ["Hello, ", 123, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, { foo\t}!", { foo: 456 }),
    ["Hello, ", 456, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, { foo\t}!", { " foo": 456 }),
    ["Hello, ", undefined, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {{foo}}!", { foo: 123 }),
    ["Hello, {foo}!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {bar}!", { foo: 123 }),
    ["Hello, ", undefined, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {bar}!", { foo: 123, bar: 456 }),
    ["Hello, ", 456, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {foo}, {bar}!", { foo: 123, bar: 456 }),
    ["Hello, ", 123, ", ", 456, "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {foo}, {bar}", { foo: 123, bar: 456 }),
    ["Hello, ", 123, ", ", 456, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {*}", { foo: 123, bar: 456 }),
    ["Hello, ", { foo: 123, bar: 456 }, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, { *\t}", { foo: 123, bar: 456 }),
    ["Hello, ", { foo: 123, bar: 456 }, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {*}", { foo: 123, bar: 456, "*": 789 }),
    ["Hello, ", 789, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, { *\t}", { foo: 123, bar: 456, " *\t": 789 }),
    ["Hello, ", 789, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, { *\t}", { foo: 123, bar: 456, "*": 789 }),
    ["Hello, ", 789, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {{world!", { foo: 123 }),
    ["Hello, {world!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {user.name}!", {
      user: { name: "foo", email: "foo@example.com" },
    }),
    ["Hello, ", "foo", "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Email: {user.email}", {
      user: { name: "foo", email: "foo@example.com" },
    }),
    ["Email: ", "foo@example.com", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Tier: {order.customer.profile.tier}", {
      order: {
        customer: {
          profile: {
            tier: "premium",
          },
        },
      },
    }),
    ["Tier: ", "premium", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Missing: {user.email}", {
      user: { name: "foo" },
    }),
    ["Missing: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Deep missing: {user.profile.email}", {
      user: { name: "foo" },
    }),
    ["Deep missing: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("First user: {users[0]}", {
      users: ["foo", "bar", "baz"],
    }),
    ["First user: ", "foo", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Third user: {users[2]}", {
      users: ["foo", "bar", "baz"],
    }),
    ["Third user: ", "baz", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Admin: {users[0].name}", {
      users: [
        { name: "foo", role: "admin" },
        { name: "bar", role: "user" },
      ],
    }),
    ["Admin: ", "foo", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("User role: {users[1].role}", {
      users: [
        { name: "foo", role: "admin" },
        { name: "bar", role: "user" },
      ],
    }),
    ["User role: ", "user", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Beyond: {users[5]}", {
      users: ["foo", "bar"],
    }),
    ["Beyond: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Invalid: {user[0]}", {
      user: "foo",
    }),
    ["Invalid: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Full name: {user["full-name"]}', {
      user: { "full-name": "foo bar", "user-id": 123 },
    }),
    ["Full name: ", "foo bar", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('User ID: {user["user-id"]}', {
      user: { "full-name": "foo bar", "user-id": 123 },
    }),
    ["User ID: ", 123, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Name: {user['full-name']}", {
      user: { "full-name": "foo bar", "nick-name": "fb" },
    }),
    ["Name: ", "foo bar", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Nick: {user["nick-name"]}', {
      user: { "full-name": "foo bar", "nick-name": "fb" },
    }),
    ["Nick: ", "fb", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Custom: {data["custom field"]}', {
      data: { "custom field": "value" },
    }),
    ["Custom: ", "value", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('First user: {users[0]["full-name"]}', {
      users: [{ "full-name": "foo bar" }, { "full-name": "bar baz" }],
    }),
    ["First user: ", "foo bar", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Name: {user?.name}", {
      user: { name: "foo" },
    }),
    ["Name: ", "foo", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Email: {user?.profile?.email}", {
      user: { name: "foo" },
    }),
    ["Email: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Item: {data?.items?.[0]?.name}", {
      data: null,
    }),
    ["Item: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Name: {user?.name}", {
      user: null,
    }),
    ["Name: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(
      'Email: {users[0]?.profile?.["contact-info"]?.email}',
      {
        users: [
          {
            profile: {
              "contact-info": {
                email: "foo@example.com",
              },
            },
          },
        ],
      },
    ),
    ["Email: ", "foo@example.com", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Hello, {user}!", {
      user: "foo",
      count: 42,
    }),
    ["Hello, ", "foo", "!"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Dot property: {user.name}", {
      "user.name": "foo",
      "user.email": "foo@example.com",
    }),
    ["Dot property: ", "foo", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("All: {*}", {
      user: { name: "foo" },
      count: 42,
    }),
    ["All: ", { user: { name: "foo" }, count: 42 }, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Malformed: {user["name}', {
      user: { name: "foo" },
    }),
    ["Malformed: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Empty: {user[]}", {
      user: { name: "foo" },
    }),
    ["Empty: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Invalid: {users[abc]}", {
      users: ["foo", "bar"],
    }),
    ["Invalid: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Protected: {foo.constructor}", {
      foo: { bar: 123 },
    }),
    ["Protected: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Protected: {foo.prototype}", {
      foo: { bar: 123 },
    }),
    ["Protected: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Protected: {foo.__proto__}", {
      foo: { bar: 123 },
    }),
    ["Protected: ", undefined, ""],
  );

  // Boundary conditions
  assert.deepStrictEqual(parseMessageTemplate("", {}), [""]);
  assert.deepStrictEqual(
    parseMessageTemplate("no placeholders", {}),
    ["no placeholders"],
  );
  assert.deepStrictEqual(parseMessageTemplate("{value}", { value: 1 }), [
    "",
    1,
    "",
  ]);
  assert.deepStrictEqual(
    parseMessageTemplate("A {x}{y} B", { x: 1, y: 2 }),
    ["A ", 1, "", 2, " B"],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Deep: {a.b.c.d.e}", {
      a: { b: { c: { d: { e: 5 } } } },
    }),
    ["Deep: ", 5, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("2D: {m[1][0]}", { m: [[0, 1], [2, 3]] }),
    ["2D: ", 2, ""],
  );

  // Parsing error cases
  assert.deepStrictEqual(
    parseMessageTemplate("Missing: {user", { user: 1 }),
    ["Missing: {user"],
  );
  assert.deepStrictEqual(parseMessageTemplate("Extra: user}", {}), [
    "Extra: user}",
  ]);
  assert.deepStrictEqual(
    parseMessageTemplate("Bad: {user.}", { user: { name: "x" } }),
    ["Bad: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Bad: {.user}", { user: { name: "x" } }),
    ["Bad: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Bad: {user..name}", { user: { name: "x" } }),
    ["Bad: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Bad idx: {arr[-1]}", { arr: [1] }),
    ["Bad idx: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Float idx: {arr[1.5]}", { arr: [1, 2] }),
    ["Float idx: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Bad quote: {user["na\\"}', {
      user: { 'na"': "v" },
    }),
    ["Bad quote: ", undefined, ""],
  );
  assert.deepStrictEqual(parseMessageTemplate("Empty: {}", { a: 1 }), [
    "Empty: ",
    undefined,
    "",
  ]);

  // Type conversion - ensure values are not stringified
  assert.deepStrictEqual(parseMessageTemplate("Num: {n}", { n: 0 }), [
    "Num: ",
    0,
    "",
  ]);
  assert.deepStrictEqual(parseMessageTemplate("Bool: {b}", { b: true }), [
    "Bool: ",
    true,
    "",
  ]);
  assert.deepStrictEqual(parseMessageTemplate("Null: {x}", { x: null }), [
    "Null: ",
    null,
    "",
  ]);
  assert.deepStrictEqual(parseMessageTemplate("Undef: {x}", {}), [
    "Undef: ",
    undefined,
    "",
  ]);
  const testSymbol = Symbol("test");
  assert.deepStrictEqual(parseMessageTemplate("Sym: {s}", { s: testSymbol }), [
    "Sym: ",
    testSymbol,
    "",
  ]);
  assert.deepStrictEqual(parseMessageTemplate("BigInt: {b}", { b: 10n }), [
    "BigInt: ",
    10n,
    "",
  ]);
  const testFn = () => {};
  assert.deepStrictEqual(parseMessageTemplate("Fn: {fn}", { fn: testFn }), [
    "Fn: ",
    testFn,
    "",
  ]);
  const testDate = new Date(0);
  assert.deepStrictEqual(parseMessageTemplate("Date: {d}", { d: testDate }), [
    "Date: ",
    testDate,
    "",
  ]);
  const testRegex = /x/;
  assert.deepStrictEqual(
    parseMessageTemplate("RegExp: {r}", { r: testRegex }),
    [
      "RegExp: ",
      testRegex,
      "",
    ],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Nested arr: {a[1][0]}", { a: [[0], [1, 2]] }),
    ["Nested arr: ", 1, ""],
  );

  // Complex patterns
  assert.deepStrictEqual(
    parseMessageTemplate("Hi {first} {last}", { first: "A", last: "B" }),
    ["Hi ", "A", " ", "B", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("{a}{b}{c}", { a: 1, b: 2, c: 3 }),
    [
      "",
      1,
      "",
      2,
      "",
      3,
      "",
    ],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Mix: {users?.[0].profile['full-name']}", {
      users: [{ profile: { "full-name": "X" } }],
    }),
    ["Mix: ", "X", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Len: {arr.length}", { arr: [1, 2, 3] }),
    ["Len: ", 3, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("All: {*}, id={id}", { id: 1, a: 2 }),
    ["All: ", { id: 1, a: 2 }, ", id=", 1, ""],
  );

  // Security - block dangerous props at any depth
  assert.deepStrictEqual(
    parseMessageTemplate("Blocked: {user.profile.constructor}", {
      user: { profile: {} },
    }),
    ["Blocked: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Blocked: {user["__proto__"]}', { user: {} }),
    ["Blocked: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Blocked: {user.profile["constructor"]}', {
      user: { profile: {} },
    }),
    ["Blocked: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Blocked: {obj["prototype"]}', { obj: {} }),
    ["Blocked: ", undefined, ""],
  );

  // Optional chaining variants
  assert.deepStrictEqual(
    parseMessageTemplate("Root opt: {arr?.[0]}", { arr: ["x"] }),
    ["Root opt: ", "x", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Opt mid: {a?.b.c}", { a: null }),
    ["Opt mid: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Opt end: {a.b?.c}", { a: { b: null } }),
    ["Opt end: ", undefined, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Opt quoted: {obj?.["k-v"]}', { obj: { "k-v": 1 } }),
    ["Opt quoted: ", 1, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate("Opt after idx: {list[0]?.name}", {
      list: [{ name: "x" }],
    }),
    ["Opt after idx: ", "x", ""],
  );

  // Unicode and special characters
  assert.deepStrictEqual(
    parseMessageTemplate('Emoji: {data["😀"]}', { data: { "😀": 1 } }),
    ["Emoji: ", 1, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Astral: {data["𝟘𝟙"]}', { data: { "𝟘𝟙": "ok" } }),
    ["Astral: ", "ok", ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`Quotes: {data["quo\"te"]}`, {
      data: { 'quo"te': 1 },
    }),
    ["Quotes: ", 1, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`SQuotes: {data['sin\'gle']}`, {
      data: { "sin'gle": 2 },
    }),
    ["SQuotes: ", 2, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`Backslash: {data["back\\slash"]}`, {
      data: { "back\\slash": 3 },
    }),
    ["Backslash: ", 3, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`Newline: {data["line\nbreak"]}`, {
      data: { "line\nbreak": 4 },
    }),
    ["Newline: ", 4, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`Tab: {data["tab\tseparated"]}`, {
      data: { "tab\tseparated": 5 },
    }),
    ["Tab: ", 5, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`Multiple: {data["a\nb\tc"]}`, {
      data: { "a\nb\tc": 6 },
    }),
    ["Multiple: ", 6, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate(String.raw`Unicode: {data["smile\u263A"]}`, {
      data: { "smile☺": 7 },
    }),
    ["Unicode: ", 7, ""],
  );
  assert.deepStrictEqual(
    parseMessageTemplate('Dot in key: {data["a.b c"]}', {
      data: { "a.b c": 1 },
    }),
    ["Dot in key: ", 1, ""],
  );
});

test("renderMessage()", () => {
  function rm(tpl: TemplateStringsArray, ...values: unknown[]) {
    return renderMessage(tpl, values);
  }
  assert.deepStrictEqual(rm`Hello, world!`, ["Hello, world!"]);
  assert.deepStrictEqual(rm`Hello, ${123}!`, ["Hello, ", 123, "!"]);
  assert.deepStrictEqual(rm`Hello, ${123}, ${456}!`, [
    "Hello, ",
    123,
    ", ",
    456,
    "!",
  ]);
  assert.deepStrictEqual(rm`Hello, ${123}, ${456}`, [
    "Hello, ",
    123,
    ", ",
    456,
    "",
  ]);
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

    assert.strictEqual(records.length, 1);
    assert.deepStrictEqual(records[0].category, ["test", "emit"]);
    assert.strictEqual(records[0].level, "info");
    assert.strictEqual(records[0].timestamp, customTimestamp);
    assert.deepStrictEqual(records[0].message, [
      "Custom message with",
      "value",
    ]);
    assert.strictEqual(records[0].rawMessage, "Custom message with {value}");
    assert.deepStrictEqual(records[0].properties, {
      value: "test",
      source: "external",
    });
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

    assert.strictEqual(records.length, 1);
    const record = records[0];
    assert.deepStrictEqual(record.category, ["emit-test"]);
    assert.strictEqual(record.level, "debug");
    assert.strictEqual(record.timestamp, testTimestamp);
    assert.deepStrictEqual(record.message, testMessage);
    assert.strictEqual(record.rawMessage, testRawMessage);
    assert.deepStrictEqual(record.properties, testProperties);
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

    assert.strictEqual(records.length, 1);
    const record = records[0];
    assert.deepStrictEqual(record.category, ["ctx-emit"]);
    assert.strictEqual(record.level, "warning");
    assert.deepStrictEqual(record.properties, {
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

    assert.strictEqual(records.length, 1);
    const record = records[0];
    assert.deepStrictEqual(record.properties, {
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

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].level, "info");
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

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].level, "warning");
  } finally {
    (logger as LoggerImpl).reset();
  }
});

test("Logger.isEnabledFor()", () => {
  const logger = LoggerImpl.getLogger("isEnabledFor");

  try {
    const sink: Sink = () => {};
    logger.sinks.push(sink);

    // With default lowestLevel ("trace"), all levels are enabled
    assert.ok(logger.isEnabledFor("trace"));
    assert.ok(logger.isEnabledFor("debug"));
    assert.ok(logger.isEnabledFor("info"));
    assert.ok(logger.isEnabledFor("warning"));
    assert.ok(logger.isEnabledFor("error"));
    assert.ok(logger.isEnabledFor("fatal"));

    // Set lowestLevel to "warning"
    logger.lowestLevel = "warning";
    assert.ok(!logger.isEnabledFor("trace"));
    assert.ok(!logger.isEnabledFor("debug"));
    assert.ok(!logger.isEnabledFor("info"));
    assert.ok(logger.isEnabledFor("warning"));
    assert.ok(logger.isEnabledFor("error"));
    assert.ok(logger.isEnabledFor("fatal"));

    // Set lowestLevel to null (disabled)
    logger.lowestLevel = null;
    assert.ok(!logger.isEnabledFor("trace"));
    assert.ok(!logger.isEnabledFor("debug"));
    assert.ok(!logger.isEnabledFor("info"));
    assert.ok(!logger.isEnabledFor("warning"));
    assert.ok(!logger.isEnabledFor("error"));
    assert.ok(!logger.isEnabledFor("fatal"));
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.isEnabledFor() without sinks", () => {
  const logger = LoggerImpl.getLogger("isEnabledFor-noSinks");

  try {
    // No sinks configured - should return false
    assert.ok(!logger.isEnabledFor("trace"));
    assert.ok(!logger.isEnabledFor("debug"));
    assert.ok(!logger.isEnabledFor("info"));
    assert.ok(!logger.isEnabledFor("warning"));
    assert.ok(!logger.isEnabledFor("error"));
    assert.ok(!logger.isEnabledFor("fatal"));
  } finally {
    logger.resetDescendants();
  }
});

test("LoggerCtx.isEnabledFor()", () => {
  const logger = LoggerImpl.getLogger("isEnabledFor-ctx");
  const ctx = new LoggerCtx(logger, { a: 1 });

  try {
    const sink: Sink = () => {};
    logger.sinks.push(sink);
    logger.lowestLevel = "warning";

    assert.ok(!ctx.isEnabledFor("trace"));
    assert.ok(!ctx.isEnabledFor("debug"));
    assert.ok(!ctx.isEnabledFor("info"));
    assert.ok(ctx.isEnabledFor("warning"));
    assert.ok(ctx.isEnabledFor("error"));
    assert.ok(ctx.isEnabledFor("fatal"));
  } finally {
    logger.resetDescendants();
  }
});

type LogMethodName =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "warning"
  | "error"
  | "fatal";

for (
  const method of [
    "trace",
    "debug",
    "info",
    "warn",
    "warning",
    "error",
    "fatal",
  ] as LogMethodName[]
) {
  test(`Logger.${method}() [async callback]`, async () => {
    const logger = LoggerImpl.getLogger("async-callback");
    const ctx = new LoggerCtx(logger, { ctx: "value" });

    try {
      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));

      // Test LoggerImpl with async callback
      const result = logger[method](
        "Async message with {value}.",
        // deno-lint-ignore require-await
        async () => ({ value: 42 }),
      );
      assert.ok(result instanceof Promise, "Should return a Promise");
      await result;

      assert.strictEqual(logs.length, 1);
      assert.deepStrictEqual(logs[0].message, ["Async message with ", 42, "."]);
      assert.strictEqual(logs[0].rawMessage, "Async message with {value}.");
      assert.deepStrictEqual(logs[0].properties, { value: 42 });

      // Test LoggerCtx with async callback
      logs.length = 0;
      const ctxResult = ctx[method](
        "Async ctx message with {value}.",
        // deno-lint-ignore require-await
        async () => ({ value: 123 }),
      );
      assert.ok(ctxResult instanceof Promise, "Should return a Promise");
      await ctxResult;

      assert.strictEqual(logs.length, 1);
      assert.deepStrictEqual(logs[0].message, [
        "Async ctx message with ",
        123,
        ".",
      ]);
      assert.strictEqual(logs[0].rawMessage, "Async ctx message with {value}.");
      assert.deepStrictEqual(logs[0].properties, { ctx: "value", value: 123 });
    } finally {
      logger.resetDescendants();
    }
  });

  test(`Logger.${method}() [async callback disabled]`, async () => {
    const logger = LoggerImpl.getLogger("async-callback-disabled");
    const ctx = new LoggerCtx(logger, { ctx: "value" });

    try {
      const logs: LogRecord[] = [];
      logger.sinks.push(logs.push.bind(logs));
      logger.lowestLevel = "fatal"; // Set to highest level so most are disabled

      let callbackCalled = false;
      const result = logger[method](
        "Async message with {value}.",
        // deno-lint-ignore require-await
        async () => {
          callbackCalled = true;
          return { value: 42 };
        },
      );

      if (method === "fatal") {
        // fatal is enabled, so callback should be called
        assert.ok(result instanceof Promise, "Should return a Promise");
        await result;
        assert.ok(
          callbackCalled,
          "Callback should be called for enabled level",
        );
        assert.strictEqual(logs.length, 1);
      } else {
        // Other levels are disabled
        assert.ok(result instanceof Promise, "Should return a Promise");
        await result;
        assert.ok(
          !callbackCalled,
          "Callback should NOT be called for disabled level",
        );
        assert.strictEqual(logs.length, 0);
      }

      // Test LoggerCtx with disabled level
      callbackCalled = false;
      logs.length = 0;
      const ctxResult = ctx[method](
        "Async ctx message with {value}.",
        // deno-lint-ignore require-await
        async () => {
          callbackCalled = true;
          return { value: 123 };
        },
      );

      if (method === "fatal") {
        assert.ok(ctxResult instanceof Promise, "Should return a Promise");
        await ctxResult;
        assert.ok(
          callbackCalled,
          "Callback should be called for enabled level",
        );
        assert.strictEqual(logs.length, 1);
      } else {
        assert.ok(ctxResult instanceof Promise, "Should return a Promise");
        await ctxResult;
        assert.ok(
          !callbackCalled,
          "Callback should NOT be called for disabled level",
        );
        assert.strictEqual(logs.length, 0);
      }
    } finally {
      logger.resetDescendants();
    }
  });
}

test("lazy() creates a lazy value", () => {
  let counter = 0;
  const lazyValue = lazy(() => ++counter);

  assert.ok(isLazy(lazyValue));
  assert.strictEqual(counter, 0); // not evaluated yet
  assert.strictEqual(lazyValue.getter(), 1);
  assert.strictEqual(lazyValue.getter(), 2);
});

test("isLazy() returns false for non-lazy values", () => {
  assert.ok(!isLazy(null));
  assert.ok(!isLazy(undefined));
  assert.ok(!isLazy(123));
  assert.ok(!isLazy("string"));
  assert.ok(!isLazy(() => 1)); // plain function
  assert.ok(!isLazy({ getter: () => 1 })); // object without symbol
  assert.ok(!isLazy({}));
  assert.ok(!isLazy([]));
});

test("Logger.with() with lazy values", () => {
  const logger = LoggerImpl.getLogger(["lazy-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let currentUser = "alice";
    const ctx = logger.with({ user: lazy(() => currentUser) });

    ctx.info("Action 1");
    assert.strictEqual(records[0].properties.user, "alice");

    currentUser = "bob";
    ctx.info("Action 2");
    assert.strictEqual(records[1].properties.user, "bob");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy values are not evaluated until log time", () => {
  const logger = LoggerImpl.getLogger(["lazy-eval-test"]);
  const records: LogRecord[] = [];
  // Access properties in sink to trigger lazy evaluation
  logger.sinks.push((record) => {
    // Force evaluation by accessing properties
    void record.properties;
    records.push(record);
  });

  try {
    let evaluated = false;
    const ctx = logger.with({
      value: lazy(() => {
        evaluated = true;
        return "computed";
      }),
    });

    assert.ok(!evaluated); // not evaluated yet

    ctx.info("Test message");
    assert.ok(evaluated); // now evaluated (sink accessed properties)
    assert.strictEqual(records[0].properties.value, "computed");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy values propagate to child loggers", () => {
  const logger = LoggerImpl.getLogger(["lazy-child-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let requestId = "req-1";
    const ctx = logger.with({ requestId: lazy(() => requestId) });
    const childCtx = ctx.getChild("child");

    childCtx.info("Child action 1");
    assert.strictEqual(records[0].properties.requestId, "req-1");

    requestId = "req-2";
    childCtx.info("Child action 2");
    assert.strictEqual(records[1].properties.requestId, "req-2");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy values work with template literals", () => {
  const logger = LoggerImpl.getLogger(["lazy-template-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let count = 0;
    const ctx = logger.with({ count: lazy(() => count) });

    count = 42;
    ctx.info`The count is ${count}`;
    assert.strictEqual(records[0].properties.count, 42);
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy values work with logLazily", () => {
  const logger = LoggerImpl.getLogger(["lazy-lazily-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let value = "initial";
    const ctx = logger.with({ dynamic: lazy(() => value) });

    value = "updated";
    ctx.info((l) => l`Lazy log`);
    assert.strictEqual(records[0].properties.dynamic, "updated");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() mixed lazy and regular properties", () => {
  const logger = LoggerImpl.getLogger(["lazy-mixed-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let dynamicValue = "dynamic1";
    const ctx = logger.with({
      static: "static-value",
      dynamic: lazy(() => dynamicValue),
    });

    ctx.info("Test 1");
    assert.strictEqual(records[0].properties.static, "static-value");
    assert.strictEqual(records[0].properties.dynamic, "dynamic1");

    dynamicValue = "dynamic2";
    ctx.info("Test 2");
    assert.strictEqual(records[1].properties.static, "static-value");
    assert.strictEqual(records[1].properties.dynamic, "dynamic2");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy values can be overridden by log properties", () => {
  const logger = LoggerImpl.getLogger(["lazy-override-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    const ctx = logger.with({ value: lazy(() => "lazy") });

    ctx.info("Without override");
    assert.strictEqual(records[0].properties.value, "lazy");

    ctx.info("With override", { value: "override" });
    assert.strictEqual(records[1].properties.value, "override");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy getter returning null/undefined", () => {
  const logger = LoggerImpl.getLogger(["lazy-null-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    const ctx = logger.with({
      nullValue: lazy(() => null),
      undefinedValue: lazy(() => undefined),
    });

    ctx.info("Test message");
    assert.strictEqual(records[0].properties.nullValue, null);
    assert.strictEqual(records[0].properties.undefinedValue, undefined);
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() chained with() calls with lazy values", () => {
  const logger = LoggerImpl.getLogger(["lazy-chained-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let value1 = "a";
    let value2 = "x";

    const ctx1 = logger.with({ first: lazy(() => value1) });
    const ctx2 = ctx1.with({ second: lazy(() => value2) });

    ctx2.info("Test");
    assert.strictEqual(records[0].properties.first, "a");
    assert.strictEqual(records[0].properties.second, "x");

    value1 = "b";
    value2 = "y";
    ctx2.info("Test");
    assert.strictEqual(records[1].properties.first, "b");
    assert.strictEqual(records[1].properties.second, "y");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy value overridden by another lazy value", () => {
  const logger = LoggerImpl.getLogger(["lazy-override-lazy-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let original = "original";
    let override = "override";

    const ctx1 = logger.with({ value: lazy(() => original) });
    const ctx2 = ctx1.with({ value: lazy(() => override) });

    ctx2.info("Test");
    assert.strictEqual(records[0].properties.value, "override");

    override = "updated";
    ctx2.info("Test");
    assert.strictEqual(records[1].properties.value, "updated");

    // Original context should still use original lazy
    original = "original-updated";
    ctx1.info("Test");
    assert.strictEqual(records[2].properties.value, "original-updated");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy values work with emit()", () => {
  const logger = LoggerImpl.getLogger(["lazy-emit-test"]);
  const records: LogRecord[] = [];
  logger.sinks.push((record) => records.push(record));

  try {
    let value = "initial";
    const ctx = logger.with({ dynamic: lazy(() => value) });

    value = "updated";
    ctx.emit({
      level: "info",
      message: ["Test message"],
      rawMessage: "Test message",
      timestamp: Date.now(),
      properties: { extra: "prop" },
    });

    assert.strictEqual(records[0].properties.dynamic, "updated");
    assert.strictEqual(records[0].properties.extra, "prop");
  } finally {
    logger.resetDescendants();
  }
});

test("Logger.with() lazy getter throwing error propagates", () => {
  const logger = LoggerImpl.getLogger(["lazy-error-test"]);
  const records: LogRecord[] = [];
  const errors: unknown[] = [];

  // Use a sink that catches the error when accessing properties
  logger.sinks.push((record) => {
    try {
      void record.properties;
      records.push(record);
    } catch (e) {
      errors.push(e);
    }
  });

  try {
    const ctx = logger.with({
      badValue: lazy(() => {
        throw new Error("getter error");
      }),
    });

    ctx.info("Test message");
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.strictEqual((errors[0] as Error).message, "getter error");
  } finally {
    logger.resetDescendants();
  }
});
