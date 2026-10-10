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
  const { configure, configureSync, reset, resetSync } =
    await import(workerData.configUrl);
  const { redactByField } = await import(workerData.fieldUrl);
  const sync = Symbol.dispose ?? Symbol.for("Symbol.dispose");
  const async = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
  const config = sink => ({
    sinks: { test: sink },
    loggers: [
      { category: "test", sinks: ["test"] },
      { category: ["logtape", "meta"], lowestLevel: "fatal", sinks: [] },
    ],
  });
  const ordinary = () => {};
  ordinary.undefined = () => { throw new Error("not a disposal hook"); };
  const plain = redactByField(ordinary);
  assert.strictEqual("undefined" in plain, false);
  assert.strictEqual(sync in plain, false);
  assert.strictEqual(async in plain, false);
  configureSync(config(plain));
  resetSync();

  let syncCalls = 0;
  const sink = () => {};
  sink[sync] = () => { syncCalls++; };
  const wrapped = redactByField(sink);
  assert.strictEqual(wrapped[sync], sink[sync]);
  assert.strictEqual(async in wrapped, false);
  assert.strictEqual("undefined" in wrapped, false);
  configureSync(config(wrapped));
  resetSync();
  assert.strictEqual(syncCalls, 1);
  await configure(config(wrapped));
  await reset();
  assert.strictEqual(syncCalls, 2);

  let asyncCalls = 0;
  const asyncSink = () => {};
  asyncSink[async] = async () => {
    await Promise.resolve();
    asyncCalls++;
  };
  const asyncWrapped = redactByField(asyncSink);
  assert.strictEqual(asyncWrapped[async], asyncSink[async]);
  assert.strictEqual(sync in asyncWrapped, false);
  assert.strictEqual("undefined" in asyncWrapped, false);
  assert.throws(() => configureSync(config(asyncWrapped)),
    /Async disposables cannot be used with configureSync/);
  await reset();
  assert.strictEqual(asyncCalls, 0);
  await configure(config(asyncWrapped));
  resetSync();
  assert.strictEqual(asyncCalls, 0);
  await reset();
  assert.strictEqual(asyncCalls, 1);

  const calls = [];
  const dual = () => {};
  dual[sync] = () => { calls.push("sync"); };
  dual[async] = async () => { calls.push("async"); };
  const dualWrapped = redactByField(dual);
  assert.strictEqual(dualWrapped[sync], dual[sync]);
  assert.strictEqual(dualWrapped[async], dual[async]);
  await configure(config(dualWrapped));
  await reset();
  assert.deepStrictEqual(calls, ["sync", "async"]);
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
    `redactByField disposal hooks with missing symbols: ${
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
          configUrl:
            new URL("../../logtape/src/config.ts", import.meta.url).href,
          fieldUrl: new URL("./field.ts", import.meta.url).href,
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
