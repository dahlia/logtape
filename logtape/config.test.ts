import { assertEquals } from "@std/assert/assert-equals";
import { assertRejects } from "@std/assert/assert-rejects";
import { assertStrictEquals } from "@std/assert/assert-strict-equals";
import assert from "node:assert/strict";
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
import { LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

Deno.test("configure()", async (t) => {
  let disposed = 0;

  await t.step("test", async () => {
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
          level: "info", // deprecated
          lowestLevel: "info",
        },
      ],
    };
    await configure(config);

    const logger = LoggerImpl.getLogger("my-app");
    assertEquals(logger.sinks, [a]);
    assertEquals(logger.filters, [x]);
    assertEquals(logger.lowestLevel, "debug");
    const foo = LoggerImpl.getLogger(["my-app", "foo"]);
    assertEquals(foo.sinks, [b]);
    assertEquals(foo.filters, [y]);
    assertEquals(foo.lowestLevel, "debug");
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
  });

  await t.step("reconfigure", async () => {
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
    const config = {
      sinks: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    };
    await configure(config);
    assertEquals(disposed, 4);
    assertStrictEquals(getConfig(), config);
  });

  await t.step("tear down", async () => {
    await reset();
    assertStrictEquals(getConfig(), null);
  });

  await t.step("misconfiguration", async () => {
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
  });

  const metaCategories = [[], ["logtape"], ["logtape", "meta"]];
  for (const metaCategory of metaCategories) {
    await t.step(
      "meta configuration: " + JSON.stringify(metaCategory),
      async () => {
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
      },
    );

    await t.step("tear down", async () => {
      await reset();
      assertStrictEquals(getConfig(), null);
    });
  }
});
Deno.test("configureSync()", async (t) => {
  let disposed = 0;

  await t.step("test", () => {
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
          level: "info", // deprecated
          lowestLevel: "info",
        },
      ],
    };
    configureSync(config);

    const foo = LoggerImpl.getLogger(["my-app", "foo"]);
    assertEquals(foo.sinks, [b]);
    assertEquals(foo.filters, [y]);
    assertEquals(foo.lowestLevel, "debug");
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
  });

  await t.step("reconfigure", () => {
    assert.throws(
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
    const config = {
      sinks: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    };
    configureSync(config);
    assertEquals(disposed, 2);
    assertStrictEquals(getConfig(), config);
  });

  await t.step("tear down", () => {
    resetSync();
    assertStrictEquals(getConfig(), null);
  });

  await t.step("misconfiguration", () => {
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
      "Sink not found: invalid",
    );
    assertStrictEquals(getConfig(), null);

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
      "Filter not found: invalid",
    );
    assertStrictEquals(getConfig(), null);
  });

  const metaCategories = [[], ["logtape"], ["logtape", "meta"]];
  for (const metaCategory of metaCategories) {
    await t.step("meta configuration: " + JSON.stringify(metaCategory), () => {
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
    });

    await t.step("tear down", () => {
      resetSync();
      assertStrictEquals(getConfig(), null);
    });
  }

  await t.step("no async sinks", () => {
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
      "Async disposables cannot be used with configureSync",
    );
    assertStrictEquals(getConfig(), null);
  });

  await t.step("no async filters", () => {
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
      "Async disposables cannot be used with configureSync",
    );
    assertStrictEquals(getConfig(), null);
  });
});
