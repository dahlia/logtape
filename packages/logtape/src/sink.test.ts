import { suite } from "@alinea/suite";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertThrows } from "@std/assert/throws";
import { delay } from "@std/async/delay";
import makeConsoleMock from "consolemock";
import { debug, error, fatal, info, trace, warning } from "./fixtures.ts";
import { defaultTextFormatter } from "./formatter.ts";
import type { LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";
import {
  type AsyncSink,
  fromAsyncSink,
  getConsoleSink,
  getStreamSink,
  type Sink,
  withFilter,
} from "./sink.ts";

const test = suite(import.meta);

test("withFilter()", () => {
  const buffer: LogRecord[] = [];
  const sink = withFilter(buffer.push.bind(buffer), "warning");
  sink(trace);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  assertEquals(buffer, [warning, error, fatal]);
});

interface ConsoleMock extends Console {
  history(): unknown[];
}

test("getStreamSink()", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
  );
  sink(trace);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  await sink[Symbol.asyncDispose]();
  assertEquals(
    buffer,
    `\
2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getStreamSink() with nonBlocking - simple boolean", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
    { nonBlocking: true },
  );

  // Check that it returns AsyncDisposable
  assertInstanceOf(sink, Function);
  assert(Symbol.asyncDispose in sink);

  // Add records - they should not be written immediately
  sink(trace);
  sink(debug);
  assertEquals(buffer, ""); // Not written yet

  // Wait for flush interval (default 100ms)
  await delay(150);
  assertEquals(
    buffer,
    `2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
`,
  );

  await sink[Symbol.asyncDispose]();
});

test("getStreamSink() with nonBlocking - custom buffer config", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
    {
      nonBlocking: {
        bufferSize: 2,
        flushInterval: 50,
      },
    },
  );

  // Add records up to buffer size
  sink(trace);
  assertEquals(buffer, ""); // Not flushed yet

  sink(debug); // This should trigger immediate flush (buffer size = 2)
  await delay(10); // Small delay for async flush
  assertEquals(
    buffer,
    `2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
`,
  );

  // Add more records
  const prevLength = buffer.length;
  sink(info);
  assertEquals(buffer.length, prevLength); // Not flushed yet

  // Wait for flush interval
  await delay(60);
  assertEquals(
    buffer.substring(prevLength),
    `2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  await sink[Symbol.asyncDispose]();
});

test("getStreamSink() with nonBlocking - no operations after dispose", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
    { nonBlocking: true },
  );

  // Dispose immediately
  await sink[Symbol.asyncDispose]();

  // Try to add records after dispose
  sink(trace);
  sink(debug);

  // No records should be written
  assertEquals(buffer, "");
});

test("getStreamSink() with nonBlocking - error handling", async () => {
  const sink = getStreamSink(
    new WritableStream({
      write() {
        return Promise.reject(new Error("Write error"));
      },
    }),
    { nonBlocking: true },
  );

  // Should not throw when adding records
  sink(trace);
  sink(info);
  sink(error);

  // Wait for flush - errors should be silently ignored
  await delay(150);

  // Dispose - should not throw
  await sink[Symbol.asyncDispose]();
});

test("getStreamSink() with nonBlocking - flush on dispose", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
    {
      nonBlocking: {
        bufferSize: 100,
        flushInterval: 5000, // Very long interval
      },
    },
  );

  // Add records
  sink(trace);
  sink(debug);
  sink(info);
  assertEquals(buffer, ""); // Not flushed yet due to large buffer and long interval

  // Dispose should flush all remaining records
  await sink[Symbol.asyncDispose]();
  assertEquals(
    buffer,
    `2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getStreamSink() with nonBlocking - buffer overflow protection", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  let recordsReceived = 0;
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        const text = decoder.decode(chunk);
        buffer += text;
        // Count how many log records we actually receive
        recordsReceived += text.split("\n").filter((line) =>
          line.trim() !== ""
        ).length;
        return Promise.resolve();
      },
    }),
    {
      nonBlocking: {
        bufferSize: 3,
        flushInterval: 50, // Short interval to ensure flushes happen
      },
    },
  );

  // Add many more records than maxBufferSize (6) very rapidly
  // This should trigger multiple flushes and potentially overflow protection
  for (let i = 0; i < 20; i++) {
    sink(trace);
  }

  // Wait for all flushes to complete
  await delay(200);

  // Force final flush
  await sink[Symbol.asyncDispose]();

  // Due to overflow protection, we should receive fewer than 20 records
  // The exact number depends on timing, but some should be dropped
  assert(
    recordsReceived < 20,
    `Expected < 20 records due to potential overflow, got ${recordsReceived}`,
  );
  assert(recordsReceived > 0, "Expected some records to be logged");
});

test("getStreamSink() with nonBlocking - high volume non-blocking behavior", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
    {
      nonBlocking: {
        bufferSize: 3,
        flushInterval: 50,
      },
    },
  );

  // Simulate rapid logging - this should not block
  const startTime = performance.now();
  for (let i = 0; i < 100; i++) {
    sink(trace);
  }
  const endTime = performance.now();

  // Adding logs should be very fast (non-blocking)
  const duration = endTime - startTime;
  assert(
    duration < 100,
    `Adding 100 logs took ${duration}ms, should be much faster`,
  );

  // Wait for flushes to complete
  await delay(200);

  // Should have logged some records
  assert(buffer.length > 0, "Expected some records to be logged");

  await sink[Symbol.asyncDispose]();
});

test("getConsoleSink()", () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({ console: mock });
  sink(trace);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  assertEquals(mock.history(), [
    {
      DEBUG: [
        "%c22:13:20.000 %cTRC%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: gray; color: white;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      DEBUG: [
        "%c22:13:20.000 %cDBG%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: gray; color: white;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      INFO: [
        "%c22:13:20.000 %cINF%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: white; color: black;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      WARN: [
        "%c22:13:20.000 %cWRN%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: orange; color: black;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      ERROR: [
        "%c22:13:20.000 %cERR%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: red; color: white;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      ERROR: [
        "%c22:13:20.000 %cFTL%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: maroon; color: white;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
  ]);

  assertThrows(
    () => sink({ ...info, level: "invalid" as LogLevel }),
    TypeError,
    "Invalid log level: invalid.",
  );

  // @ts-ignore: consolemock is not typed
  const mock2: ConsoleMock = makeConsoleMock();
  const sink2 = getConsoleSink({
    console: mock2,
    formatter: defaultTextFormatter,
  });
  sink2(trace);
  sink2(debug);
  sink2(info);
  sink2(warning);
  sink2(error);
  sink2(fatal);
  assertEquals(mock2.history(), [
    {
      DEBUG: [
        "2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      DEBUG: [
        "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      INFO: [
        "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      WARN: [
        "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      ERROR: [
        "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      ERROR: [
        "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!",
      ],
    },
  ]);

  // @ts-ignore: consolemock is not typed
  const mock3: ConsoleMock = makeConsoleMock();
  const sink3 = getConsoleSink({
    console: mock3,
    levelMap: {
      trace: "log",
      debug: "log",
      info: "log",
      warning: "log",
      error: "log",
      fatal: "log",
    },
    formatter: defaultTextFormatter,
  });
  sink3(trace);
  sink3(debug);
  sink3(info);
  sink3(warning);
  sink3(error);
  sink3(fatal);
  assertEquals(mock3.history(), [
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!",
      ],
    },
  ]);
});

test("getConsoleSink() with nonBlocking - simple boolean", async () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({ console: mock, nonBlocking: true });

  // Check that it returns a Disposable
  assertInstanceOf(sink, Function);
  assert(Symbol.dispose in sink);

  // Add records - they should not be logged immediately
  sink(trace);
  sink(debug);
  assertEquals(mock.history().length, 0); // Not logged yet

  // Wait for flush interval (default 100ms)
  await delay(150);
  assertEquals(mock.history().length, 2); // Now they should be logged

  // Dispose the sink
  (sink as Sink & Disposable)[Symbol.dispose]();
});

test("getConsoleSink() with nonBlocking - custom buffer config", async () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({
    console: mock,
    nonBlocking: {
      bufferSize: 3,
      flushInterval: 50,
    },
  });

  // Add records up to buffer size
  sink(trace);
  sink(debug);
  assertEquals(mock.history().length, 0); // Not flushed yet

  sink(info); // This should trigger scheduled flush (buffer size = 3)
  await delay(10); // Wait for scheduled flush to execute
  assertEquals(mock.history().length, 3); // Flushed due to buffer size

  // Add more records
  sink(warning);
  assertEquals(mock.history().length, 3); // Not flushed yet

  // Wait for flush interval
  await delay(60);
  assertEquals(mock.history().length, 4); // Flushed due to interval

  // Dispose and check remaining records are flushed
  sink(error);
  sink(fatal);
  (sink as Sink & Disposable)[Symbol.dispose]();
  assertEquals(mock.history().length, 6); // All records flushed on dispose
});

test("getConsoleSink() with nonBlocking - no operations after dispose", () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({ console: mock, nonBlocking: true });

  // Dispose immediately
  (sink as Sink & Disposable)[Symbol.dispose]();

  // Try to add records after dispose
  sink(trace);
  sink(debug);

  // No records should be logged
  assertEquals(mock.history().length, 0);
});

test("getConsoleSink() with nonBlocking - error handling", async () => {
  const errorConsole = {
    ...console,
    debug: () => {
      throw new Error("Console error");
    },
    info: () => {
      throw new Error("Console error");
    },
    warn: () => {
      throw new Error("Console error");
    },
    error: () => {
      throw new Error("Console error");
    },
  };

  const sink = getConsoleSink({
    console: errorConsole,
    nonBlocking: true,
  });

  // Should not throw when adding records
  sink(trace);
  sink(info);
  sink(error);

  // Wait for flush - errors should be silently ignored
  await delay(150);

  // Dispose - should not throw
  (sink as Sink & Disposable)[Symbol.dispose]();
});

test("getConsoleSink() with nonBlocking - buffer overflow protection", async () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({
    console: mock,
    nonBlocking: {
      bufferSize: 5,
      flushInterval: 1000, // Long interval to prevent automatic flushing
    },
  });

  // Add more records than 2x buffer size (which should trigger overflow protection)
  for (let i = 0; i < 12; i++) {
    sink(trace);
  }

  // Should have dropped oldest records, keeping buffer size manageable
  // Wait a bit for any scheduled flushes
  await delay(10);

  // Force flush by disposing
  (sink as Sink & Disposable)[Symbol.dispose]();

  // Should have logged records, but not more than maxBufferSize (10)
  const historyLength = mock.history().length;
  assert(historyLength <= 10, `Expected <= 10 records, got ${historyLength}`);
  assert(historyLength > 0, "Expected some records to be logged");
});

test("getConsoleSink() with nonBlocking - high volume non-blocking behavior", async () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({
    console: mock,
    nonBlocking: {
      bufferSize: 3,
      flushInterval: 50,
    },
  });

  // Simulate rapid logging - this should not block
  const startTime = performance.now();
  for (let i = 0; i < 100; i++) {
    sink(trace);
  }
  const endTime = performance.now();

  // Adding logs should be very fast (non-blocking)
  const duration = endTime - startTime;
  assert(
    duration < 100,
    `Adding 100 logs took ${duration}ms, should be much faster`,
  );

  // Wait for flushes to complete
  await delay(200);

  // Should have logged some records
  assert(mock.history().length > 0, "Expected some records to be logged");

  (sink as Sink & Disposable)[Symbol.dispose]();
});

test("fromAsyncSink() - basic functionality", async () => {
  const buffer: LogRecord[] = [];
  const asyncSink: AsyncSink = async (record) => {
    await delay(10);
    buffer.push(record);
  };

  const sink = fromAsyncSink(asyncSink);

  sink(trace);
  sink(debug);
  sink(info);

  // Records should not be in buffer immediately
  assertEquals(buffer.length, 0);

  // Wait for async operations to complete
  await sink[Symbol.asyncDispose]();

  // All records should be in buffer in order
  assertEquals(buffer.length, 3);
  assertEquals(buffer, [trace, debug, info]);
});

test("fromAsyncSink() - promise chaining preserves order", async () => {
  const buffer: LogRecord[] = [];
  const delays = [50, 10, 30]; // Different delays for each call
  let callIndex = 0;

  const asyncSink: AsyncSink = async (record) => {
    const delayTime = delays[callIndex % delays.length];
    callIndex++;
    await delay(delayTime);
    buffer.push(record);
  };

  const sink = fromAsyncSink(asyncSink);

  sink(trace);
  sink(debug);
  sink(info);

  await sink[Symbol.asyncDispose]();

  // Despite different delays, order should be preserved
  assertEquals(buffer.length, 3);
  assertEquals(buffer, [trace, debug, info]);
});

test("fromAsyncSink() - error handling", async () => {
  const buffer: LogRecord[] = [];
  let errorCount = 0;

  const asyncSink: AsyncSink = async (record) => {
    if (record.level === "error") {
      errorCount++;
      throw new Error("Async sink error");
    }
    await Promise.resolve(); // Ensure it's async
    buffer.push(record);
  };

  const sink = fromAsyncSink(asyncSink);

  sink(trace);
  sink(error); // This will throw in async sink
  sink(info);

  await sink[Symbol.asyncDispose]();

  // Error should be caught and not break the chain
  assertEquals(errorCount, 1);
  assertEquals(buffer.length, 2);
  assertEquals(buffer, [trace, info]);
});

test("fromAsyncSink() - multiple dispose calls", async () => {
  const buffer: LogRecord[] = [];
  const asyncSink: AsyncSink = async (record) => {
    await delay(10);
    buffer.push(record);
  };

  const sink = fromAsyncSink(asyncSink);

  sink(trace);
  sink(debug);

  // First dispose
  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2);

  // Second dispose should be safe
  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2);

  // Third dispose should be safe
  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2);
});

test("fromAsyncSink() - concurrent calls", async () => {
  const buffer: LogRecord[] = [];
  let concurrentCalls = 0;
  let maxConcurrentCalls = 0;

  const asyncSink: AsyncSink = async (record) => {
    concurrentCalls++;
    maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
    await delay(20);
    buffer.push(record);
    concurrentCalls--;
  };

  const sink = fromAsyncSink(asyncSink);

  // Fire multiple calls rapidly
  for (let i = 0; i < 5; i++) {
    sink(trace);
  }

  await sink[Symbol.asyncDispose]();

  // Due to promise chaining, max concurrent calls should be 1
  assertEquals(maxConcurrentCalls, 1);
  assertEquals(buffer.length, 5);
});

test("fromAsyncSink() - works with synchronous exceptions", async () => {
  const buffer: LogRecord[] = [];
  let errorCount = 0;

  const asyncSink: AsyncSink = async (record) => {
    if (record.level === "fatal") {
      errorCount++;
      // Synchronous throw before any await
      throw new Error("Sync error in async sink");
    }
    await delay(10);
    buffer.push(record);
  };

  const sink = fromAsyncSink(asyncSink);

  sink(trace);
  sink(fatal); // This will throw synchronously in async sink
  sink(info);

  await sink[Symbol.asyncDispose]();

  // Error should still be caught
  assertEquals(errorCount, 1);
  assertEquals(buffer.length, 2);
  assertEquals(buffer, [trace, info]);
});

test("fromAsyncSink() - very long async operations", async () => {
  const buffer: LogRecord[] = [];
  const asyncSink: AsyncSink = async (record) => {
    await delay(100); // Longer delay
    buffer.push(record);
  };

  const sink = fromAsyncSink(asyncSink);

  sink(trace);
  sink(debug);

  // Don't wait, just dispose immediately
  const disposePromise = sink[Symbol.asyncDispose]();

  // Buffer should still be empty
  assertEquals(buffer.length, 0);

  // Wait for dispose to complete
  await disposePromise;

  // Now all records should be processed
  assertEquals(buffer.length, 2);
  assertEquals(buffer, [trace, debug]);
});

test("fromAsyncSink() - empty async sink", async () => {
  const asyncSink: AsyncSink = async () => {
    // Do nothing
  };

  const sink = fromAsyncSink(asyncSink);

  // Should not throw
  sink(trace);
  sink(debug);

  await sink[Symbol.asyncDispose]();

  // Test passes if no errors thrown
  assert(true);
});
