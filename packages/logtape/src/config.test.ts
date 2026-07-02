import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { withCategoryPrefix, withContext } from "./context.ts";
import type { Filter } from "./filter.ts";
import { getLogger, LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import {
  compileScopedConfig,
  disposeScopedConfig,
  disposeScopedConfigSync,
  scopedConfigHasSink,
} from "./scoped-config.ts";
import type { Sink } from "./sink.ts";
import {
  type Config,
  ConfigError,
  configure,
  configureSync,
  dispose,
  disposeSync,
  getConfig,
  reset,
  resetSync,
  withConfig,
  withConfigSync,
} from "./config.ts";

const hasAddEventListener = typeof globalThis.addEventListener === "function";

test("withConfig()", async () => {
  const globalLogs: LogRecord[] = [];
  const scopedLogs: LogRecord[] = [];

  await configure({
    sinks: {
      global: globalLogs.push.bind(globalLogs),
    },
    loggers: [
      { category: [], sinks: ["global"], lowestLevel: "info" },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    getLogger("app").debug("before hidden");
    getLogger("app").info("before");

    const rv = await withConfig({
      sinks: {
        scoped: scopedLogs.push.bind(scopedLogs),
      },
      loggers: [
        { category: [], sinks: ["scoped"], lowestLevel: "debug" },
      ],
    }, async () => {
      getLogger("app").debug("inside");
      await delay(0);
      getLogger("app").info("inside later");
      return 123;
    });

    getLogger("app").debug("after hidden");
    getLogger("app").info("after");

    assert.strictEqual(rv, 123);
    assert.deepStrictEqual(
      globalLogs.map((record) => record.rawMessage),
      ["before", "after"],
    );
    assert.deepStrictEqual(
      scopedLogs.map((record) => record.rawMessage),
      ["inside", "inside later"],
    );
  } finally {
    await reset();
  }
});

test("withConfig() requires global context-local storage", async () => {
  await reset();

  await assert.rejects(
    () => withConfig({ sinks: {}, loggers: [] }, () => {}),
    ConfigError,
  );

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    reset: true,
  });

  try {
    await assert.rejects(
      () => withConfig({ sinks: {}, loggers: [] }, () => {}),
      ConfigError,
    );
  } finally {
    await reset();
  }
});

test("withConfig() supports nested and concurrent scopes", async () => {
  const globalLogs: LogRecord[] = [];
  const outerLogs: LogRecord[] = [];
  const innerLogs: LogRecord[] = [];
  const concurrentA: LogRecord[] = [];
  const concurrentB: LogRecord[] = [];

  await configure({
    sinks: {
      global: globalLogs.push.bind(globalLogs),
    },
    loggers: [
      { category: [], sinks: ["global"], lowestLevel: "trace" },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { outer: outerLogs.push.bind(outerLogs) },
      loggers: [{ category: [], sinks: ["outer"], lowestLevel: "trace" }],
    }, async () => {
      getLogger("app").info("outer before");
      await withConfig({
        sinks: { inner: innerLogs.push.bind(innerLogs) },
        loggers: [{ category: [], sinks: ["inner"], lowestLevel: "trace" }],
      }, () => {
        getLogger("app").info("inner");
      });
      getLogger("app").info("outer after");
    });

    await Promise.all([
      withConfig({
        sinks: { a: concurrentA.push.bind(concurrentA) },
        loggers: [{ category: [], sinks: ["a"], lowestLevel: "trace" }],
      }, async () => {
        await delay(10);
        getLogger("app").info("a");
      }),
      withConfig({
        sinks: { b: concurrentB.push.bind(concurrentB) },
        loggers: [{ category: [], sinks: ["b"], lowestLevel: "trace" }],
      }, async () => {
        await delay(0);
        getLogger("app").info("b");
      }),
    ]);

    assert.deepStrictEqual(
      outerLogs.map((record) => record.rawMessage),
      ["outer before", "outer after"],
    );
    assert.deepStrictEqual(
      innerLogs.map((record) => record.rawMessage),
      ["inner"],
    );
    assert.deepStrictEqual(
      concurrentA.map((record) => record.rawMessage),
      ["a"],
    );
    assert.deepStrictEqual(
      concurrentB.map((record) => record.rawMessage),
      ["b"],
    );
    assert.deepStrictEqual(globalLogs, []);
  } finally {
    await reset();
  }
});

test("withConfig() ignores disposed scoped configs in propagated async work", async () => {
  const globalLogs: LogRecord[] = [];
  const scopedLogs: LogRecord[] = [];
  let scopedSinkDisposed = false;
  let disposedScopedSinkCalls = 0;
  const scopedSink: Sink & Disposable = (record) => {
    if (scopedSinkDisposed) disposedScopedSinkCalls++;
    scopedLogs.push(record);
  };
  scopedSink[Symbol.dispose] = () => {
    scopedSinkDisposed = true;
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let spawned!: Promise<void>;

  await configure({
    sinks: {
      global: globalLogs.push.bind(globalLogs),
    },
    loggers: [
      { category: [], sinks: ["global"], lowestLevel: "info" },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { scoped: scopedSink },
      loggers: [{ category: [], sinks: ["scoped"], lowestLevel: "info" }],
    }, () => {
      getLogger("app").info("inside");
      spawned = (async () => {
        await gate;
        getLogger("app").info("spawned");
      })();
    });

    release();
    await spawned;

    assert.strictEqual(disposedScopedSinkCalls, 0);
    assert.deepStrictEqual(
      scopedLogs.map((record) => record.rawMessage),
      ["inside"],
    );
    assert.deepStrictEqual(
      globalLogs.map((record) => record.rawMessage),
      ["spawned"],
    );
  } finally {
    await reset();
  }
});

test("withConfig() falls back to active parent scopes", async () => {
  const globalLogs: LogRecord[] = [];
  const outerLogs: LogRecord[] = [];
  const innerLogs: LogRecord[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let spawned!: Promise<void>;

  await configure({
    sinks: {
      global: globalLogs.push.bind(globalLogs),
    },
    loggers: [
      { category: [], sinks: ["global"], lowestLevel: "info" },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { outer: outerLogs.push.bind(outerLogs) },
      loggers: [{ category: [], sinks: ["outer"], lowestLevel: "info" }],
    }, async () => {
      await withConfig({
        sinks: { inner: innerLogs.push.bind(innerLogs) },
        loggers: [{ category: [], sinks: ["inner"], lowestLevel: "info" }],
      }, () => {
        getLogger("app").info("inner");
        spawned = (async () => {
          await gate;
          getLogger("app").info("spawned");
        })();
      });

      release();
      await spawned;
      getLogger("app").info("outer");
    });

    assert.deepStrictEqual(globalLogs, []);
    assert.deepStrictEqual(
      innerLogs.map((record) => record.rawMessage),
      ["inner"],
    );
    assert.deepStrictEqual(
      outerLogs.map((record) => record.rawMessage),
      ["spawned", "outer"],
    );
  } finally {
    await reset();
  }
});

test("withConfig() works with implicit contexts and category prefixes", async () => {
  const logs: LogRecord[] = [];

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withContext({ requestId: "req-1" }, async () => {
      await withCategoryPrefix(["tenant-a"], async () => {
        await withConfig({
          sinks: { scoped: logs.push.bind(logs) },
          loggers: [
            {
              category: ["tenant-a", "app"],
              sinks: ["scoped"],
              lowestLevel: "debug",
            },
          ],
        }, () => {
          getLogger("app").debug("inside", { userId: 123 });
        });
      });
    });

    assert.deepStrictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["tenant-a", "app"]);
    assert.deepStrictEqual(logs[0].properties, {
      requestId: "req-1",
      userId: 123,
    });
  } finally {
    await reset();
  }
});

test("withConfig() applies scoped filters, levels, and parent sinks", async () => {
  const rootLogs: LogRecord[] = [];
  const dbLogs: LogRecord[] = [];
  const auditLogs: LogRecord[] = [];
  const filteredMessages: string[] = [];

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: {
        audit: auditLogs.push.bind(auditLogs),
        db: dbLogs.push.bind(dbLogs),
        root: rootLogs.push.bind(rootLogs),
      },
      filters: {
        allowed(record: LogRecord) {
          filteredMessages.push(String(record.rawMessage));
          return record.rawMessage === "allowed";
        },
      },
      loggers: [
        { category: [], sinks: ["root"], lowestLevel: "info" },
        {
          category: ["app", "db"],
          sinks: ["db"],
          filters: ["allowed"],
          lowestLevel: "debug",
        },
        {
          category: ["app", "audit"],
          sinks: ["audit"],
          parentSinks: "override",
          lowestLevel: "warning",
        },
      ],
    }, () => {
      getLogger(["app", "db"]).info("blocked");
      getLogger(["app", "db"]).info("allowed");
      getLogger(["app", "audit"]).info("audit hidden");
      getLogger(["app", "audit"]).warning("audit shown");
    });

    assert.deepStrictEqual(filteredMessages, ["blocked", "allowed"]);
    assert.deepStrictEqual(
      rootLogs.map((record) => record.rawMessage),
      ["allowed"],
    );
    assert.deepStrictEqual(
      dbLogs.map((record) => record.rawMessage),
      ["allowed"],
    );
    assert.deepStrictEqual(
      auditLogs.map((record) => record.rawMessage),
      ["audit shown"],
    );
  } finally {
    await reset();
  }
});

test("withConfig() preserves scoped lowestLevel null", async () => {
  const rootLogs: LogRecord[] = [];
  const disabledLogs: LogRecord[] = [];

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: {
        disabled: disabledLogs.push.bind(disabledLogs),
        root: rootLogs.push.bind(rootLogs),
      },
      loggers: [
        { category: [], sinks: ["root"], lowestLevel: "trace" },
        {
          category: "disabled",
          sinks: ["disabled"],
          lowestLevel: null,
        },
      ],
    }, () => {
      assert.strictEqual(getLogger("disabled").isEnabledFor("fatal"), false);
      getLogger("disabled").fatal("hidden");
      getLogger("enabled").info("shown");
    });

    assert.deepStrictEqual(
      rootLogs.map((record) => record.rawMessage),
      ["shown"],
    );
    assert.deepStrictEqual(disabledLogs, []);
  } finally {
    await reset();
  }
});

test("withConfig() skips scoped filters when the level is disabled", async () => {
  const logs: LogRecord[] = [];
  const filteredMessages: string[] = [];

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { scoped: logs.push.bind(logs) },
      filters: {
        record(record: LogRecord) {
          filteredMessages.push(String(record.rawMessage));
          return true;
        },
      },
      loggers: [
        {
          category: "app",
          sinks: ["scoped"],
          filters: ["record"],
          lowestLevel: "warning",
        },
      ],
    }, () => {
      getLogger("app").debug("hidden");
      getLogger("app").warning("shown");
    });

    assert.deepStrictEqual(filteredMessages, ["shown"]);
    assert.deepStrictEqual(
      logs.map((record) => record.rawMessage),
      ["shown"],
    );
  } finally {
    await reset();
  }
});

test("withConfig() makes isEnabledFor() observe scoped routing", async () => {
  let evaluated = false;
  const logs: LogRecord[] = [];

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { scoped: logs.push.bind(logs) },
      loggers: [
        { category: ["app"], sinks: ["scoped"], lowestLevel: "warning" },
      ],
    }, async () => {
      assert.strictEqual(getLogger("app").isEnabledFor("debug"), false);
      assert.strictEqual(getLogger("app").isEnabledFor("warning"), true);
      await getLogger("app").debug("hidden {value}", async () => {
        await Promise.resolve();
        evaluated = true;
        return { value: 1 };
      });
      getLogger("app").warning("shown");
    });

    assert.strictEqual(evaluated, false);
    assert.deepStrictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].rawMessage, "shown");
  } finally {
    await reset();
  }
});

test("withConfig() rejects invalid scoped configuration", async () => {
  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await assert.rejects(
      () =>
        withConfig({
          // deno-lint-ignore no-explicit-any
          sinks: {} as any,
          loggers: [{ category: "app", sinks: ["missing"] }],
        }, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () =>
        withConfig({
          sinks: {},
          // deno-lint-ignore no-explicit-any
          filters: {} as any,
          loggers: [{ category: "app", filters: ["missing"] }],
        }, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () => withConfig(null as never, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () =>
        withConfig({
          loggers: [],
        } as never, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () =>
        withConfig({
          sinks: {},
          loggers: null,
        } as never, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () =>
        withConfig({
          sinks: { bad: 1 },
          loggers: [{ category: "app", sinks: ["bad"] }],
        } as never, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () =>
        withConfig({
          sinks: {},
          filters: { bad: 1 },
          loggers: [{ category: "app", filters: ["bad"] }],
        } as never, () => {}),
      ConfigError,
    );
    await assert.rejects(
      () =>
        withConfig({
          sinks: {},
          loggers: [{ category: "app" }, { category: ["app"] }],
        }, () => {}),
      ConfigError,
    );
  } finally {
    await reset();
  }
});

test("withConfig() rejects global state mutation inside a scope", async () => {
  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({ sinks: {}, loggers: [] }, async () => {
      await assert.rejects(
        () => configure({ sinks: {}, loggers: [] }),
        ConfigError,
      );
      assert.throws(
        () => configureSync({ sinks: {}, loggers: [] }),
        ConfigError,
      );
      await assert.rejects(() => reset(), ConfigError);
      assert.throws(() => resetSync(), ConfigError);
      await assert.rejects(() => dispose(), ConfigError);
      assert.throws(() => disposeSync(), ConfigError);
    });
  } finally {
    await reset();
  }
});

test("withConfig() rejects global state mutation from sibling scopes", async () => {
  const logs: LogRecord[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let scoped: Promise<void> | undefined;

  await configure({
    sinks: { global: logs.push.bind(logs) },
    loggers: [
      { category: [], sinks: ["global"], lowestLevel: "info" },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    scoped = withConfig({
      sinks: { scoped: logs.push.bind(logs) },
      loggers: [{ category: [], sinks: ["scoped"], lowestLevel: "info" }],
    }, async () => {
      await gate;
      getLogger("app").info("scoped");
    });

    await delay(0);
    await assert.rejects(
      () => configure({ sinks: {}, loggers: [], reset: true }),
      ConfigError,
    );
    assert.throws(
      () => configureSync({ sinks: {}, loggers: [], reset: true }),
      ConfigError,
    );
    await assert.rejects(() => reset(), ConfigError);
    assert.throws(() => resetSync(), ConfigError);
    await assert.rejects(() => dispose(), ConfigError);
    assert.throws(() => disposeSync(), ConfigError);

    release();
    await scoped;

    assert.deepStrictEqual(
      logs.map((record) => record.rawMessage),
      ["scoped"],
    );
  } finally {
    release();
    await scoped?.catch(() => {});
    await reset();
  }
});

test("withConfig() rejects scopes while global reconfiguration is pending", async () => {
  let releaseDispose: (() => void) | undefined;
  const disposeCanFinish = new Promise<void>((resolve) => {
    releaseDispose = resolve;
  });

  const sink: Sink & AsyncDisposable = () => {};
  sink[Symbol.asyncDispose] = () => disposeCanFinish;

  try {
    await configure({
      sinks: { sink },
      loggers: [
        { category: "my-app", sinks: ["sink"] },
        { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
      ],
      contextLocalStorage: new AsyncLocalStorage(),
      reset: true,
    });

    const resetPromise = reset();
    await assert.rejects(
      () => withConfig({ sinks: {}, loggers: [] }, () => {}),
      ConfigError,
    );

    releaseDispose?.();
    await resetPromise;
  } finally {
    releaseDispose?.();
    await reset();
  }
});

const skipUnloadDisposalTest = !("Deno" in globalThis);

test(
  "configure() unload disposal bypasses active scoped configuration guards",
  { skip: skipUnloadDisposalTest },
  async () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (skipUnloadDisposalTest) return;

    const addEventListener = Object.getOwnPropertyDescriptor(
      globalThis,
      "addEventListener",
    );
    let unloadHandler: (() => unknown) | undefined;
    let disposed = false;
    const sink: Sink & AsyncDisposable = () => {};
    sink[Symbol.asyncDispose] = () => {
      disposed = true;
      return Promise.resolve();
    };

    try {
      Object.defineProperty(globalThis, "addEventListener", {
        configurable: true,
        value(type: string, handler: () => unknown) {
          if (type === "unload") unloadHandler = handler;
        },
        writable: true,
      });

      await configure({
        sinks: { sink },
        loggers: [
          { category: "my-app", sinks: ["sink"] },
          { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
        ],
        contextLocalStorage: new AsyncLocalStorage(),
        reset: true,
      });

      assert.notStrictEqual(unloadHandler, undefined);
      await withConfig({ sinks: {}, loggers: [] }, async () => {
        await unloadHandler?.();
      });

      assert.strictEqual(disposed, true);
    } finally {
      if (addEventListener == null) {
        Reflect.deleteProperty(globalThis, "addEventListener");
      } else {
        Object.defineProperty(globalThis, "addEventListener", addEventListener);
      }
      await reset();
    }
  },
);

test("withConfig() disposes scoped resources when the scope exits", async () => {
  const events: string[] = [];
  const sink: Sink & AsyncDisposable = () => {};
  sink[Symbol.asyncDispose] = () => {
    events.push("sink");
    return Promise.resolve();
  };
  const filter: Filter & AsyncDisposable = () => true;
  filter[Symbol.asyncDispose] = () => {
    events.push("filter");
    return Promise.resolve();
  };

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { sink },
      filters: { filter },
      loggers: [{ category: "app", sinks: ["sink"], filters: ["filter"] }],
    }, () => {});

    assert.deepStrictEqual(events, ["filter", "sink"]);
  } finally {
    await reset();
  }
});

test("withConfig() does not dispose resources still owned by parent scopes", async () => {
  const records: LogRecord[] = [];
  const events: string[] = [];
  const sharedSink: Sink & Disposable = (record) => {
    records.push(record);
  };
  sharedSink[Symbol.dispose] = () => events.push("sink");
  const sharedFilter: Filter & Disposable = () => true;
  sharedFilter[Symbol.dispose] = () => events.push("filter");

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await withConfig({
      sinks: { shared: sharedSink },
      filters: { shared: sharedFilter },
      loggers: [
        { category: "app", filters: ["shared"], sinks: ["shared"] },
      ],
    }, async () => {
      await withConfig({
        sinks: { shared: sharedSink },
        filters: { shared: sharedFilter },
        loggers: [
          { category: "app", filters: ["shared"], sinks: ["shared"] },
        ],
      }, () => {
        getLogger("app").info("inner");
      });

      assert.deepStrictEqual(events, []);
      getLogger("app").info("outer");
    });

    assert.deepStrictEqual(events, ["filter", "sink"]);
    assert.deepStrictEqual(
      records.map((record) => record.rawMessage),
      ["inner", "outer"],
    );
  } finally {
    await reset();
  }
});

test("disposeScopedConfig() clears resources after disposal errors", async () => {
  const events: string[] = [];
  const disposeError = new Error("dispose failed");
  const syncFilter: Filter & Disposable = () => true;
  syncFilter[Symbol.dispose] = () => {
    events.push("sync filter");
    throw disposeError;
  };
  const asyncFilter: Filter & AsyncDisposable = () => true;
  asyncFilter[Symbol.asyncDispose] = async () => {
    await Promise.resolve();
    events.push("async filter");
  };
  const syncSink: Sink & Disposable = () => {};
  syncSink[Symbol.dispose] = () => events.push("sync sink");
  const asyncSink: Sink & AsyncDisposable = () => {};
  asyncSink[Symbol.asyncDispose] = async () => {
    await Promise.resolve();
    events.push("async sink");
  };

  const scopedConfig = compileScopedConfig(
    {
      sinks: { asyncSink, syncSink },
      filters: { asyncFilter, syncFilter },
      loggers: [
        {
          category: "app",
          filters: ["asyncFilter", "syncFilter"],
          sinks: ["asyncSink", "syncSink"],
        },
      ],
    },
    true,
    (message) => new ConfigError(message),
  );

  await assert.rejects(
    () => disposeScopedConfig(scopedConfig),
    (error) => error === disposeError,
  );
  assert.strictEqual(scopedConfig.syncFilters.size, 0);
  assert.strictEqual(scopedConfig.asyncFilters.size, 0);
  assert.strictEqual(scopedConfig.syncSinks.size, 0);
  assert.strictEqual(scopedConfig.asyncSinks.size, 0);

  await disposeScopedConfig(scopedConfig);
  assert.deepStrictEqual(
    events,
    ["sync filter", "async filter", "sync sink", "async sink"],
  );
});

test("disposeScopedConfigSync() clears resources after disposal errors", () => {
  const events: string[] = [];
  const disposeError = new Error("dispose failed");
  const filter: Filter & Disposable = () => true;
  filter[Symbol.dispose] = () => {
    events.push("filter");
    throw disposeError;
  };
  const sink: Sink & Disposable = () => {};
  sink[Symbol.dispose] = () => events.push("sink");

  const scopedConfig = compileScopedConfig(
    {
      sinks: { sink },
      filters: { filter },
      loggers: [
        { category: "app", filters: ["filter"], sinks: ["sink"] },
      ],
    },
    false,
    (message) => new ConfigError(message),
  );

  assert.throws(
    () => disposeScopedConfigSync(scopedConfig),
    (error) => error === disposeError,
  );
  assert.strictEqual(scopedConfig.syncFilters.size, 0);
  assert.strictEqual(scopedConfig.syncSinks.size, 0);

  disposeScopedConfigSync(scopedConfig);
  assert.deepStrictEqual(events, ["filter", "sink"]);
});

test("scoped configuration caches sink dispatch plans", () => {
  const sink: Sink = () => {};
  const scopedConfig = compileScopedConfig(
    {
      sinks: { sink },
      loggers: [{ category: "app", sinks: ["sink"] }],
    },
    true,
    (message) => new ConfigError(message),
  );

  assert.strictEqual(scopedConfig.dispatchCache.size, 0);
  assert.strictEqual(scopedConfigHasSink(scopedConfig, ["app"], "info"), true);
  assert.strictEqual(scopedConfig.dispatchCache.size, 1);
  assert.strictEqual(scopedConfigHasSink(scopedConfig, ["app"], "info"), true);
  assert.strictEqual(scopedConfig.dispatchCache.size, 1);
});

test("withConfig() preserves callback and disposal errors", async () => {
  const callbackError = new Error("callback failed");
  const disposeError = new Error("dispose failed");
  const sink: Sink & AsyncDisposable = () => {};
  sink[Symbol.asyncDispose] = () => Promise.reject(disposeError);

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    await assert.rejects(
      withConfig({
        sinks: { sink },
        loggers: [{ category: "app", sinks: ["sink"] }],
      }, () => {
        throw callbackError;
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepStrictEqual(error.errors, [callbackError, disposeError]);
        return true;
      },
    );
  } finally {
    await reset();
  }
});

test("withConfigSync()", async () => {
  const logs: LogRecord[] = [];
  const events: string[] = [];
  const sink: Sink & Disposable = (record) => logs.push(record);
  sink[Symbol.dispose] = () => events.push("sink");

  await configure({
    sinks: {},
    loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });

  try {
    const rv = withConfigSync({
      sinks: { sink },
      loggers: [{ category: "app", sinks: ["sink"], lowestLevel: "debug" }],
    }, () => {
      getLogger("app").debug("sync");
      return 456;
    });

    assert.strictEqual(rv, 456);
    assert.deepStrictEqual(logs.map((record) => record.rawMessage), ["sync"]);
    assert.deepStrictEqual(events, ["sink"]);

    const asyncSink: Sink & AsyncDisposable = () => {};
    asyncSink[Symbol.asyncDispose] = () => Promise.resolve();
    assert.throws(
      () =>
        withConfigSync({
          sinks: { asyncSink },
          loggers: [{ category: "app", sinks: ["asyncSink"] }],
        }, () => {}),
      ConfigError,
    );

    const asyncCallbackEvents: string[] = [];
    const asyncCallbackSink: Sink & Disposable = () => {};
    asyncCallbackSink[Symbol.dispose] = () => {
      asyncCallbackEvents.push("sink");
    };
    assert.throws(
      () =>
        withConfigSync({
          sinks: { asyncCallbackSink },
          loggers: [{ category: "app", sinks: ["asyncCallbackSink"] }],
          // @ts-expect-error withConfigSync() rejects async callbacks.
        }, async () => {}),
      ConfigError,
    );
    assert.deepStrictEqual(asyncCallbackEvents, ["sink"]);

    assert.throws(
      () =>
        withConfigSync({
          sinks: {},
          loggers: [],
          // @ts-expect-error withConfigSync() rejects async callbacks.
        }, async () => {
          await Promise.reject(new Error("async callback failed"));
        }),
      ConfigError,
    );
    await delay(0);
  } finally {
    await reset();
  }
});

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

  const metaCategories = [[], "logtape", ["logtape"], ["logtape", "meta"]];
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
        LoggerImpl.getLogger(["logtape", "meta"]).sinks,
        [],
      );
      assert.strictEqual(getConfig(), config);
    } finally {
      await reset();
      assert.strictEqual(getConfig(), null);
    }
  }
});

test(
  "configure() does not require addEventListener() in Edge runtimes",
  { skip: hasAddEventListener },
  async () => {
    if (hasAddEventListener) return;

    const edgeRuntime = Object.getOwnPropertyDescriptor(
      globalThis,
      "EdgeRuntime",
    );

    try {
      Object.defineProperty(globalThis, "EdgeRuntime", {
        configurable: true,
        value: "edge-runtime",
        writable: true,
      });

      const config: Config<string, string> = {
        sinks: {},
        loggers: [
          { category: "my-app" },
          { category: ["logtape", "meta"], sinks: [] },
        ],
      };

      await configure(config);
      assert.strictEqual(getConfig(), config);
    } finally {
      await reset();
      if (edgeRuntime == null) {
        Reflect.deleteProperty(globalThis, "EdgeRuntime");
      } else Object.defineProperty(globalThis, "EdgeRuntime", edgeRuntime);
    }
  },
);

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

  const metaCategories = [[], "logtape", ["logtape"], ["logtape", "meta"]];
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
        LoggerImpl.getLogger(["logtape", "meta"]).sinks,
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

test("dispose() disposes filters before sinks", async () => {
  const events: string[] = [];
  const syncSink: Sink & Disposable = () => {};
  syncSink[Symbol.dispose] = () => events.push("sync sink");
  const asyncSink: Sink & AsyncDisposable = () => {};
  asyncSink[Symbol.asyncDispose] = () => {
    events.push("async sink");
    return Promise.resolve();
  };
  const syncFilter: Filter & Disposable = () => true;
  syncFilter[Symbol.dispose] = () => events.push("sync filter");
  const asyncFilter: Filter & AsyncDisposable = () => true;
  asyncFilter[Symbol.asyncDispose] = () => {
    events.push("async filter");
    return Promise.resolve();
  };

  try {
    await configure({
      sinks: { asyncSink, syncSink },
      filters: { asyncFilter, syncFilter },
      loggers: [
        {
          category: "my-app",
          sinks: ["asyncSink", "syncSink"],
          filters: ["asyncFilter", "syncFilter"],
        },
      ],
    });
    events.length = 0;

    await reset();

    assert.deepStrictEqual(events, [
      "sync filter",
      "async filter",
      "sync sink",
      "async sink",
    ]);
  } finally {
    await reset();
  }
});

test("dispose() disposes sinks after async filter rejection", async () => {
  const events: string[] = [];
  const error = new Error("filter disposal failed");
  const syncSink: Sink & Disposable = () => {};
  syncSink[Symbol.dispose] = () => events.push("sync sink");
  const asyncSink: Sink & AsyncDisposable = () => {};
  asyncSink[Symbol.asyncDispose] = () => {
    events.push("async sink");
    return Promise.resolve();
  };
  const asyncFilter: Filter & AsyncDisposable = () => true;
  asyncFilter[Symbol.asyncDispose] = () => {
    events.push("async filter");
    return Promise.reject(error);
  };

  try {
    await configure({
      sinks: { asyncSink, syncSink },
      filters: { asyncFilter },
      loggers: [
        {
          category: "my-app",
          sinks: ["asyncSink", "syncSink"],
          filters: ["asyncFilter"],
        },
      ],
    });
    events.length = 0;

    await assert.rejects(reset(), error);

    assert.deepStrictEqual(events, [
      "async filter",
      "sync sink",
      "async sink",
    ]);
  } finally {
    await reset();
  }
});

test("dispose() disposes remaining async resources after sync errors", async () => {
  const events: string[] = [];
  const filterError = new Error("filter disposal failed");
  const sinkError = new Error("sink disposal failed");
  const filterA: Filter & AsyncDisposable = () => true;
  filterA[Symbol.asyncDispose] = () => {
    events.push("filter a");
    throw filterError;
  };
  const filterB: Filter & AsyncDisposable = () => true;
  filterB[Symbol.asyncDispose] = () => {
    events.push("filter b");
    return Promise.resolve();
  };
  const sinkA: Sink & AsyncDisposable = () => {};
  sinkA[Symbol.asyncDispose] = () => {
    events.push("sink a");
    throw sinkError;
  };
  const sinkB: Sink & AsyncDisposable = () => {};
  sinkB[Symbol.asyncDispose] = () => {
    events.push("sink b");
    return Promise.resolve();
  };

  try {
    await configure({
      sinks: { sinkA, sinkB },
      filters: { filterA, filterB },
      loggers: [
        {
          category: "my-app",
          sinks: ["sinkA", "sinkB"],
          filters: ["filterA", "filterB"],
        },
      ],
    });
    events.length = 0;

    await assert.rejects(
      reset(),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepStrictEqual(error.errors, [filterError, sinkError]);
        return true;
      },
    );

    assert.deepStrictEqual(events, [
      "filter a",
      "filter b",
      "sink a",
      "sink b",
    ]);
  } finally {
    await reset();
  }
});

test("dispose() deduplicates shared async sink and filter", async () => {
  const events: string[] = [];
  const shared: Sink & Filter & AsyncDisposable = () => true;
  shared[Symbol.asyncDispose] = () => {
    events.push("shared");
    return Promise.resolve();
  };

  try {
    await configure({
      sinks: { shared },
      filters: { shared },
      loggers: [
        {
          category: "my-app",
          sinks: ["shared"],
          filters: ["shared"],
        },
      ],
    });
    events.length = 0;

    await reset();

    assert.deepStrictEqual(events, ["shared"]);
  } finally {
    await reset();
  }
});

test("disposeSync() disposes sync filters before sync sinks", () => {
  const events: string[] = [];
  const sink: Sink & Disposable = () => {};
  sink[Symbol.dispose] = () => events.push("sink");
  const filter: Filter & Disposable = () => true;
  filter[Symbol.dispose] = () => events.push("filter");

  try {
    configureSync({
      sinks: { sink },
      filters: { filter },
      loggers: [
        {
          category: "my-app",
          sinks: ["sink"],
          filters: ["filter"],
        },
      ],
    });
    events.length = 0;

    resetSync();

    assert.deepStrictEqual(events, ["filter", "sink"]);
  } finally {
    resetSync();
  }
});

test("disposeSync() disposes remaining resources after sync errors", () => {
  const events: string[] = [];
  const filterError = new Error("filter disposal failed");
  const sinkError = new Error("sink disposal failed");
  const filterA: Filter & Disposable = () => true;
  filterA[Symbol.dispose] = () => {
    events.push("filter a");
    throw filterError;
  };
  const filterB: Filter & Disposable = () => true;
  filterB[Symbol.dispose] = () => events.push("filter b");
  const sinkA: Sink & Disposable = () => {};
  sinkA[Symbol.dispose] = () => {
    events.push("sink a");
    throw sinkError;
  };
  const sinkB: Sink & Disposable = () => {};
  sinkB[Symbol.dispose] = () => events.push("sink b");

  try {
    configureSync({
      sinks: { sinkA, sinkB },
      filters: { filterA, filterB },
      loggers: [
        {
          category: "my-app",
          sinks: ["sinkA", "sinkB"],
          filters: ["filterA", "filterB"],
        },
      ],
    });
    events.length = 0;

    assert.throws(
      () => resetSync(),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepStrictEqual(error.errors, [filterError, sinkError]);
        return true;
      },
    );

    assert.deepStrictEqual(events, [
      "filter a",
      "filter b",
      "sink a",
      "sink b",
    ]);
  } finally {
    resetSync();
  }
});

test("disposeSync() deduplicates shared sync sink and filter", () => {
  const events: string[] = [];
  const shared: Sink & Filter & Disposable = () => true;
  shared[Symbol.dispose] = () => events.push("shared");

  try {
    configureSync({
      sinks: { shared },
      filters: { shared },
      loggers: [
        {
          category: "my-app",
          sinks: ["shared"],
          filters: ["shared"],
        },
      ],
    });
    events.length = 0;

    resetSync();

    assert.deepStrictEqual(events, ["shared"]);
  } finally {
    resetSync();
  }
});

test(
  "configureSync() does not require addEventListener() in Edge runtimes",
  { skip: hasAddEventListener },
  () => {
    if (hasAddEventListener) return;

    const edgeRuntime = Object.getOwnPropertyDescriptor(
      globalThis,
      "EdgeRuntime",
    );

    try {
      Object.defineProperty(globalThis, "EdgeRuntime", {
        configurable: true,
        value: "edge-runtime",
        writable: true,
      });

      const config: Config<string, string> = {
        sinks: {},
        loggers: [
          { category: "my-app" },
          { category: ["logtape", "meta"], sinks: [] },
        ],
      };

      configureSync(config);
      assert.strictEqual(getConfig(), config);
    } finally {
      resetSync();
      if (edgeRuntime == null) {
        Reflect.deleteProperty(globalThis, "EdgeRuntime");
      } else Object.defineProperty(globalThis, "EdgeRuntime", edgeRuntime);
    }
  },
);
