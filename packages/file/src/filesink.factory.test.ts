import assert from "node:assert/strict";
import test from "node:test";
import { isDeno } from "@david/which-runtime";
import type { Sink } from "@logtape/logtape";
import type {
  FileSinkDependencies,
  FileSinkFactoryResult,
} from "./filesink.factory.ts";
import { createFileSinks as createDenoFileSinks } from "./filesink.factory.deno.ts";
import { createFileSinks as createNodeFileSinks } from "./filesink.factory.node.ts";

function checkFactory<TFile>(
  create: (dependencies: FileSinkDependencies) => FileSinkFactoryResult<TFile>,
): void {
  const calls: { kind: string; path?: string; options: object }[] = [];
  const sink: Sink & Disposable & AsyncDisposable = Object.assign(() => {}, {
    [Symbol.dispose]() {},
    [Symbol.asyncDispose]() {
      return Promise.resolve();
    },
  });
  const dependencies: FileSinkDependencies = {
    getBaseFileSink(path, options) {
      calls.push({ kind: "file", path, options });
      return sink;
    },
    getBaseRotatingFileSink(path, options) {
      calls.push({ kind: "rotating", path, options });
      return sink;
    },
    getBaseTimeRotatingFileSink(options) {
      calls.push({ kind: "time", options });
      return sink;
    },
    join: (...paths) => paths.join("/injected/"),
  };
  const result = create(dependencies);
  assert.deepStrictEqual(calls, []);
  for (const nonBlocking of [false, true]) {
    const options = { nonBlocking, bufferSize: 123, flushInterval: 0 };
    assert.strictEqual(result.getFileSink("file.log", options), sink);
    assert.strictEqual(
      result.getRotatingFileSink("rotating.log", options),
      sink,
    );
    assert.strictEqual(
      result.getTimeRotatingFileSink({ ...options, directory: "logs" }),
      sink,
    );
    const driver = nonBlocking ? result.asyncDriver : result.driver;
    const timeDriver = nonBlocking ? result.asyncTimeDriver : result.timeDriver;
    assert.deepStrictEqual(calls.splice(0), [
      { kind: "file", path: "file.log", options: { ...options, ...driver } },
      {
        kind: "rotating",
        path: "rotating.log",
        options: { ...options, ...driver },
      },
      {
        kind: "time",
        options: { ...options, directory: "logs", ...timeDriver },
      },
    ]);
  }
  if (isDeno && create === createDenoFileSinks) {
    assert.strictEqual(result.timeDriver.joinPath("a", "b"), "a/injected/b");
    assert.strictEqual(
      result.asyncTimeDriver.joinPath("a", "b"),
      "a/injected/b",
    );
  }
}

test("Node factory uses injected sink implementations", () => {
  checkFactory(createNodeFileSinks);
});

test("Deno factory uses injected sink implementations and path joining", {
  skip: !isDeno,
}, () => {
  if (!isDeno) return;
  checkFactory(createDenoFileSinks);
});
