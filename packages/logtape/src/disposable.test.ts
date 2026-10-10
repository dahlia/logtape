import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";

// Import the implementation only after hiding the requested symbols in a fresh
// worker.  Native disposal symbols are non-configurable, so deleting them in
// this test's realm would neither simulate Safari nor isolate other tests.
const regression = String.raw`
const assert = require("node:assert/strict");
const { parentPort, workerData } = require("node:worker_threads");
const nativeSymbol = Symbol;
function legacySymbol(description) { return nativeSymbol(description); }
Object.setPrototypeOf(legacySymbol, nativeSymbol);
legacySymbol.prototype = nativeSymbol.prototype;
for (const name of workerData.missing) {
  Object.defineProperty(legacySymbol, name, { value: undefined });
}
globalThis.Symbol = legacySymbol;

(async () => {
  const {
    configure, configureSync, disposeSync, reset, resetSync,
    withConfig, withConfigSync,
  } = await import(workerData.configUrl);
  const {
    fingersCrossed, fromAsyncSink, getConsoleSink, getStreamSink, withFilter,
  } = await import(workerData.sinkUrl);
  const { getThrottlingFilter } = await import(workerData.filterUrl);
  const sync = Symbol.dispose ?? Symbol.for("Symbol.dispose");
  const async = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
  assert.notStrictEqual(sync, async);
  const config = (sink, filters = {}) => ({
    sinks: { test: sink }, filters,
    loggers: [
      { category: "test", sinks: ["test"] },
      { category: ["logtape", "meta"], lowestLevel: "fatal", sinks: [] },
    ],
  });

  // An unrelated property must not be interpreted as either disposal hook.
  const ordinary = () => {};
  ordinary.undefined = () => { throw new Error("not a disposal hook"); };
  configureSync(config(ordinary, { ordinary }));
  resetSync();

  for (const wrap of [sink => sink, sink => withFilter(sink, "info"),
    sink => fingersCrossed(sink)]) {
    let syncCalls = 0;
    const sink = () => {};
    sink[sync] = function () {
      assert.strictEqual(this, sink);
      syncCalls++;
    };
    const wrapped = wrap(sink);
    assert.strictEqual("undefined" in wrapped, false);
    assert.strictEqual(async in wrapped, false);
    configureSync(config(wrapped));
    resetSync();
    assert.strictEqual(syncCalls, 1);
    await configure(config(wrapped));
    await reset();
    assert.strictEqual(syncCalls, 2);

    let asyncCalls = 0;
    const asyncSink = () => {};
    asyncSink[async] = async function () {
      assert.strictEqual(this, asyncSink);
      asyncCalls++;
    };
    const asyncWrapped = wrap(asyncSink);
    assert.strictEqual(sync in asyncWrapped, false);
    assert.throws(() => configureSync(config(asyncWrapped)),
      /Async disposables cannot be used with configureSync/);
    await reset();
    await configure(config(asyncWrapped));
    disposeSync();
    assert.strictEqual(asyncCalls, 0);
    resetSync();
    assert.strictEqual(asyncCalls, 0);
    await reset();
    assert.strictEqual(asyncCalls, 1);
  }

  let filterCalls = 0;
  const filter = () => true;
  filter[sync] = () => { filterCalls++; };
  configureSync(config(() => {}, { filter }));
  resetSync();
  assert.strictEqual(filterCalls, 1);
  filter[async] = async () => { filterCalls++; };
  assert.throws(() => configureSync(config(() => {}, { filter })),
    /Async disposables cannot be used with configureSync/);
  await reset();

  // Throttling summaries must run once before the configured sink closes.
  for (const asynchronous of [false, true]) {
    const summaries = [];
    const calls = [];
    const throttle = getThrottlingFilter({
      limit: 1, windowMs: 1000, clock: () => 0,
      summary: { logger: { warning: (_message, properties) => {
        summaries.push(properties.suppressed);
        calls.push("summary");
      } } },
    });
    const sink = () => {};
    sink[sync] = () => { calls.push("close"); };
    if (asynchronous) await configure(config(sink, { throttle }));
    else configureSync(config(sink, { throttle }));
    const record = {
      category: ["test"], level: "warning", timestamp: 0,
      message: ["burst"], rawMessage: "burst", properties: {},
    };
    assert.strictEqual(throttle(record), true);
    assert.strictEqual(throttle(record), false);
    if (asynchronous) await reset();
    else resetSync();
    assert.deepStrictEqual(summaries, [1]);
    assert.deepStrictEqual(calls, ["summary", "close"]);
  }

  // Built-in sync resources and the TTL wrapper expose the same fallback key.
  const consoleSink = getConsoleSink({ nonBlocking: true });
  assert.strictEqual(typeof consoleSink[sync], "function");
  configureSync(config(withFilter(fingersCrossed(consoleSink), "info")));
  resetSync();
  const ttl = fingersCrossed(() => {}, {
    isolateByContext: { keys: ["requestId"], bufferTtlMs: 1000 },
  });
  assert.strictEqual(typeof ttl[sync], "function");
  configureSync(config(ttl));
  resetSync();

  for (const nonBlocking of [false, true]) {
    for (const closeStream of [false, true]) {
    let closes = 0;
    let releases = 0;
    const writer = {
      ready: Promise.resolve(), write: async () => {},
      close: async () => { closes++; },
      releaseLock: () => { releases++; },
    };
    const sink = getStreamSink({ getWriter: () => writer }, { nonBlocking, closeStream });
    assert.strictEqual(typeof sink[async], "function");
    assert.strictEqual(sync in sink, false);
    await configure(config(sink));
    disposeSync();
    assert.strictEqual(closes, 0);
    await reset();
    assert.strictEqual(closes, closeStream ? 1 : 0);
    assert.strictEqual(releases, 1);
    }
  }
  const asyncSink = fromAsyncSink(async () => {});
  assert.strictEqual(typeof asyncSink[async], "function");
  await asyncSink[async]();

  // Scoped configuration preserves cleanup ordering without native symbols.
  const { AsyncLocalStorage } = require("node:async_hooks");
  configureSync({ ...config(() => {}),
    contextLocalStorage: new AsyncLocalStorage() });
  for (const asynchronous of [false, true]) {
    const calls = [];
    const filter = () => true;
    filter[sync] = () => { calls.push("filter"); };
    const sink = () => {};
    sink[sync] = () => { calls.push("sink"); };
    if (asynchronous) await withConfig(config(sink, { filter }), async () => {});
    else withConfigSync(config(sink, { filter }), () => {});
    assert.deepStrictEqual(calls, ["filter", "sink"]);
  }
  let asyncCalls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const scopedAsync = () => {};
  scopedAsync[async] = async () => { await pending; asyncCalls++; };
  assert.throws(() => withConfigSync(config(scopedAsync), () => {}),
    /Async disposables cannot be used with withConfigSync/);
  assert.throws(() => withConfigSync(config(() => {}, {
    filter: Object.assign(() => true, { [async]: async () => {} }),
  }), () => {}), /Async disposables cannot be used with withConfigSync/);
  let settled = false;
  const scoped = withConfig(config(scopedAsync), async () => {})
    .then(() => { settled = true; });
  await Promise.resolve();
  assert.strictEqual(settled, false);
  assert.strictEqual(asyncCalls, 0);
  release();
  await scoped;
  assert.strictEqual(asyncCalls, 1);
  await reset();

  // Existing dual-hook behavior remains distinct, including through wrappers.
  for (const wrap of [sink => sink, sink => withFilter(sink, "info"),
    sink => fingersCrossed(sink)]) {
    const calls = [];
    const dual = () => {};
    dual[sync] = () => { calls.push("sync"); };
    dual[async] = async () => { calls.push("async"); };
    await configure(config(wrap(dual)));
    await reset();
    assert.deepStrictEqual(calls, ["sync", "async"]);
  }
  for (const name of workerData.missing) {
    assert.strictEqual(Symbol[name], undefined);
  }
  parentPort.postMessage("ok");
})().catch(error => { throw error; });
`;

// Package-local Deno tasks do not grant filesystem permissions.  Root tests
// grant read access and exercise the worker cases; Node and Bun always do.
const skip = typeof Deno !== "undefined" &&
  Deno.permissions.querySync({ name: "read" }).state !== "granted";

for (
  const missing of [
    ["dispose", "asyncDispose"],
    ["dispose"],
    ["asyncDispose"],
    [],
  ]
) {
  test(`disposal hooks with missing symbols: ${missing.join(", ") || "none"}`, {
    skip,
  }, async () => {
    if (skip) return;
    const originalDispose = Symbol.dispose;
    const originalAsyncDispose = Symbol.asyncDispose;
    const worker = new Worker(regression, {
      eval: true,
      workerData: {
        missing,
        configUrl: new URL("./config.ts", import.meta.url).href,
        filterUrl: new URL("./filter.ts", import.meta.url).href,
        sinkUrl: new URL("./sink.ts", import.meta.url).href,
      },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        worker.once("error", reject);
        worker.once("message", (message) => {
          try {
            assert.strictEqual(message, "ok");
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        worker.once("exit", (code) => {
          reject(new Error(`Worker exited before reporting success: ${code}`));
        });
      });
    } finally {
      await worker.terminate();
    }
    assert.strictEqual(Symbol.dispose, originalDispose);
    assert.strictEqual(Symbol.asyncDispose, originalAsyncDispose);
  });
}
