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

const hasAddEventListener = typeof globalThis.addEventListener === "function";
const hasProcessExitListeners = (() => {
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  return !("Deno" in globalThis) &&
    typeof proc?.on === "function" &&
    typeof proc?.listeners === "function" &&
    (typeof proc?.off === "function" ||
      typeof proc?.removeListener === "function");
})();

function restoreGlobalProperty(
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor == null) Reflect.deleteProperty(globalThis, property);
  else Object.defineProperty(globalThis, property, descriptor);
}

function quietConfig(): Config<string, string> {
  return {
    sinks: {},
    loggers: [
      { category: "my-app" },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "fatal" },
    ],
  };
}

function stubGlobalEventHooks(): {
  activeListeners: Map<string, Set<unknown>>;
  removedListeners: unknown[];
  restore: () => void;
} {
  const addEventListenerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "addEventListener",
  );
  const removeEventListenerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "removeEventListener",
  );
  const activeListeners = new Map<string, Set<unknown>>();
  const removedListeners: unknown[] = [];

  Object.defineProperty(globalThis, "addEventListener", {
    configurable: true,
    value(type: string, listener: unknown) {
      const listeners = activeListeners.get(type) ?? new Set<unknown>();
      listeners.add(listener);
      activeListeners.set(type, listeners);
    },
    writable: true,
  });
  Object.defineProperty(globalThis, "removeEventListener", {
    configurable: true,
    value(type: string, listener: unknown) {
      activeListeners.get(type)?.delete(listener);
      removedListeners.push(listener);
    },
    writable: true,
  });

  return {
    activeListeners,
    removedListeners,
    restore() {
      restoreGlobalProperty("addEventListener", addEventListenerDescriptor);
      restoreGlobalProperty(
        "removeEventListener",
        removeEventListenerDescriptor,
      );
    },
  };
}

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

test(
  "configure() removes the process exit dispose hook on reset",
  { skip: !hasProcessExitListeners },
  async () => {
    if (!hasProcessExitListeners) return;

    // deno-lint-ignore no-explicit-any
    const proc = (globalThis as any).process;
    const before = proc.listeners("exit");

    try {
      for (let i = 0; i < 15; i++) {
        await configure({ ...quietConfig(), reset: true });
      }
      assert.strictEqual(proc.listeners("exit").length, before.length + 1);
    } finally {
      await reset();
    }

    assert.deepStrictEqual(proc.listeners("exit"), before);
  },
);

test(
  "configureSync() removes the process exit dispose hook on reset",
  { skip: !hasProcessExitListeners },
  () => {
    if (!hasProcessExitListeners) return;

    // deno-lint-ignore no-explicit-any
    const proc = (globalThis as any).process;
    const before = proc.listeners("exit");

    try {
      for (let i = 0; i < 15; i++) {
        configureSync({ ...quietConfig(), reset: true });
      }
      assert.strictEqual(proc.listeners("exit").length, before.length + 1);
    } finally {
      resetSync();
    }

    assert.deepStrictEqual(proc.listeners("exit"), before);
  },
);

test("configure() removes the Deno unload dispose hook on reset", async () => {
  const denoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  const eventHooks = stubGlobalEventHooks();

  let remainingListeners = 0;
  try {
    Object.defineProperty(globalThis, "Deno", {
      configurable: true,
      value: {},
      writable: true,
    });

    await configure(quietConfig());
    assert.strictEqual(eventHooks.activeListeners.get("unload")?.size, 1);

    await configure({ ...quietConfig(), reset: true });
    assert.strictEqual(eventHooks.activeListeners.get("unload")?.size, 1);
    assert.strictEqual(eventHooks.removedListeners.length, 1);
  } finally {
    await reset();
    remainingListeners = eventHooks.activeListeners.get("unload")?.size ?? 0;
    restoreGlobalProperty("Deno", denoDescriptor);
    eventHooks.restore();
  }
  assert.strictEqual(remainingListeners, 0);
});

test("configureSync() removes the pagehide dispose hook on reset", () => {
  const denoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  const edgeRuntimeDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "EdgeRuntime",
  );
  const eventHooks = stubGlobalEventHooks();

  let remainingListeners = 0;
  try {
    Reflect.deleteProperty(globalThis, "Deno");
    Object.defineProperty(globalThis, "EdgeRuntime", {
      configurable: true,
      value: "edge-runtime",
      writable: true,
    });

    configureSync(quietConfig());
    assert.strictEqual(eventHooks.activeListeners.get("pagehide")?.size, 1);

    configureSync({ ...quietConfig(), reset: true });
    assert.strictEqual(eventHooks.activeListeners.get("pagehide")?.size, 1);
    assert.strictEqual(eventHooks.removedListeners.length, 1);
  } finally {
    resetSync();
    remainingListeners = eventHooks.activeListeners.get("pagehide")?.size ?? 0;
    restoreGlobalProperty("Deno", denoDescriptor);
    restoreGlobalProperty("EdgeRuntime", edgeRuntimeDescriptor);
    eventHooks.restore();
  }
  assert.strictEqual(remainingListeners, 0);
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
