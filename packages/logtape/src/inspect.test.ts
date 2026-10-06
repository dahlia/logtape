import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import fc from "fast-check";
import {
  type Config,
  configure,
  configureSync,
  reset,
  resetSync,
  withConfig,
  withConfigSync,
} from "./config.ts";
import { withCategoryPrefix } from "./context.ts";
import { type Filter, getLevelFilter } from "./filter.ts";
import { inspectLogger, type LoggerInspection } from "./inspect.ts";
import { getLogLevels, type LogLevel } from "./level.ts";
import { getLogger, getLoggers, lazy, LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

const quietMeta = {
  category: ["logtape", "meta"],
  sinks: [] as never[],
  parentSinks: "override" as const,
  lowestLevel: null,
};

function pathSummary(
  inspection: LoggerInspection,
): [string | undefined, readonly string[], string][] {
  return inspection.sinkPaths.map((path) => [
    path.id,
    path.category,
    path.status,
  ]);
}

test("inspectLogger() without any configuration", () => {
  resetSync();
  const inspection = inspectLogger(["inspect-unconfigured", "child"]);
  assert.strictEqual(inspection.source, "unconfigured");
  assert.deepStrictEqual(inspection.category, [
    "inspect-unconfigured",
    "child",
  ]);
  assert.deepStrictEqual(inspection.categoryPrefix, []);
  assert.deepStrictEqual(inspection.effectiveCategory, inspection.category);
  assert.strictEqual(inspection.level, undefined);
  assert.ok(!("level" in inspection));
  assert.deepStrictEqual(
    inspection.loggers.map((logger) => [logger.category, logger.configured]),
    [
      [[], false],
      [["inspect-unconfigured"], false],
      [["inspect-unconfigured", "child"], false],
    ],
  );
  assert.deepStrictEqual(inspection.sinkPaths, []);
  assert.deepStrictEqual(inspection.filters, { category: null, filters: [] });
  assert.deepStrictEqual(inspection.inheritanceBoundary, {
    category: [],
    reason: "root",
  });
  assert.strictEqual(inspection.status, "disabled");
});

test("inspectLogger() explains level gates of inherited sinks", () => {
  const a: Sink = () => {};
  const b: Sink = () => {};
  configureSync({
    sinks: { a, b },
    loggers: [
      { category: ["app"], lowestLevel: "info", sinks: ["a"] },
      { category: ["app", "db"], lowestLevel: "debug", sinks: ["b"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const inspection = inspectLogger(["app", "db"]);
    assert.strictEqual(inspection.source, "global");
    assert.deepStrictEqual(inspection.loggers, [
      {
        category: [],
        configured: false,
        lowestLevel: "trace",
        parentSinks: "inherit",
        sinkIds: [],
        filterIds: [],
      },
      {
        category: ["app"],
        configured: true,
        lowestLevel: "info",
        parentSinks: "inherit",
        sinkIds: ["a"],
        filterIds: [],
      },
      {
        category: ["app", "db"],
        configured: true,
        lowestLevel: "debug",
        parentSinks: "inherit",
        sinkIds: ["b"],
        filterIds: [],
      },
    ]);
    assert.deepStrictEqual(inspection.sinkPaths, [
      {
        id: "a",
        sink: a,
        category: ["app"],
        gates: [
          { category: ["app", "db"], lowestLevel: "debug" },
          { category: ["app"], lowestLevel: "info" },
        ],
        lowestLevel: "info",
        status: "enabled",
      },
      {
        id: "b",
        sink: b,
        category: ["app", "db"],
        gates: [{ category: ["app", "db"], lowestLevel: "debug" }],
        lowestLevel: "debug",
        status: "enabled",
      },
    ]);
    assert.strictEqual(inspection.status, "enabled");

    const debug = inspectLogger(["app", "db"], { level: "debug" });
    assert.strictEqual(debug.level, "debug");
    assert.deepStrictEqual(pathSummary(debug), [
      ["a", ["app"], "disabled"],
      ["b", ["app", "db"], "enabled"],
    ]);
    // The evaluated level changes statuses, not thresholds:
    assert.deepStrictEqual(
      debug.sinkPaths.map((path) => path.lowestLevel),
      ["info", "debug"],
    );
    assert.strictEqual(debug.status, "enabled");

    const trace = inspectLogger(getLogger(["app", "db"]), { level: "trace" });
    assert.deepStrictEqual(pathSummary(trace), [
      ["a", ["app"], "disabled"],
      ["b", ["app", "db"], "disabled"],
    ]);
    assert.strictEqual(trace.status, "disabled");
  } finally {
    resetSync();
  }
});

test("inspectLogger() keeps sink paths disabled by a null gate", () => {
  configureSync({
    sinks: { root: () => {}, app: () => {}, child: () => {} },
    loggers: [
      { category: [], sinks: ["root"] },
      { category: ["app"], lowestLevel: null, sinks: ["app"] },
      { category: ["app", "child"], sinks: ["child"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const inspection = inspectLogger(["app", "child"]);
    assert.deepStrictEqual(
      inspection.sinkPaths.map((path) => [
        path.id,
        path.gates.map((gate) => gate.lowestLevel),
        path.lowestLevel,
        path.status,
      ]),
      [
        ["root", ["trace", null, "trace"], null, "disabled"],
        ["app", ["trace", null], null, "disabled"],
        ["child", ["trace"], "trace", "enabled"],
      ],
    );
    // An enabled path dominates disabled ones:
    assert.strictEqual(inspection.status, "enabled");
    assert.strictEqual(inspectLogger(["app"]).status, "disabled");
  } finally {
    resetSync();
  }
});

test("inspectLogger() shows where parentSinks: override stops inheritance", () => {
  configureSync({
    sinks: { root: () => {}, app: () => {}, child: () => {} },
    loggers: [
      { category: [], sinks: ["root"] },
      { category: ["app"], sinks: ["app"], parentSinks: "override" },
      { category: ["app", "child"], sinks: ["child"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const inspection = inspectLogger(["app", "child", "leaf"]);
    assert.deepStrictEqual(inspection.inheritanceBoundary, {
      category: ["app"],
      reason: "override",
    });
    assert.deepStrictEqual(pathSummary(inspection), [
      ["app", ["app"], "enabled"],
      ["child", ["app", "child"], "enabled"],
    ]);
    assert.deepStrictEqual(inspectLogger("other").inheritanceBoundary, {
      category: [],
      reason: "root",
    });
  } finally {
    resetSync();
  }
});

test("inspectLogger() omits ancestor gates bypassed by forwarding", () => {
  configureSync({
    sinks: { s: () => {}, local: () => {} },
    loggers: [
      { category: [], lowestLevel: null, sinks: ["s"] },
      {
        category: ["app"],
        lowestLevel: "debug",
        parentSinks: "forward",
        sinks: ["local"],
      },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const inspection = inspectLogger(["app", "child"], { level: "debug" });
    assert.deepStrictEqual(
      inspection.sinkPaths.map((path) => [path.id, path.gates, path.status]),
      [
        [
          "s",
          [
            { category: ["app", "child"], lowestLevel: "trace" },
            { category: ["app"], lowestLevel: "debug" },
          ],
          "enabled",
        ],
        [
          "local",
          [
            { category: ["app", "child"], lowestLevel: "trace" },
            { category: ["app"], lowestLevel: "debug" },
          ],
          "enabled",
        ],
      ],
    );
    assert.strictEqual(
      inspectLogger(["app"], { level: "trace" }).status,
      "disabled",
    );
  } finally {
    resetSync();
  }
});

test("inspectLogger() forwards sinks only up to an override boundary", () => {
  configureSync({
    sinks: { root: () => {}, app: () => {}, mid: () => {} },
    loggers: [
      { category: [], sinks: ["root"] },
      {
        category: ["app"],
        sinks: ["app"],
        parentSinks: "override",
        lowestLevel: "error",
      },
      { category: ["app", "mid"], sinks: ["mid"], lowestLevel: "fatal" },
      {
        category: ["app", "mid", "leaf"],
        parentSinks: "forward",
        lowestLevel: "debug",
      },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const inspection = inspectLogger(["app", "mid", "leaf"], {
      level: "info",
    });
    assert.deepStrictEqual(inspection.inheritanceBoundary, {
      category: ["app"],
      reason: "override",
    });
    assert.deepStrictEqual(pathSummary(inspection), [
      ["app", ["app"], "enabled"],
      ["mid", ["app", "mid"], "enabled"],
    ]);
  } finally {
    resetSync();
  }
});

test("inspectLogger() preserves repeated sink paths", () => {
  const records: LogRecord[] = [];
  const sink: Sink = records.push.bind(records);
  configureSync({
    sinks: { a: sink, alias: sink },
    loggers: [
      { category: ["app"], sinks: ["a"] },
      { category: ["app", "db"], sinks: ["a", "alias"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const inspection = inspectLogger(["app", "db"]);
    assert.deepStrictEqual(pathSummary(inspection), [
      ["a", ["app"], "enabled"],
      ["a", ["app", "db"], "enabled"],
      ["alias", ["app", "db"], "enabled"],
    ]);
    assert.ok(inspection.sinkPaths.every((path) => path.sink === sink));
    getLogger(["app", "db"]).info("hello");
    assert.strictEqual(records.length, inspection.sinkPaths.length);
  } finally {
    resetSync();
  }
});

test("inspectLogger() describes level filters without invoking them", () => {
  configureSync({
    sinks: { a: () => {} },
    filters: {
      warning: "warning",
      error: getLevelFilter("error"),
      none: null,
    },
    loggers: [
      { category: ["app"], sinks: ["a"], filters: ["warning"] },
      { category: ["app", "strict"], filters: ["warning", "error"] },
      { category: ["app", "off"], filters: ["none"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const app = inspectLogger(["app", "child"]);
    assert.deepStrictEqual(app.filters.category, ["app"]);
    assert.deepStrictEqual(
      app.filters.filters.map((f) => [f.id, f.lowestLevel]),
      [["warning", "warning"]],
    );
    assert.strictEqual(app.sinkPaths[0].lowestLevel, "warning");
    assert.strictEqual(app.sinkPaths[0].status, "enabled");
    assert.strictEqual(
      inspectLogger(["app"], { level: "info" }).status,
      "disabled",
    );

    // Filters of the nearest ancestor that has any replace inherited ones:
    const strict = inspectLogger(["app", "strict"], { level: "warning" });
    assert.deepStrictEqual(strict.filters.category, ["app", "strict"]);
    assert.deepStrictEqual(
      strict.filters.filters.map((f) => [f.id, f.lowestLevel]),
      [["warning", "warning"], ["error", "error"]],
    );
    assert.strictEqual(strict.sinkPaths[0].lowestLevel, "error");
    assert.strictEqual(strict.status, "disabled");

    const off = inspectLogger(["app", "off"]);
    assert.strictEqual(off.filters.filters[0].lowestLevel, null);
    assert.strictEqual(off.sinkPaths[0].lowestLevel, null);
    assert.strictEqual(off.sinkPaths[0].status, "disabled");
    // The gates themselves are unchanged by the filters:
    assert.ok(
      off.sinkPaths[0].gates.every((gate) => gate.lowestLevel === "trace"),
    );
  } finally {
    resetSync();
  }
});

test("inspectLogger() reports custom filters as conditional", () => {
  let filterCalls = 0;
  const custom: Filter = () => {
    filterCalls++;
    return true;
  };
  configureSync({
    sinks: { a: () => {} },
    filters: { custom, error: "error", none: null },
    loggers: [
      { category: [], sinks: ["a"], lowestLevel: "info" },
      { category: ["app"], filters: ["custom"] },
      { category: ["app", "error"], filters: ["custom", "error"] },
      { category: ["app", "off"], filters: ["custom", "none"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const app = inspectLogger("app");
    assert.deepStrictEqual(app.filters.category, ["app"]);
    assert.deepStrictEqual(app.filters.filters, [
      { id: "custom", filter: custom },
    ]);
    assert.ok(!("lowestLevel" in app.filters.filters[0]));
    assert.strictEqual(app.sinkPaths[0].status, "conditional");
    assert.strictEqual(app.status, "conditional");
    assert.strictEqual(
      inspectLogger("app", { level: "debug" }).status,
      "disabled",
    );

    const error = inspectLogger(["app", "error"], { level: "warning" });
    assert.strictEqual(error.status, "disabled");
    assert.strictEqual(
      inspectLogger(["app", "error"], { level: "error" }).status,
      "conditional",
    );

    // A static rejection dominates the presence of a custom filter:
    assert.strictEqual(inspectLogger(["app", "off"]).status, "disabled");
    assert.strictEqual(filterCalls, 0);
  } finally {
    resetSync();
  }
});

test("inspectLogger() has no side effects", () => {
  let sinkCalls = 0;
  let filterCalls = 0;
  let disposeCalls = 0;
  let lazyCalls = 0;
  const sink: Sink & Disposable = () => {
    sinkCalls++;
  };
  sink[Symbol.dispose] = () => {
    disposeCalls++;
  };
  const filter: Filter & Disposable = () => {
    filterCalls++;
    return true;
  };
  filter[Symbol.dispose] = () => {
    disposeCalls++;
  };
  configureSync({
    sinks: { sink },
    filters: { filter },
    loggers: [
      { category: ["side-effects"], sinks: ["sink"], filters: ["filter"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    const logger = getLogger("side-effects").with({
      value: lazy(() => {
        lazyCalls++;
        return 1;
      }),
    });
    const before = getLoggers().map((l) => l.category);
    for (const level of getLogLevels()) {
      inspectLogger(logger, { level });
      inspectLogger(["side-effects", "never", "created"], { level });
    }
    assert.deepStrictEqual(getLoggers().map((l) => l.category), before);
    assert.strictEqual(sinkCalls, 0);
    assert.strictEqual(filterCalls, 0);
    assert.strictEqual(disposeCalls, 0);
    assert.strictEqual(lazyCalls, 0);
    assert.deepStrictEqual(inspectLogger(logger).category, ["side-effects"]);
  } finally {
    resetSync();
  }
});

test("inspectLogger() returns a fresh report", () => {
  const records: LogRecord[] = [];
  configureSync({
    sinks: { a: records.push.bind(records) },
    loggers: [{ category: ["fresh"], sinks: ["a"] }, quietMeta],
    reset: true,
  });
  try {
    const first = inspectLogger("fresh");
    (first.sinkPaths as unknown[]).length = 0;
    (first.loggers[1].sinkIds as unknown[]).push("bogus");
    (first.loggers[1].category as string[])[0] = "bogus";
    (first.effectiveCategory as string[]).push("bogus");
    const second = inspectLogger("fresh");
    assert.deepStrictEqual(pathSummary(second), [
      ["a", ["fresh"], "enabled"],
    ]);
    assert.deepStrictEqual(second.loggers[1].sinkIds, ["a"]);
    assert.deepStrictEqual(second.effectiveCategory, ["fresh"]);
    getLogger("fresh").info("hello");
    assert.strictEqual(records.length, 1);
  } finally {
    resetSync();
  }
});

test("inspectLogger() distinguishes a single segment from a child category", () => {
  configureSync({
    sinks: { console: () => {} },
    loggers: [{ category: "activitypub-mcp", sinks: ["console"] }, quietMeta],
    reset: true,
  });
  try {
    const mistaken = inspectLogger("activitypub-mcp:http");
    assert.deepStrictEqual(mistaken.effectiveCategory, [
      "activitypub-mcp:http",
    ]);
    assert.deepStrictEqual(
      mistaken.loggers.map((logger) => [logger.category, logger.configured]),
      [[[], false], [["activitypub-mcp:http"], false]],
    );
    assert.deepStrictEqual(mistaken.sinkPaths, []);
    assert.strictEqual(mistaken.status, "disabled");

    const child = inspectLogger(["activitypub-mcp", "http"]);
    assert.deepStrictEqual(pathSummary(child), [
      ["console", ["activitypub-mcp"], "enabled"],
    ]);
  } finally {
    resetSync();
  }
});

test("inspectLogger() attributes sink identifiers", () => {
  const sink: Sink = () => {};
  const config: Config<string, string> = {
    sinks: { first: sink, second: sink },
    loggers: [{ category: ["ids"], sinks: ["first", "second"] }],
    reset: true,
  };
  configureSync(config);
  try {
    // The meta logger gets a console sink that has no identifier:
    const meta = inspectLogger(["logtape", "meta"]);
    assert.deepStrictEqual(meta.loggers[2].sinkIds, [undefined]);
    assert.strictEqual(meta.loggers[2].configured, false);
    assert.deepStrictEqual(meta.sinkPaths.map((path) => path.id), [undefined]);

    assert.deepStrictEqual(
      inspectLogger("ids").sinkPaths.map((path) => path.id),
      ["first", "second"],
    );

    // Changing the given configuration afterward does not change the report:
    config.loggers[0].sinks!.reverse();
    config.loggers[0].sinks!.push("first");
    assert.deepStrictEqual(inspectLogger("ids").loggers[1].sinkIds, [
      "first",
      "second",
    ]);

    // Identifiers are no longer attributed once sinks are modified directly:
    LoggerImpl.getLogger("ids").sinks.shift();
    const modified = inspectLogger("ids");
    assert.strictEqual(modified.loggers[1].configured, true);
    assert.deepStrictEqual(modified.loggers[1].sinkIds, [undefined]);
    assert.deepStrictEqual(
      modified.sinkPaths.map((path) => [path.id, path.sink === sink]),
      [[undefined, true]],
    );

    // The same applies to filters, independently of sinks:
    configureSync({
      sinks: { a: sink },
      filters: { f1: () => true, f2: "info" },
      loggers: [
        { category: ["ids"], sinks: ["a"], filters: ["f1", "f2"] },
        quietMeta,
      ],
      reset: true,
    });
    assert.deepStrictEqual(inspectLogger("ids").loggers[1].filterIds, [
      "f1",
      "f2",
    ]);
    LoggerImpl.getLogger("ids").filters.pop();
    const filtersModified = inspectLogger("ids");
    assert.deepStrictEqual(filtersModified.loggers[1].filterIds, [undefined]);
    assert.deepStrictEqual(filtersModified.loggers[1].sinkIds, ["a"]);
    assert.deepStrictEqual(
      filtersModified.filters.filters.map((f) => f.id),
      [undefined],
    );

    configureSync({
      sinks: { third: sink },
      loggers: [{ category: ["ids"], sinks: ["third"] }, quietMeta],
      reset: true,
    });
    assert.deepStrictEqual(inspectLogger("ids").loggers[1].sinkIds, [
      "third",
    ]);
  } finally {
    resetSync();
  }
  const afterReset = inspectLogger("ids");
  assert.strictEqual(afterReset.source, "unconfigured");
  assert.deepStrictEqual(afterReset.loggers[1], {
    category: ["ids"],
    configured: false,
    lowestLevel: "trace",
    parentSinks: "inherit",
    sinkIds: [],
    filterIds: [],
  });
});

test("inspectLogger() applies the category prefix", () => {
  configureSync({
    sinks: { prefixed: () => {}, meta: () => {} },
    loggers: [
      { category: ["tenant", "lib"], sinks: ["prefixed"] },
      { category: ["logtape", "meta"], sinks: ["meta"] },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });
  try {
    withCategoryPrefix("tenant", () => {
      const inspection = inspectLogger(["lib", "unmaterialized"]);
      assert.deepStrictEqual(inspection.categoryPrefix, ["tenant"]);
      assert.deepStrictEqual(inspection.category, ["lib", "unmaterialized"]);
      assert.deepStrictEqual(inspection.effectiveCategory, [
        "tenant",
        "lib",
        "unmaterialized",
      ]);
      assert.deepStrictEqual(pathSummary(inspection), [
        ["prefixed", ["tenant", "lib"], "enabled"],
      ]);

      // The prefix does not apply to the meta logger:
      const meta = inspectLogger(["logtape", "meta"]);
      assert.deepStrictEqual(meta.categoryPrefix, ["tenant"]);
      assert.deepStrictEqual(meta.effectiveCategory, ["logtape", "meta"]);
      assert.deepStrictEqual(pathSummary(meta), [
        ["meta", ["logtape", "meta"], "enabled"],
      ]);
    });
    assert.deepStrictEqual(inspectLogger("lib").sinkPaths, []);
  } finally {
    resetSync();
  }
});

test("inspectLogger() reports scoped configurations", async () => {
  const outerSink: Sink = () => {};
  const innerSink: Sink = () => {};
  await configure({
    sinks: { global: () => {} },
    loggers: [{ category: [], sinks: ["global"] }, quietMeta],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let detached!: Promise<LoggerInspection[]>;
  try {
    assert.strictEqual(inspectLogger("app").source, "global");
    await withConfig({
      sinks: { outer: outerSink },
      filters: { custom: () => true },
      loggers: [{ category: "app", sinks: ["outer"], filters: ["custom"] }],
    }, async () => {
      const outer = inspectLogger(["app", "child"]);
      assert.strictEqual(outer.source, "scoped");
      assert.deepStrictEqual(pathSummary(outer), [
        ["outer", ["app"], "conditional"],
      ]);
      assert.deepStrictEqual(outer.filters.category, ["app"]);
      assert.deepStrictEqual(outer.filters.filters.map((f) => f.id), [
        "custom",
      ]);
      assert.deepStrictEqual(
        outer.loggers.map((logger) => logger.configured),
        [false, true, false],
      );

      await withConfig({
        sinks: { inner: innerSink },
        loggers: [{ category: [], sinks: ["inner"], lowestLevel: "error" }],
      }, () => {
        const inner = inspectLogger(["app", "child"], { level: "info" });
        assert.strictEqual(inner.source, "scoped");
        assert.deepStrictEqual(pathSummary(inner), [
          ["inner", [], "disabled"],
        ]);
        assert.deepStrictEqual(inner.sinkPaths[0].sink, innerSink);
        detached = (async () => {
          await gate;
          return [inspectLogger(["app", "child"])];
        })();
      });

      // The inner scope is disposed, so detached work falls back to the
      // outer scope:
      release();
      const [fallback] = await detached;
      assert.strictEqual(fallback.source, "scoped");
      assert.deepStrictEqual(pathSummary(fallback), [
        ["outer", ["app"], "conditional"],
      ]);
    });
    await delay(0);
    assert.strictEqual(inspectLogger("app").source, "global");
  } finally {
    await reset();
  }
});

test("inspectLogger() applies the category prefix in a scoped configuration", () => {
  configureSync({
    sinks: {},
    loggers: [quietMeta],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });
  try {
    const loggers = [{ category: ["p", "lib"], sinks: ["a", "b"] }];
    withConfigSync({ sinks: { a: () => {}, b: () => {} }, loggers }, () => {
      // Changing the given configuration afterward does not change the report:
      loggers[0].sinks.reverse();
      loggers[0].sinks.push("a");
      withCategoryPrefix("p", () => {
        const inspection = inspectLogger("lib");
        assert.strictEqual(inspection.source, "scoped");
        assert.deepStrictEqual(inspection.effectiveCategory, ["p", "lib"]);
        assert.deepStrictEqual(pathSummary(inspection), [
          ["a", ["p", "lib"], "enabled"],
          ["b", ["p", "lib"], "enabled"],
        ]);
      });
      assert.deepStrictEqual(inspectLogger("lib").sinkPaths, []);
    });
  } finally {
    resetSync();
  }
});

test("inspectLogger() tolerates scoped configurations without identifiers", () => {
  const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>();
  configureSync({
    sinks: {},
    loggers: [quietMeta],
    contextLocalStorage,
    reset: true,
  });
  try {
    // A scoped configuration compiled by an older copy of LogTape in the same
    // process has no sink or filter identifiers:
    const sink: Sink = () => {};
    const filter: Filter = () => true;
    const nodes = new Map([[JSON.stringify(["old"]), {
      filters: [filter],
      lowestLevel: "trace",
      parentSinks: "inherit",
      sinks: [sink],
    }]]);
    const scopedConfig = {
      nodes,
      dispatchCache: new Map(),
      filterCache: new Map(),
      parent: undefined,
      disposed: false,
      syncFilters: new Set(),
      asyncFilters: new Set(),
      syncSinks: new Set(),
      asyncSinks: new Set(),
    };
    contextLocalStorage.run(
      { [Symbol.for("logtape.scopedConfig")]: scopedConfig } as Record<
        string,
        unknown
      >,
      () => {
        const inspection = inspectLogger("old");
        assert.strictEqual(inspection.source, "scoped");
        assert.deepStrictEqual(inspection.loggers[1].sinkIds, [undefined]);
        assert.deepStrictEqual(inspection.loggers[1].filterIds, [undefined]);
        assert.deepStrictEqual(
          inspection.sinkPaths.map((path) => [path.id, path.sink === sink]),
          [[undefined, true]],
        );
        assert.deepStrictEqual(inspection.filters.filters, [
          { id: undefined, filter },
        ]);
      },
    );
  } finally {
    resetSync();
  }
});

test("inspectLogger() does not touch scoped dispatch caches", () => {
  configureSync({
    sinks: {},
    loggers: [quietMeta],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });
  try {
    withConfigSync({
      sinks: { a: () => {} },
      filters: { custom: () => true },
      loggers: [{ category: "cache", sinks: ["a"], filters: ["custom"] }],
    }, () => {
      getLogger("cache").info("warm up");
      const store = LoggerImpl.getLogger().contextLocalStorage!.getStore()!;
      const scoped = Object.getOwnPropertySymbols(store)
        .map((symbol) => (store as Record<symbol, unknown>)[symbol])
        .find((value) =>
          value != null && typeof value === "object" && "dispatchCache" in value
        ) as {
          dispatchCache: Map<string, unknown>;
          filterCache: Map<string, unknown>;
        };
      const dispatchEntries = [...scoped.dispatchCache.entries()];
      const filterEntries = [...scoped.filterCache.entries()];
      assert.ok(dispatchEntries.length > 0);
      assert.ok(filterEntries.length > 0);
      for (const level of getLogLevels()) {
        inspectLogger(["cache"], { level });
        inspectLogger(["cache", "child"], { level });
      }
      assert.deepStrictEqual([...scoped.dispatchCache.entries()], [
        ...dispatchEntries,
      ]);
      assert.deepStrictEqual([...scoped.filterCache.entries()], [
        ...filterEntries,
      ]);
      for (const [key, value] of dispatchEntries) {
        assert.strictEqual(scoped.dispatchCache.get(key), value);
      }
      for (const [key, value] of filterEntries) {
        assert.strictEqual(scoped.filterCache.get(key), value);
      }
    });
  } finally {
    resetSync();
  }
});

test("inspectLogger() handles categories named like object properties", () => {
  configureSync({
    sinks: { a: () => {} },
    loggers: [{ category: [], sinks: ["a"] }, quietMeta],
    reset: true,
  });
  try {
    for (const name of ["constructor", "toString", "__proto__"]) {
      const inspection = inspectLogger([name, "hasOwnProperty"]);
      assert.deepStrictEqual(inspection.effectiveCategory, [
        name,
        "hasOwnProperty",
      ]);
      assert.deepStrictEqual(pathSummary(inspection), [["a", [], "enabled"]]);
    }
  } finally {
    resetSync();
  }
});

test("inspectLogger() rejects invalid arguments", () => {
  assert.throws(
    () => inspectLogger([1] as unknown as string[]),
    TypeError,
  );
  assert.throws(() => inspectLogger(123 as unknown as string), TypeError);
  assert.throws(
    () => inspectLogger("app", { level: "verbose" as LogLevel }),
    TypeError,
  );
});

type ParentSinksMode = "inherit" | "override" | "forward";

interface GeneratedLogger {
  readonly lowestLevel: LogLevel | null | undefined;
  readonly parentSinks: ParentSinksMode | undefined;
  readonly sinks: readonly string[];
}

const sinkIds = ["s0", "s1", "s2"] as const;

const generatedLoggerArb: fc.Arbitrary<GeneratedLogger | null> = fc.option(
  fc.record({
    lowestLevel: fc.constantFrom<LogLevel | null | undefined>(
      undefined,
      null,
      ...getLogLevels(),
    ),
    parentSinks: fc.constantFrom<ParentSinksMode | undefined>(
      undefined,
      "inherit",
      "override",
      "forward",
    ),
    sinks: fc.array(fc.constantFrom(...sinkIds), { maxLength: 3 }),
  }),
);

// Loggers for [], ["o"], ["o", "a"], ["o", "a", "b"], and the depth of the
// category to log through:
const generatedTreeArb = fc.tuple(
  fc.array(generatedLoggerArb, { minLength: 4, maxLength: 4 }),
  fc.integer({ min: 0, max: 4 }),
);

const generatedCategories = [[], ["o"], ["o", "a"], ["o", "a", "b"], [
  "o",
  "a",
  "b",
  "c",
]];

function toLoggerConfigs(loggers: readonly (GeneratedLogger | null)[]) {
  return loggers.flatMap((logger, i) =>
    logger == null ? [] : [{
      category: generatedCategories[i],
      ...(logger.lowestLevel === undefined
        ? {}
        : { lowestLevel: logger.lowestLevel }),
      ...(logger.parentSinks === undefined
        ? {}
        : { parentSinks: logger.parentSinks }),
      sinks: [...logger.sinks],
    }]
  );
}

// Returns the number of sink calls, so that callers can make sure that
// the comparison is not vacuous.
function checkAgainstDispatch(
  category: readonly string[],
  calls: string[],
  sinkNames: ReadonlyMap<Sink, string>,
  expectedSource: LoggerInspection["source"],
): number {
  let total = 0;
  for (const level of getLogLevels()) {
    const inspection = inspectLogger(category, { level });
    assert.strictEqual(inspection.source, expectedSource);
    const expected = inspection.sinkPaths
      .filter((path) => path.status === "enabled")
      .map((path) => sinkNames.get(path.sink));
    assert.ok(
      inspection.sinkPaths.every((path) => path.status !== "conditional"),
    );
    calls.length = 0;
    getLogger(category)[level]("message");
    assert.deepStrictEqual(calls, expected);
    assert.strictEqual(
      inspection.status,
      expected.length > 0 ? "enabled" : "disabled",
    );
    total += calls.length;
  }
  return total;
}

function makeRecordingSinks(): {
  calls: string[];
  sinks: Record<string, Sink>;
  sinkNames: Map<Sink, string>;
} {
  const calls: string[] = [];
  const sinks: Record<string, Sink> = {};
  const sinkNames = new Map<Sink, string>();
  for (const id of sinkIds) {
    const sink: Sink = () => {
      calls.push(id);
    };
    sinks[id] = sink;
    sinkNames.set(sink, id);
  }
  return { calls, sinks, sinkNames };
}

test("inspectLogger() matches global dispatch", () => {
  const { calls, sinks, sinkNames } = makeRecordingSinks();
  let total = 0;
  fc.assert(
    fc.property(generatedTreeArb, ([loggers, depth]) => {
      configureSync({
        sinks,
        loggers: [...toLoggerConfigs(loggers), quietMeta],
        reset: true,
      });
      try {
        total += checkAgainstDispatch(
          generatedCategories[depth],
          calls,
          sinkNames,
          "global",
        );
      } finally {
        resetSync();
      }
    }),
  );
  assert.ok(total > 0);
});

test("inspectLogger() matches scoped dispatch", () => {
  const { calls, sinks, sinkNames } = makeRecordingSinks();
  configureSync({
    sinks: { global: () => calls.push("global") },
    loggers: [{ category: [], sinks: ["global"] }, quietMeta],
    contextLocalStorage: new AsyncLocalStorage(),
    reset: true,
  });
  let total = 0;
  try {
    fc.assert(
      fc.property(generatedTreeArb, ([loggers, depth]) => {
        withConfigSync({ sinks, loggers: toLoggerConfigs(loggers) }, () => {
          total += checkAgainstDispatch(
            generatedCategories[depth],
            calls,
            sinkNames,
            "scoped",
          );
        });
      }),
    );
    assert.ok(total > 0);
  } finally {
    resetSync();
  }
});

test("inspectLogger() matches dispatch for mixed inheritance modes", () => {
  const { calls, sinks, sinkNames } = makeRecordingSinks();
  const loggers: (GeneratedLogger | null)[] = [
    { lowestLevel: "warning", parentSinks: undefined, sinks: ["s0", "s1"] },
    { lowestLevel: null, parentSinks: "inherit", sinks: ["s2"] },
    { lowestLevel: "info", parentSinks: "forward", sinks: ["s1", "s0"] },
    { lowestLevel: "debug", parentSinks: "inherit", sinks: ["s0"] },
  ];
  configureSync({
    sinks,
    loggers: [...toLoggerConfigs(loggers), quietMeta],
    reset: true,
  });
  try {
    const category = generatedCategories[4];
    const inspection = inspectLogger(category, { level: "info" });
    assert.deepStrictEqual(
      inspection.sinkPaths.map((path) => [path.id, path.status]),
      [
        ["s0", "enabled"],
        ["s1", "enabled"],
        ["s2", "enabled"],
        ["s1", "enabled"],
        ["s0", "enabled"],
        ["s0", "enabled"],
      ],
    );
    checkAgainstDispatch(category, calls, sinkNames, "global");
  } finally {
    resetSync();
  }
});

// The ESM and CommonJS builds are separate copies of LogTape that share the
// logger tree.  Deno tests run directly from source without building them.
const skipBuilds = "Deno" in globalThis;

type LogTape = typeof import("./mod.ts");

async function loadBuilds(): Promise<{ esm: LogTape; cjs: LogTape }> {
  const esm = await import(new URL("../dist/mod.js", import.meta.url).href);
  const cjs = createRequire(import.meta.url)("../dist/mod.cjs");
  assert.notStrictEqual(esm.inspectLogger, cjs.inspectLogger);
  return { esm, cjs };
}

test("inspectLogger() describes a configuration applied by another copy", {
  skip: skipBuilds,
}, async () => {
  // Bun needs an early return as well as the skip option.
  if (skipBuilds) return;
  const { esm, cjs } = await loadBuilds();
  const sink: Sink = () => {};
  esm.configureSync({
    sinks: { a: sink },
    filters: {
      off: cjs.getLevelFilter(null),
      error: esm.getLevelFilter("error"),
    },
    loggers: [
      { category: "dual", sinks: ["a"] },
      { category: ["dual", "off"], filters: ["off"] },
      { category: ["dual", "error"], filters: ["error"] },
      quietMeta,
    ],
    reset: true,
  });
  try {
    for (const inspect of [cjs.inspectLogger, inspectLogger]) {
      const dual = inspect("dual");
      assert.strictEqual(dual.source, "global");
      assert.deepStrictEqual(dual.loggers[1].configured, true);
      assert.deepStrictEqual(dual.loggers[1].sinkIds, ["a"]);
      assert.deepStrictEqual(pathSummary(dual), [["a", ["dual"], "enabled"]]);

      const off = inspect(["dual", "off"]);
      assert.deepStrictEqual(
        off.filters.filters.map((f) => [f.id, f.lowestLevel]),
        [
          ["off", null],
        ],
      );
      assert.strictEqual(off.sinkPaths[0].lowestLevel, null);
      assert.strictEqual(off.status, "disabled");

      const error = inspect(["dual", "error"]);
      assert.strictEqual(error.sinkPaths[0].lowestLevel, "error");
      assert.strictEqual(error.status, "enabled");
    }
  } finally {
    esm.resetSync();
  }
  assert.strictEqual(cjs.inspectLogger("dual").source, "unconfigured");
  assert.strictEqual(inspectLogger("dual").source, "unconfigured");
});

test("inspectLogger() reflects a reset through another copy", {
  skip: skipBuilds,
}, async () => {
  // Bun needs an early return as well as the skip option.
  if (skipBuilds) return;
  const { esm, cjs } = await loadBuilds();
  esm.configureSync({
    sinks: { a: () => {} },
    loggers: [{ category: "dual-reset", sinks: ["a"] }, quietMeta],
    reset: true,
  });
  try {
    assert.strictEqual(esm.inspectLogger("dual-reset").source, "global");
    cjs.resetSync();
    for (const inspect of [esm.inspectLogger, cjs.inspectLogger]) {
      const inspection = inspect("dual-reset");
      assert.strictEqual(inspection.source, "unconfigured");
      assert.strictEqual(inspection.loggers[1].configured, false);
      assert.deepStrictEqual(inspection.sinkPaths, []);
    }
  } finally {
    esm.resetSync();
  }
});

test("inspectLogger() finds loggers another copy created without WeakRef", {
  skip: skipBuilds,
}, async () => {
  // Bun needs an early return as well as the skip option.
  if (skipBuilds) return;
  const { cjs } = await loadBuilds();
  const weakRef = Object.getOwnPropertyDescriptor(globalThis, "WeakRef");
  // deno-lint-ignore no-explicit-any
  delete (globalThis as any).WeakRef;
  try {
    // Without WeakRef, child loggers are stored directly, as instances of
    // the copy that created the logger tree:
    getLogger(["no-weak-ref", "child"]);
  } finally {
    Object.defineProperty(globalThis, "WeakRef", weakRef!);
  }
  const inspection = cjs.inspectLogger(["no-weak-ref", "child"]);
  assert.deepStrictEqual(inspection.effectiveCategory, [
    "no-weak-ref",
    "child",
  ]);
  assert.deepStrictEqual(inspection.sinkPaths, []);
});
