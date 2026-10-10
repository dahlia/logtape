import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";

// Import the implementation only after hiding the requested symbols in a fresh
// worker.  Native disposal symbols are non-configurable, so deleting them in
// this test's realm would neither simulate Safari nor isolate other tests.
const regression = String.raw`
const assert = require("node:assert/strict");
const { parentPort, workerData } = require("node:worker_threads");
const { setTimeout: delay } = require("node:timers/promises");
const nativeSymbol = Symbol;
function legacySymbol(description) { return nativeSymbol(description); }
Object.setPrototypeOf(legacySymbol, nativeSymbol);
legacySymbol.prototype = nativeSymbol.prototype;
for (const name of workerData.missing) {
  Object.defineProperty(legacySymbol, name, { value: undefined });
}
globalThis.Symbol = legacySymbol;

(async () => {
  const { configure, configureSync, getLogger, reset, resetSync } =
    await import(workerData.coreUrl);
  const { getCloudWatchLogsSink } = await import(workerData.sinkUrl);
  const sync = Symbol.dispose ?? Symbol.for("Symbol.dispose");
  const async = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
  const config = sink => ({
    sinks: { test: sink },
    loggers: [
      { category: "test", sinks: ["test"] },
      { category: ["logtape", "meta"], lowestLevel: "fatal", sinks: [] },
    ],
  });
  let calls = 0;
  let destroyed = 0;
  let release;
  let entered;
  const commands = [];
  const started = new Promise(resolve => { entered = resolve; });
  const completion = new Promise(resolve => { release = resolve; });
  const client = {
    async send(command) {
      commands.push(command);
      calls++;
      entered();
      await completion;
      return {};
    },
    destroy() { destroyed++; },
  };
  const options = {
    client,
    logGroupName: "test-group",
    logStreamName: "test-stream",
    batchSize: 100,
    flushInterval: 0,
    maxRetries: 0,
  };
  function checkHook(sink) {
    assert.strictEqual(typeof sink[async], "function");
    assert.strictEqual(sync in sink, false);
    assert.strictEqual(Object.hasOwn(sink, "undefined"), false);
  }
  const rejected = getCloudWatchLogsSink(options);
  checkHook(rejected);
  assert.throws(() => configureSync(config(rejected)),
    /Async disposables cannot be used with configureSync/);
  await reset();
  assert.strictEqual(calls, 0);

  const sink = getCloudWatchLogsSink(options);
  checkHook(sink);
  // Count hook invocations as well as sends: a second cleanup with an empty
  // buffer would otherwise be invisible to the mocked client.
  const cleanup = sink[async];
  let cleanups = 0;
  sink[async] = async () => { cleanups++; await cleanup(); };
  await configure(config(sink));
  getLogger("test").info("buffered {value}", { value: 42 });
  assert.strictEqual(calls, 0);
  resetSync();
  assert.strictEqual(calls, 0);
  assert.strictEqual(cleanups, 0);
  let settled = false;
  const resetting = reset().then(() => { settled = true; });
  await started;
  await delay(0);
  assert.strictEqual(calls, 1);
  assert.strictEqual(cleanups, 1);
  assert.strictEqual(settled, false);
  release();
  await resetting;
  assert.strictEqual(settled, true);
  const input = commands[0].input;
  assert.strictEqual(input.logGroupName, "test-group");
  assert.strictEqual(input.logStreamName, "test-stream");
  assert.strictEqual(input.logEvents.length, 1);
  assert.strictEqual(input.logEvents[0].message, "buffered 42");
  assert.strictEqual(typeof input.logEvents[0].timestamp, "number");
  await reset();
  assert.strictEqual(calls, 1);
  assert.strictEqual(cleanups, 1);
  assert.strictEqual(destroyed, 0);
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
  test(
    `CloudWatch disposal hooks with missing symbols: ${
      missing.join(", ") || "none"
    }`,
    {
      skip,
    },
    async () => {
      if (skip) return;
      const originalDispose = Symbol.dispose;
      const originalAsyncDispose = Symbol.asyncDispose;
      const worker = new Worker(regression, {
        eval: true,
        workerData: {
          missing,
          coreUrl: import.meta.resolve("@logtape/logtape"),
          sinkUrl: new URL("./mod.ts", import.meta.url).href,
        },
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error("CloudWatch disposal worker timed out"));
          }, 10000);
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
            reject(
              new Error(`Worker exited before reporting success: ${code}`),
            );
          });
        });
      } finally {
        clearTimeout(timeout);
        await worker.terminate();
      }
      assert.strictEqual(Symbol.dispose, originalDispose);
      assert.strictEqual(Symbol.asyncDispose, originalAsyncDispose);
    },
  );
}
