import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";

// Import the implementation only after hiding the requested symbols in a fresh
// worker.  Native disposal symbols are non-configurable, so deleting them in
// this test's realm would neither simulate Safari nor isolate other tests.
const regression = String.raw`
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
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
  const file = await import(workerData.sinkUrl);
  const sync = Symbol.dispose ?? Symbol.for("Symbol.dispose");
  const async = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
  const config = sink => ({
    sinks: { test: sink },
    loggers: [
      { category: "test", sinks: ["test"] },
      { category: ["logtape", "meta"], lowestLevel: "fatal", sinks: [] },
    ],
  });
  const directory = fs.mkdtempSync(join(tmpdir(), "logtape-disposal-"));
  // Small records use a direct-write fast path; a long record exercises
  // buffered output that must survive until disposal.
  const expected = "buffered record ".repeat(20) + "\n";
  const options = {
    formatter: () => expected,
    bufferSize: 1024 * 1024,
    flushInterval: 0,
  };
  // Every registration site: three synchronous sinks, their non-blocking
  // variants, and the stream file sink.  Fixed names avoid rotation boundaries.
  const factories = [];
  for (const nonBlocking of [false, true]) {
    const mode = nonBlocking ? "async" : "sync";
    factories.push(
      [mode + "-file.log", nonBlocking, path =>
        file.getFileSink(path, { ...options, nonBlocking })],
      [mode + "-size.log", nonBlocking, path =>
        file.getRotatingFileSink(path, { ...options, nonBlocking })],
      [mode + "-time.log", nonBlocking, path =>
        file.getTimeRotatingFileSink({
          ...options, nonBlocking, directory,
          filename: () => mode + "-time.log",
        })],
    );
  }
  factories.push(["stream.log", true, path =>
    file.getStreamFileSink(path, options)]);
  try {
    for (const [name, isAsync, create] of factories) {
      const path = join(directory, name);
      const sink = create(path);
      const key = isAsync ? async : sync;
      const otherKey = isAsync ? sync : async;
      const cleanup = sink[key];
      let cleanups = 0;
      let release;
      let entered;
      const started = new Promise(resolve => { entered = resolve; });
      const completion = new Promise(resolve => { release = resolve; });
      if (isAsync) {
        sink[key] = async () => {
          cleanups++;
          entered();
          await completion;
          await cleanup();
        };
      } else {
        sink[key] = () => { cleanups++; cleanup(); };
      }
      try {
        assert.strictEqual(typeof cleanup, "function", name);
        assert.strictEqual(otherKey in sink, false, name);
        assert.strictEqual(Object.hasOwn(sink, "undefined"), false, name);
        if (isAsync) {
          assert.throws(() => configureSync(config(sink)),
            /Async disposables cannot be used with configureSync/);
          await configure(config(sink));
          getLogger("test").info("queued");
          resetSync();
          assert.strictEqual(cleanups, 0, name);
          let settled = false;
          const resetting = reset().then(() => { settled = true; });
          await started;
          await delay(0);
          assert.strictEqual(cleanups, 1, name);
          assert.strictEqual(settled, false, name);
          release();
          await resetting;
          assert.strictEqual(settled, true, name);
        } else {
          configureSync(config(sink));
          getLogger("test").info("queued");
          assert.strictEqual(fs.readFileSync(path, "utf8"), "", name);
          resetSync();
        }
        assert.strictEqual(cleanups, 1, name);
        assert.strictEqual(fs.readFileSync(path, "utf8"),
          expected, name);
        await reset();
        resetSync();
        assert.strictEqual(cleanups, 1, name);
      } finally {
        release();
        await reset();
        // Close a sink even when an assertion failed before registration.
        if (cleanups === 0 && typeof cleanup === "function") await cleanup();
      }
    }
  } finally {
    await reset();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  for (const name of workerData.missing) {
    assert.strictEqual(Symbol[name], undefined);
  }
  parentPort.postMessage("ok");
})().catch(error => { throw error; });
`;

// Workers import source modules and create temporary log files.  Skip only
// restricted Deno invocations; root and package test tasks grant both accesses.
const skip = typeof Deno !== "undefined" &&
  (Deno.permissions.querySync({ name: "read" }).state !== "granted" ||
    Deno.permissions.querySync({ name: "write" }).state !== "granted");

for (
  const missing of [
    ["dispose", "asyncDispose"],
    ["dispose"],
    ["asyncDispose"],
    [],
  ]
) {
  test(
    `File disposal hooks with missing symbols: ${missing.join(", ") || "none"}`,
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
          sinkUrl: import.meta.resolve("@logtape/file"),
        },
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error("File disposal worker timed out"));
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
