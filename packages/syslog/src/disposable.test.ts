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
  const { configure, configureSync, disposeSync, reset, resetSync } =
    await import(workerData.coreUrl);
  const { getSyslogSink, DenoUdpSyslogConnection, NodeUdpSyslogConnection } =
    await import(workerData.sinkUrl);
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
  let release;
  let entered;
  let message;
  const started = new Promise(resolve => { entered = resolve; });
  const completion = new Promise(resolve => { release = resolve; });
  // Isolated connection doubles exercise the actual factory without requiring
  // a Syslog server, while keeping pending-send ordering deterministic.
  for (const Connection of [DenoUdpSyslogConnection, NodeUdpSyslogConnection]) {
    Connection.prototype.connect = () => {};
    Connection.prototype.send = async value => {
      message = value;
      entered();
      await completion;
    };
    Connection.prototype.close = () => { calls++; };
  }
  const createSink = () => getSyslogSink({
    hostname: "localhost", syslogHostname: "test", processId: "1",
  });
  const rejected = createSink();
  assert.strictEqual(typeof rejected[async], "function");
  assert.strictEqual(sync in rejected, false);
  assert.strictEqual(Object.hasOwn(rejected, "undefined"), false);
  assert.throws(() => configureSync(config(rejected)),
    /Async disposables cannot be used with configureSync/);
  await reset();
  assert.strictEqual(calls, 0);

  const sink = createSink();
  await configure(config(sink));
  sink({ category: ["test"], level: "info", timestamp: 0,
    message: ["pending syslog record"], rawMessage: "pending syslog record",
    properties: {} });
  await started;
  assert.ok(message.includes("pending syslog record"));
  disposeSync();
  resetSync();
  assert.strictEqual(calls, 0);
  let settled = false;
  const resetting = reset().then(() => { settled = true; });
  await delay(0);
  assert.strictEqual(settled, false);
  assert.strictEqual(calls, 0);
  release();
  await resetting;
  assert.strictEqual(settled, true);
  assert.strictEqual(calls, 1);
  await reset();
  assert.strictEqual(calls, 1);
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
    `Syslog disposal hooks with missing symbols: ${
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
          sinkUrl: new URL("./syslog.ts", import.meta.url).href,
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
            reject(
              new Error(`Worker exited before reporting success: ${code}`),
            );
          });
        });
      } finally {
        await worker.terminate();
      }
      assert.strictEqual(Symbol.dispose, originalDispose);
      assert.strictEqual(Symbol.asyncDispose, originalAsyncDispose);
    },
  );
}
