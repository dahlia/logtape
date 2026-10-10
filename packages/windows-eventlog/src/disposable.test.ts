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
  // Platform impersonation stays inside this worker; no native FFI is loaded.
  const { default: process } = await import("node:process");
  Object.defineProperty(process, "platform", { value: "win32" });
  if (typeof Deno !== "undefined") {
    Object.defineProperty(Deno, "build", { value: { ...Deno.build, os: "windows" } });
  }
  const { configure, configureSync, disposeSync, reset, resetSync } =
    await import(workerData.coreUrl);
  const { getWindowsEventLogSinkForFFI } = await import(workerData.sinkUrl);
  const sync = Symbol.dispose ?? Symbol.for("Symbol.dispose");
  const async = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
  const config = sink => ({
    sinks: { test: sink },
    loggers: [
      { category: "test", sinks: ["test"] },
      { category: ["logtape", "meta"], lowestLevel: "fatal", sinks: [] },
    ],
  });
  for (const mode of ["resetSync", "disposeSync", "reset"]) {
    let calls = 0;
    const writes = [];
    const ffi = {
      initialize(source) { assert.strictEqual(this, ffi); writes.push(source); },
      writeEvent(type, id, parameters) {
        assert.strictEqual(this, ffi);
        writes.push([type, id, parameters]);
      },
      dispose() { assert.strictEqual(this, ffi); calls++; },
    };
    const sink = getWindowsEventLogSinkForFFI(ffi, {
      sourceName: "test-source", eventIdMapping: { info: 1001 },
      formatter: () => "event message\n",
    });
    assert.strictEqual(typeof sink[sync], "function");
    assert.strictEqual(async in sink, false);
    assert.strictEqual(Object.hasOwn(sink, "undefined"), false);
    if (sync !== Symbol.for("Symbol.dispose")) {
      assert.strictEqual(Symbol.for("Symbol.dispose") in sink, false);
    }
    if (mode === "reset") await configure(config(sink));
    else configureSync(config(sink));
    sink({ category: ["test"], level: "info", timestamp: 0,
      message: ["message"], rawMessage: "message", properties: {} });
    assert.deepStrictEqual(writes, ["test-source", [4, 1001, ["event message"]]]);
    assert.strictEqual(calls, 0);
    if (mode === "reset") {
      await reset();
      await reset();
    } else {
      if (mode === "disposeSync") {
        disposeSync();
        disposeSync();
      }
      resetSync();
      resetSync();
    }
    assert.strictEqual(calls, 1);
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
  test(
    `Windows Event Log disposal hooks with missing symbols: ${
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
