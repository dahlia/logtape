import assert from "node:assert/strict";
import test from "node:test";
import {
  type Config,
  ConfigError,
  configure,
  configureSync,
  getConfig,
  reset,
  resetSync,
} from "./config.ts";
import type { Filter } from "./filter.ts";
import { getLogger, LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

test("configure()", async () => {
  let disposed = 0;

  try {
    const aLogs: LogRecord[] = [];
    const a: Sink & AsyncDisposable = (record: LogRecord) => aLogs.push(record);
    a[Symbol.asyncDispose] = () => {
      ++disposed;
      return Promise.resolve();
    };
    const bLogs: LogRecord[] = [];
    const b: Sink & Disposable = (record: LogRecord) => bLogs.push(record);
    b[Symbol.dispose] = () => ++disposed;
    const cLogs: LogRecord[] = [];
    const c: Sink = (record: LogRecord) => cLogs.push(record);
    const x: Filter & AsyncDisposable = () => true;
    x[Symbol.asyncDispose] = () => {
      ++disposed;
      return Promise.resolve();
    };
    const y: Filter & Disposable = () => true;
    y[Symbol.dispose] = () => ++disposed;
    const config: Config<string, string> = {
      sinks: { a, b, c },
      filters: { x, y, debug: "debug" },
      loggers: [
        {
          category: "my-app",
          sinks: ["a"],
          filters: ["x"],
        },
        {
          category: ["my-app", "foo"],
          sinks: ["b"],
          parentSinks: "override",
          filters: ["y"],
        },
        {
          category: ["my-app", "bar"],
          sinks: ["c"],
          filters: ["debug"],
          lowestLevel: "info",
        },
      ],
    };
    await configure(config);

    const logger = LoggerImpl.getLogger("my-app");
    assert.deepStrictEqual(logger.sinks, [a]);
    assert.deepStrictEqual(logger.filters, [x]);
    assert.strictEqual(logger.lowestLevel, "trace");
    const foo = LoggerImpl.getLogger(["my-app", "foo"]);
    assert.deepStrictEqual(foo.sinks, [b]);
    assert.deepStrictEqual(foo.filters, [y]);
    assert.strictEqual(foo.lowestLevel, "trace");
    const bar = LoggerImpl.getLogger(["my-app", "bar"]);
    assert.deepStrictEqual(bar.sinks, [c]);
    assert.strictEqual(bar.lowestLevel, "info");
    bar.debug("ignored");
    assert.deepStrictEqual(aLogs, []);
    assert.deepStrictEqual(bLogs, []);
    assert.deepStrictEqual(cLogs, []);
    foo.warn("logged");
    assert.deepStrictEqual(aLogs, []);
    assert.deepStrictEqual(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (bLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.deepStrictEqual(cLogs, []);
    bar.info("logged");
    assert.deepStrictEqual(aLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (cLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.deepStrictEqual(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (bLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.deepStrictEqual(cLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (cLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.strictEqual(getConfig(), config);

    // reconfigure
    await assert.rejects(
      () =>
        configure({
          sinks: {},
          loggers: [{ category: "my-app" }],
        }),
      ConfigError,
    );
    assert.strictEqual(disposed, 0);

    // No exception if reset is true:
    const config2 = {
      sinks: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    };
    await configure(config2);
    assert.strictEqual(disposed, 4);
    assert.strictEqual(getConfig(), config2);
  } finally {
    await reset();
    assert.strictEqual(getConfig(), null);
  }

  try { // lowestLevel
    const a: LogRecord[] = [];
    const b: LogRecord[] = [];
    const c: LogRecord[] = [];
    await configure({
      sinks: {
        a: a.push.bind(a),
        b: b.push.bind(b),
        c: c.push.bind(c),
      },
      loggers: [
        { category: "foo", sinks: ["a"], lowestLevel: "info" },
        { category: ["foo", "bar"], sinks: ["b"], lowestLevel: "warning" },
        { category: ["foo", "baz"], sinks: ["c"], lowestLevel: "debug" },
        { category: ["logtape", "meta"], sinks: [] },
      ],
    });

    getLogger(["foo", "bar"]).warn("test");
    assert.strictEqual(a.length, 1);
    assert.strictEqual(b.length, 1);

    while (a.length > 0) a.pop();
    while (b.length > 0) b.pop();

    getLogger(["foo", "baz"]).debug("test");
    assert.strictEqual(a.length, 0);
    assert.strictEqual(c.length, 1);

    while (a.length > 0) a.pop();
    while (c.length > 0) c.pop();
  } finally {
    await reset();
    assert.strictEqual(getConfig(), null);
  }

  { // misconfiguration
    await assert.rejects(
      () =>
        configure({
          // deno-lint-ignore no-explicit-any
          sinks: {} as any,
          loggers: [
            {
              category: "my-app",
              sinks: ["invalid"],
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);

    await assert.rejects(
      () =>
        configure({
          sinks: {},
          // deno-lint-ignore no-explicit-any
          filters: {} as any,
          loggers: [
            {
              category: "my-app",
              filters: ["invalid"],
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);
  }

  { // duplicate logger categories
    await assert.rejects(
      () =>
        configure({
          sinks: {},
          loggers: [
            {
              category: "my-app",
              lowestLevel: "info",
            },
            {
              category: ["my-app"],
              lowestLevel: "warning",
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);

    await assert.rejects(
      () =>
        configure({
          sinks: {},
          loggers: [
            {
              category: ["my-app", "service"],
              lowestLevel: "info",
            },
            {
              category: ["my-app", "service"],
              lowestLevel: "warning",
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);
  }

  const metaCategories = [[], ["logtape"], ["logtape", "meta"]];
  for (const metaCategory of metaCategories) {
    try { // meta configuration
      const config = {
        sinks: {},
        loggers: [
          {
            category: metaCategory,
            sinks: [],
            filters: [],
          },
        ],
      };
      await configure(config);

      assert.deepStrictEqual(
        LoggerImpl.getLogger(["logger", "meta"]).sinks,
        [],
      );
      assert.strictEqual(getConfig(), config);
    } finally {
      await reset();
      assert.strictEqual(getConfig(), null);
    }
  }
});

test("configureSync()", async () => {
  let disposed = 0;

  try {
    const bLogs: LogRecord[] = [];
    const b: Sink & Disposable = (record) => bLogs.push(record);
    b[Symbol.dispose] = () => ++disposed;
    const cLogs: LogRecord[] = [];
    const c: Sink = cLogs.push.bind(cLogs);
    const y: Filter & Disposable = () => true;
    y[Symbol.dispose] = () => ++disposed;
    const config: Config<string, string> = {
      sinks: { b, c },
      filters: { y, debug: "debug" },
      loggers: [
        {
          category: ["my-app", "foo"],
          sinks: ["b"],
          parentSinks: "override",
          filters: ["y"],
        },
        {
          category: ["my-app", "bar"],
          sinks: ["c"],
          filters: ["debug"],
          lowestLevel: "info",
        },
      ],
    };
    configureSync(config);

    const foo = LoggerImpl.getLogger(["my-app", "foo"]);
    assert.deepStrictEqual(foo.sinks, [b]);
    assert.deepStrictEqual(foo.filters, [y]);
    assert.strictEqual(foo.lowestLevel, "trace");
    const bar = LoggerImpl.getLogger(["my-app", "bar"]);
    assert.deepStrictEqual(bar.sinks, [c]);
    assert.strictEqual(bar.lowestLevel, "info");
    bar.debug("ignored");
    assert.deepStrictEqual(bLogs, []);
    assert.deepStrictEqual(cLogs, []);
    foo.warn("logged");
    assert.deepStrictEqual(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (bLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.deepStrictEqual(cLogs, []);
    bar.info("logged");
    assert.deepStrictEqual(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (bLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.deepStrictEqual(cLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: (cLogs[0] as LogRecord).timestamp,
      },
    ]);
    assert.strictEqual(getConfig(), config);

    // reconfigure
    assert.throws(
      () =>
        configureSync({
          sinks: {},
          loggers: [{ category: "my-app" }],
        }),
      ConfigError,
    );
    assert.strictEqual(disposed, 0);

    // No exception if reset is true:
    const config2 = {
      sinks: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    };
    configureSync(config2);
    assert.strictEqual(disposed, 2);
    assert.strictEqual(getConfig(), config2);
  } finally {
    resetSync();
    assert.strictEqual(getConfig(), null);
  }

  { // misconfiguration
    assert.throws(
      () =>
        configureSync({
          // deno-lint-ignore no-explicit-any
          sinks: {} as any,
          loggers: [
            {
              category: "my-app",
              sinks: ["invalid"],
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);

    assert.throws(
      () =>
        configureSync({
          sinks: {},
          // deno-lint-ignore no-explicit-any
          filters: {} as any,
          loggers: [
            {
              category: "my-app",
              filters: ["invalid"],
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);
  }

  { // duplicate logger categories
    assert.throws(
      () =>
        configureSync({
          sinks: {},
          loggers: [
            {
              category: ["my-app"],
              lowestLevel: "info",
            },
            {
              category: "my-app",
              lowestLevel: "warning",
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);

    assert.throws(
      () =>
        configureSync({
          sinks: {},
          loggers: [
            {
              category: ["my-app", "service"],
              lowestLevel: "info",
            },
            {
              category: ["my-app", "service"],
              lowestLevel: "warning",
            },
          ],
          reset: true,
        }),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);
  }

  const metaCategories = [[], ["logtape"], ["logtape", "meta"]];
  for (const metaCategory of metaCategories) {
    try { // meta configuration
      const config = {
        sinks: {},
        loggers: [
          {
            category: metaCategory,
            sinks: [],
            filters: [],
          },
        ],
      };
      configureSync(config);

      assert.deepStrictEqual(
        LoggerImpl.getLogger(["logger", "meta"]).sinks,
        [],
      );
      assert.strictEqual(getConfig(), config);
    } finally {
      resetSync();
      assert.strictEqual(getConfig(), null);
    }
  }

  { // no async sinks
    const aLogs: LogRecord[] = [];
    const a: Sink & AsyncDisposable = (record) => aLogs.push(record);
    a[Symbol.asyncDispose] = () => {
      return Promise.resolve();
    };
    const config: Config<string, string> = {
      sinks: { a },
      loggers: [
        {
          category: "my-app",
          sinks: ["a"],
        },
      ],
    };

    assert.throws(
      () => configureSync(config),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);
  }

  { // no async filters
    const aLogs: LogRecord[] = [];
    const a: Sink & Disposable = (record) => aLogs.push(record);
    a[Symbol.dispose] = () => ++disposed;
    const x: Filter & AsyncDisposable = () => true;
    x[Symbol.asyncDispose] = () => {
      ++disposed;
      return Promise.resolve();
    };
    const config: Config<string, string> = {
      sinks: { a },
      filters: { x },
      loggers: [
        {
          category: "my-app",
          sinks: ["a"],
          filters: ["x"],
        },
      ],
    };

    assert.throws(
      () => configureSync(config),
      ConfigError,
    );
    assert.strictEqual(getConfig(), null);
  }

  try { // cannot reset async disposables
    const aLogs: LogRecord[] = [];
    const a: Sink & AsyncDisposable = (record) => aLogs.push(record);
    a[Symbol.asyncDispose] = () => {
      ++disposed;
      return Promise.resolve();
    };
    await configure({
      sinks: { a },
      loggers: [{ category: "my-app", sinks: ["a"] }],
    });
    assert.throws(
      () =>
        configureSync({
          sinks: {
            a(record) {
              aLogs.push(record);
            },
          },
          loggers: [{ category: "my-app", sinks: ["a"] }],
          reset: true,
        }),
      ConfigError,
    );
  } finally {
    await reset();
    assert.strictEqual(getConfig(), null);
  }
});
