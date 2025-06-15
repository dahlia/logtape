import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { assertRejects } from "@std/assert/rejects";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { assertThrows } from "@std/assert/throws";
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

const test = suite(import.meta);

test("configure()", async () => {
  let disposed = 0;

  try {
    const aLogs: LogRecord[] = [];
    const a: Sink & AsyncDisposable = (record) => aLogs.push(record);
    a[Symbol.asyncDispose] = () => {
      ++disposed;
      return Promise.resolve();
    };
    const bLogs: LogRecord[] = [];
    const b: Sink & Disposable = (record) => bLogs.push(record);
    b[Symbol.dispose] = () => ++disposed;
    const cLogs: LogRecord[] = [];
    const c: Sink = cLogs.push.bind(cLogs);
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
    assertEquals(logger.sinks, [a]);
    assertEquals(logger.filters, [x]);
    assertEquals(logger.lowestLevel, "trace");
    const foo = LoggerImpl.getLogger(["my-app", "foo"]);
    assertEquals(foo.sinks, [b]);
    assertEquals(foo.filters, [y]);
    assertEquals(foo.lowestLevel, "trace");
    const bar = LoggerImpl.getLogger(["my-app", "bar"]);
    assertEquals(bar.sinks, [c]);
    assertEquals(bar.lowestLevel, "info");
    bar.debug("ignored");
    assertEquals(aLogs, []);
    assertEquals(bLogs, []);
    assertEquals(cLogs, []);
    foo.warn("logged");
    assertEquals(aLogs, []);
    assertEquals(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: bLogs[0].timestamp,
      },
    ]);
    assertEquals(cLogs, []);
    bar.info("logged");
    assertEquals(aLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: cLogs[0].timestamp,
      },
    ]);
    assertEquals(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: bLogs[0].timestamp,
      },
    ]);
    assertEquals(cLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: cLogs[0].timestamp,
      },
    ]);
    assertStrictEquals(getConfig(), config);

    // reconfigure
    await assertRejects(
      () =>
        configure({
          sinks: {},
          loggers: [{ category: "my-app" }],
        }),
      ConfigError,
      "Already configured",
    );
    assertEquals(disposed, 0);

    // No exception if reset is true:
    const config2 = {
      sinks: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    };
    await configure(config2);
    assertEquals(disposed, 4);
    assertStrictEquals(getConfig(), config2);
  } finally {
    await reset();
    assertStrictEquals(getConfig(), null);
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
    assertEquals(a.length, 1);
    assertEquals(b.length, 1);

    while (a.length > 0) a.pop();
    while (b.length > 0) b.pop();

    getLogger(["foo", "baz"]).debug("test");
    assertEquals(a.length, 0);
    assertEquals(c.length, 1);

    while (a.length > 0) a.pop();
    while (c.length > 0) c.pop();
  } finally {
    await reset();
    assertStrictEquals(getConfig(), null);
  }

  { // misconfiguration
    await assertRejects(
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
      "Sink not found: invalid",
    );
    assertStrictEquals(getConfig(), null);

    await assertRejects(
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
      "Filter not found: invalid",
    );
    assertStrictEquals(getConfig(), null);
  }

  { // duplicate logger categories
    await assertRejects(
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
      'Duplicate logger configuration for category: ["my-app"]',
    );
    assertStrictEquals(getConfig(), null);

    await assertRejects(
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
      'Duplicate logger configuration for category: ["my-app","service"]',
    );
    assertStrictEquals(getConfig(), null);
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

      assertEquals(LoggerImpl.getLogger(["logger", "meta"]).sinks, []);
      assertStrictEquals(getConfig(), config);
    } finally {
      await reset();
      assertStrictEquals(getConfig(), null);
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
    assertEquals(foo.sinks, [b]);
    assertEquals(foo.filters, [y]);
    assertEquals(foo.lowestLevel, "trace");
    const bar = LoggerImpl.getLogger(["my-app", "bar"]);
    assertEquals(bar.sinks, [c]);
    assertEquals(bar.lowestLevel, "info");
    bar.debug("ignored");
    assertEquals(bLogs, []);
    assertEquals(cLogs, []);
    foo.warn("logged");
    assertEquals(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: bLogs[0].timestamp,
      },
    ]);
    assertEquals(cLogs, []);
    bar.info("logged");
    assertEquals(bLogs, [
      {
        level: "warning",
        category: ["my-app", "foo"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: bLogs[0].timestamp,
      },
    ]);
    assertEquals(cLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        rawMessage: "logged",
        properties: {},
        timestamp: cLogs[0].timestamp,
      },
    ]);
    assertStrictEquals(getConfig(), config);

    // reconfigure
    assertThrows(
      () =>
        configureSync({
          sinks: {},
          loggers: [{ category: "my-app" }],
        }),
      ConfigError,
      "Already configured",
    );
    assertEquals(disposed, 0);

    // No exception if reset is true:
    const config2 = {
      sinks: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    };
    configureSync(config2);
    assertEquals(disposed, 2);
    assertStrictEquals(getConfig(), config2);
  } finally {
    resetSync();
    assertStrictEquals(getConfig(), null);
  }

  { // misconfiguration
    assertThrows(
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
      "Sink not found: invalid",
    );
    assertStrictEquals(getConfig(), null);

    assertThrows(
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
      "Filter not found: invalid",
    );
    assertStrictEquals(getConfig(), null);
  }

  { // duplicate logger categories
    assertThrows(
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
      'Duplicate logger configuration for category: ["my-app"]',
    );
    assertStrictEquals(getConfig(), null);

    assertThrows(
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
      'Duplicate logger configuration for category: ["my-app","service"]',
    );
    assertStrictEquals(getConfig(), null);
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

      assertEquals(LoggerImpl.getLogger(["logger", "meta"]).sinks, []);
      assertStrictEquals(getConfig(), config);
    } finally {
      resetSync();
      assertStrictEquals(getConfig(), null);
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

    assertThrows(
      () => configureSync(config),
      ConfigError,
      "Async disposables cannot be used with configureSync()",
    );
    assertStrictEquals(getConfig(), null);
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

    assertThrows(
      () => configureSync(config),
      ConfigError,
      "Async disposables cannot be used with configureSync()",
    );
    assertStrictEquals(getConfig(), null);
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
    assertThrows(
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
      "Previously configured async disposables are still active",
    );
  } finally {
    await reset();
    assertStrictEquals(getConfig(), null);
  }
});
