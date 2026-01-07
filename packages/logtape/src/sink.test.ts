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
  fingersCrossed,
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

test("fingersCrossed() - basic functionality", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // Add debug and info logs - should be buffered
  sink(trace);
  sink(debug);
  sink(info);
  assertEquals(buffer.length, 0); // Not flushed yet

  // Add warning - still buffered (default trigger is error)
  sink(warning);
  assertEquals(buffer.length, 0);

  // Add error - should trigger flush
  sink(error);
  assertEquals(buffer, [trace, debug, info, warning, error]);

  // After trigger, logs pass through directly
  sink(fatal);
  assertEquals(buffer, [trace, debug, info, warning, error, fatal]);
});

test("fingersCrossed() - custom trigger level", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    triggerLevel: "warning",
  });

  // Add logs below warning
  sink(trace);
  sink(debug);
  sink(info);
  assertEquals(buffer.length, 0);

  // Warning should trigger flush
  sink(warning);
  assertEquals(buffer, [trace, debug, info, warning]);

  // Subsequent logs pass through
  sink(error);
  assertEquals(buffer, [trace, debug, info, warning, error]);
});

test("fingersCrossed() - buffer overflow protection", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: 3,
  });

  // Add more logs than buffer size
  sink(trace);
  sink(debug);
  sink(info);
  sink(warning); // Should drop trace
  assertEquals(buffer.length, 0); // Still buffered

  // Trigger flush
  sink(error);
  // Should only have last 3 records + error
  assertEquals(buffer, [debug, info, warning, error]);
});

test("fingersCrossed() - multiple trigger events", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // First batch
  sink(debug);
  sink(info);
  sink(error); // Trigger
  assertEquals(buffer, [debug, info, error]);

  // After trigger, everything passes through
  sink(debug);
  assertEquals(buffer, [debug, info, error, debug]);

  sink(error); // Another error
  assertEquals(buffer, [debug, info, error, debug, error]);
});

test("fingersCrossed() - trigger includes fatal", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    triggerLevel: "error",
  });

  sink(debug);
  sink(info);
  assertEquals(buffer.length, 0);

  // Fatal should also trigger (since it's >= error)
  sink(fatal);
  assertEquals(buffer, [debug, info, fatal]);
});

test("fingersCrossed() - category isolation descendant mode", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "descendant",
  });

  // Create test records with different categories
  const appDebug: LogRecord = {
    ...debug,
    category: ["app"],
  };
  const appModuleDebug: LogRecord = {
    ...debug,
    category: ["app", "module"],
  };
  const appModuleSubDebug: LogRecord = {
    ...debug,
    category: ["app", "module", "sub"],
  };
  const otherDebug: LogRecord = {
    ...debug,
    category: ["other"],
  };
  const appError: LogRecord = {
    ...error,
    category: ["app"],
  };

  // Buffer logs in different categories
  sink(appDebug);
  sink(appModuleDebug);
  sink(appModuleSubDebug);
  sink(otherDebug);
  assertEquals(buffer.length, 0);

  // Trigger in parent category
  sink(appError);

  // Should flush parent and all descendants, but not other
  assertEquals(buffer.length, 4); // app, app.module, app.module.sub, and trigger
  assert(buffer.includes(appDebug));
  assert(buffer.includes(appModuleDebug));
  assert(buffer.includes(appModuleSubDebug));
  assert(buffer.includes(appError));
  assert(!buffer.includes(otherDebug));
});

test("fingersCrossed() - category isolation ancestor mode", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "ancestor",
  });

  // Create test records
  const appDebug: LogRecord = {
    ...debug,
    category: ["app"],
  };
  const appModuleDebug: LogRecord = {
    ...debug,
    category: ["app", "module"],
  };
  const appModuleSubDebug: LogRecord = {
    ...debug,
    category: ["app", "module", "sub"],
  };
  const appModuleSubError: LogRecord = {
    ...error,
    category: ["app", "module", "sub"],
  };

  // Buffer logs
  sink(appDebug);
  sink(appModuleDebug);
  sink(appModuleSubDebug);
  assertEquals(buffer.length, 0);

  // Trigger in child category
  sink(appModuleSubError);

  // Should flush child and all ancestors
  assertEquals(buffer.length, 4);
  assert(buffer.includes(appDebug));
  assert(buffer.includes(appModuleDebug));
  assert(buffer.includes(appModuleSubDebug));
  assert(buffer.includes(appModuleSubError));
});

test("fingersCrossed() - category isolation both mode", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  // Create test records
  const rootDebug: LogRecord = {
    ...debug,
    category: ["app"],
  };
  const parentDebug: LogRecord = {
    ...debug,
    category: ["app", "parent"],
  };
  const siblingDebug: LogRecord = {
    ...debug,
    category: ["app", "sibling"],
  };
  const childDebug: LogRecord = {
    ...debug,
    category: ["app", "parent", "child"],
  };
  const unrelatedDebug: LogRecord = {
    ...debug,
    category: ["other"],
  };
  const parentError: LogRecord = {
    ...error,
    category: ["app", "parent"],
  };

  // Buffer logs
  sink(rootDebug);
  sink(parentDebug);
  sink(siblingDebug);
  sink(childDebug);
  sink(unrelatedDebug);
  assertEquals(buffer.length, 0);

  // Trigger in middle category
  sink(parentError);

  // Should flush ancestors and descendants, but not siblings or unrelated
  assertEquals(buffer.length, 4);
  assert(buffer.includes(rootDebug)); // Ancestor
  assert(buffer.includes(parentDebug)); // Same
  assert(buffer.includes(childDebug)); // Descendant
  assert(buffer.includes(parentError)); // Trigger
  assert(!buffer.includes(siblingDebug)); // Sibling
  assert(!buffer.includes(unrelatedDebug)); // Unrelated
});

test("fingersCrossed() - custom category matcher", () => {
  const buffer: LogRecord[] = [];

  // Custom matcher: only flush if categories share first element
  const customMatcher = (
    trigger: readonly string[],
    buffered: readonly string[],
  ): boolean => {
    return trigger[0] === buffered[0];
  };

  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: customMatcher,
  });

  // Create test records
  const app1Debug: LogRecord = {
    ...debug,
    category: ["app", "module1"],
  };
  const app2Debug: LogRecord = {
    ...debug,
    category: ["app", "module2"],
  };
  const otherDebug: LogRecord = {
    ...debug,
    category: ["other", "module"],
  };
  const appError: LogRecord = {
    ...error,
    category: ["app", "module3"],
  };

  // Buffer logs
  sink(app1Debug);
  sink(app2Debug);
  sink(otherDebug);
  assertEquals(buffer.length, 0);

  // Trigger
  sink(appError);

  // Should flush all with same first category element
  assertEquals(buffer.length, 3);
  assert(buffer.includes(app1Debug));
  assert(buffer.includes(app2Debug));
  assert(buffer.includes(appError));
  assert(!buffer.includes(otherDebug));
});

test("fingersCrossed() - isolated buffers maintain separate states", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "descendant",
  });

  // Create test records
  const app1Debug: LogRecord = {
    ...debug,
    category: ["app1"],
  };
  const app1Error: LogRecord = {
    ...error,
    category: ["app1"],
  };
  const app2Debug: LogRecord = {
    ...debug,
    category: ["app2"],
  };
  const app2Info: LogRecord = {
    ...info,
    category: ["app2"],
  };

  // Buffer in app1
  sink(app1Debug);

  // Trigger app1
  sink(app1Error);
  assertEquals(buffer, [app1Debug, app1Error]);

  // Buffer in app2 (should still be buffering)
  sink(app2Debug);
  assertEquals(buffer, [app1Debug, app1Error]); // app2 still buffered

  // Add more to triggered app1 (should pass through)
  sink(app1Debug);
  assertEquals(buffer, [app1Debug, app1Error, app1Debug]);

  // app2 still buffering
  sink(app2Info);
  assertEquals(buffer, [app1Debug, app1Error, app1Debug]); // app2 still buffered
});

test("fingersCrossed() - chronological order in category isolation", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  // Create test records with different timestamps
  const app1: LogRecord = {
    ...debug,
    category: ["app"],
    timestamp: 1000,
  };
  const app2: LogRecord = {
    ...debug,
    category: ["app", "sub"],
    timestamp: 2000,
  };
  const app3: LogRecord = {
    ...info,
    category: ["app"],
    timestamp: 3000,
  };
  const app4: LogRecord = {
    ...debug,
    category: ["app", "sub"],
    timestamp: 4000,
  };
  const appError: LogRecord = {
    ...error,
    category: ["app"],
    timestamp: 5000,
  };

  // Add out of order
  sink(app3);
  sink(app1);
  sink(app4);
  sink(app2);

  // Trigger
  sink(appError);

  // Should be sorted by timestamp
  assertEquals(buffer, [app1, app2, app3, app4, appError]);
});

test("fingersCrossed() - empty buffer trigger", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // Trigger immediately without any buffered logs
  sink(error);
  assertEquals(buffer, [error]);

  // Continue to pass through
  sink(debug);
  assertEquals(buffer, [error, debug]);
});

test("fingersCrossed() - buffer size per category in isolation mode", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: 2,
    isolateByCategory: "descendant",
  });

  // Create records for different categories
  const app1Trace: LogRecord = { ...trace, category: ["app1"] };
  const app1Debug: LogRecord = { ...debug, category: ["app1"] };
  const app1Info: LogRecord = { ...info, category: ["app1"] };
  const app2Trace: LogRecord = { ...trace, category: ["app2"] };
  const app2Debug: LogRecord = { ...debug, category: ["app2"] };
  const app1Error: LogRecord = { ...error, category: ["app1"] };

  // Fill app1 buffer beyond max
  sink(app1Trace);
  sink(app1Debug);
  sink(app1Info); // Should drop app1Trace

  // Fill app2 buffer
  sink(app2Trace);
  sink(app2Debug);

  // Trigger app1
  sink(app1Error);

  // Should only have last 2 from app1 + error
  assertEquals(buffer.length, 3);
  assert(!buffer.some((r) => r === app1Trace)); // Dropped
  assert(buffer.includes(app1Debug));
  assert(buffer.includes(app1Info));
  assert(buffer.includes(app1Error));
  // app2 records should not be flushed
  assert(!buffer.includes(app2Trace));
  assert(!buffer.includes(app2Debug));
});

test("fingersCrossed() - edge case: trigger level not in severity order", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    triggerLevel: "trace", // Lowest level triggers immediately
  });

  // Everything should pass through immediately
  sink(trace);
  assertEquals(buffer, [trace]);

  sink(debug);
  assertEquals(buffer, [trace, debug]);
});

test("fingersCrossed() - edge case: invalid trigger level", () => {
  const buffer: LogRecord[] = [];

  // Should throw TypeError during sink creation
  assertThrows(
    () => {
      fingersCrossed(buffer.push.bind(buffer), {
        triggerLevel: "invalid" as LogLevel,
      });
    },
    TypeError,
    "Invalid triggerLevel",
  );
});

test("fingersCrossed() - edge case: very large buffer size", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: Number.MAX_SAFE_INTEGER,
  });

  // Add many records
  for (let i = 0; i < 1000; i++) {
    sink(debug);
  }
  assertEquals(buffer.length, 0); // Still buffered

  sink(error);
  assertEquals(buffer.length, 1001); // All 1000 + error
});

test("fingersCrossed() - edge case: zero buffer size", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: 0,
  });

  // Nothing should be buffered
  sink(debug);
  sink(info);
  assertEquals(buffer.length, 0);

  // Trigger should still work
  sink(error);
  assertEquals(buffer, [error]); // Only the trigger
});

test("fingersCrossed() - edge case: negative buffer size", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: -1,
  });

  // Should behave like zero
  sink(debug);
  sink(info);
  assertEquals(buffer.length, 0);

  sink(error);
  assertEquals(buffer, [error]);
});

test("fingersCrossed() - edge case: same record logged multiple times", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // Log same record multiple times
  sink(debug);
  sink(debug);
  sink(debug);
  assertEquals(buffer.length, 0);

  sink(error);
  // All instances should be preserved
  assertEquals(buffer.length, 4);
  assertEquals(buffer, [debug, debug, debug, error]);
});

test("fingersCrossed() - edge case: empty category array", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  const emptyCategory: LogRecord = {
    ...debug,
    category: [],
  };

  const normalCategory: LogRecord = {
    ...info,
    category: ["app"],
  };

  const emptyError: LogRecord = {
    ...error,
    category: [],
  };

  sink(emptyCategory);
  sink(normalCategory);
  assertEquals(buffer.length, 0);

  // Trigger with empty category
  sink(emptyError);

  // Only empty category should flush (no ancestors/descendants)
  assertEquals(buffer.length, 2);
  assert(buffer.includes(emptyCategory));
  assert(buffer.includes(emptyError));
  assert(!buffer.includes(normalCategory));
});

test("fingersCrossed() - edge case: category with special characters", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "descendant",
  });

  // Category with null character (our separator)
  const specialCategory: LogRecord = {
    ...debug,
    category: ["app\0special", "sub"],
  };

  const normalCategory: LogRecord = {
    ...info,
    category: ["app"],
  };

  const specialError: LogRecord = {
    ...error,
    category: ["app\0special"],
  };

  sink(specialCategory);
  sink(normalCategory);
  assertEquals(buffer.length, 0);

  // Should still work correctly despite special characters
  sink(specialError);

  assertEquals(buffer.length, 2);
  assert(buffer.includes(specialCategory));
  assert(buffer.includes(specialError));
  assert(!buffer.includes(normalCategory));
});

test("fingersCrossed() - edge case: rapid alternating triggers", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  const app1Debug: LogRecord = { ...debug, category: ["app1"] };
  const app2Debug: LogRecord = { ...debug, category: ["app2"] };
  const app1Error: LogRecord = { ...error, category: ["app1"] };
  const app2Error: LogRecord = { ...error, category: ["app2"] };

  // Rapidly alternate between categories and triggers
  sink(app1Debug);
  sink(app2Debug);
  sink(app1Error); // Trigger app1
  assertEquals(buffer.length, 2); // app1Debug + app1Error

  sink(app2Error); // Trigger app2
  assertEquals(buffer.length, 4); // Previous + app2Debug + app2Error

  // After both triggered, everything passes through
  sink(app1Debug);
  sink(app2Debug);
  assertEquals(buffer.length, 6);
});

test("fingersCrossed() - edge case: custom matcher throws error", () => {
  const buffer: LogRecord[] = [];

  const errorMatcher = (): boolean => {
    throw new Error("Matcher error");
  };

  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: errorMatcher,
  });

  const app1Debug: LogRecord = { ...debug, category: ["app1"] };
  const app2Debug: LogRecord = { ...debug, category: ["app2"] };
  const app1Error: LogRecord = { ...error, category: ["app1"] };

  sink(app1Debug);
  sink(app2Debug);

  // Should handle error gracefully and still trigger
  try {
    sink(app1Error);
  } catch {
    // Should not throw to caller
  }

  // At minimum, trigger record should be sent
  assert(buffer.includes(app1Error));
});

test("fingersCrossed() - edge case: circular category references", () => {
  const buffer: LogRecord[] = [];

  // Custom matcher that creates circular logic
  const circularMatcher = (
    _trigger: readonly string[],
    _buffered: readonly string[],
  ): boolean => {
    // Always return true, creating a circular flush
    return true;
  };

  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: circularMatcher,
  });

  const app1: LogRecord = { ...debug, category: ["app1"] };
  const app2: LogRecord = { ...debug, category: ["app2"] };
  const app3: LogRecord = { ...debug, category: ["app3"] };
  const trigger: LogRecord = { ...error, category: ["trigger"] };

  sink(app1);
  sink(app2);
  sink(app3);
  assertEquals(buffer.length, 0);

  // Should flush all despite circular logic
  sink(trigger);
  assertEquals(buffer.length, 4);

  // All buffers should be cleared after flush
  const newDebug: LogRecord = { ...debug, category: ["new"] };
  sink(newDebug);
  assertEquals(buffer.length, 4); // New category should be buffered
});

test("fingersCrossed() - edge case: timestamps in wrong order", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  const future: LogRecord = {
    ...debug,
    category: ["app"],
    timestamp: Date.now() + 10000, // Future
  };

  const past: LogRecord = {
    ...info,
    category: ["app", "sub"],
    timestamp: Date.now() - 10000, // Past
  };

  const present: LogRecord = {
    ...warning,
    category: ["app"],
    timestamp: Date.now(),
  };

  const trigger: LogRecord = {
    ...error,
    category: ["app"],
    timestamp: Date.now() + 5000,
  };

  // Add in random order
  sink(future);
  sink(past);
  sink(present);

  // Trigger
  sink(trigger);

  // Should be sorted by timestamp
  assertEquals(buffer[0], past);
  assertEquals(buffer[1], present);
  assertEquals(buffer[2], future);
  assertEquals(buffer[3], trigger);
});

test("fingersCrossed() - edge case: NaN and Infinity in timestamps", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  const nanTime: LogRecord = {
    ...debug,
    category: ["app"],
    timestamp: NaN,
  };

  const infinityTime: LogRecord = {
    ...info,
    category: ["app"],
    timestamp: Infinity,
  };

  const negInfinityTime: LogRecord = {
    ...warning,
    category: ["app"],
    timestamp: -Infinity,
  };

  const normalTime: LogRecord = {
    ...error,
    category: ["app"],
    timestamp: 1000,
  };

  sink(nanTime);
  sink(infinityTime);
  sink(negInfinityTime);

  // Should handle special values without crashing
  sink(normalTime);

  // Check all records are present (order might vary with NaN)
  assertEquals(buffer.length, 4);
  assert(buffer.includes(nanTime));
  assert(buffer.includes(infinityTime));
  assert(buffer.includes(negInfinityTime));
  assert(buffer.includes(normalTime));
});

test("fingersCrossed() - edge case: undefined properties in record", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  const weirdRecord: LogRecord = {
    ...debug,
    properties: {
      normal: "value",
      undef: undefined,
      nullish: null,
      nan: NaN,
      inf: Infinity,
    },
  };

  sink(weirdRecord);
  sink(error);

  // Should preserve all properties as-is
  assertEquals(buffer[0].properties, weirdRecord.properties);
});

test("fingersCrossed() - edge case: very deep category hierarchy", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "both",
  });

  // Create very deep hierarchy
  const deepCategory = Array.from({ length: 100 }, (_, i) => `level${i}`);
  const parentCategory = deepCategory.slice(0, 50);

  const deepRecord: LogRecord = {
    ...debug,
    category: deepCategory,
  };

  const parentRecord: LogRecord = {
    ...info,
    category: parentCategory,
  };

  const deepError: LogRecord = {
    ...error,
    category: deepCategory,
  };

  sink(deepRecord);
  sink(parentRecord);
  assertEquals(buffer.length, 0);

  // Should handle deep hierarchies
  sink(deepError);

  // Both should flush (ancestor relationship)
  assertEquals(buffer.length, 3);
  assert(buffer.includes(deepRecord));
  assert(buffer.includes(parentRecord));
  assert(buffer.includes(deepError));
});

test("fingersCrossed() - context isolation basic functionality", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  // Create records with different request IDs
  const req1Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-1", data: "debug1" },
  };
  const req1Info: LogRecord = {
    ...info,
    properties: { requestId: "req-1", data: "info1" },
  };
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: "req-1", data: "error1" },
  };

  const req2Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-2", data: "debug2" },
  };
  const req2Info: LogRecord = {
    ...info,
    properties: { requestId: "req-2", data: "info2" },
  };

  // Buffer logs for both requests
  sink(req1Debug);
  sink(req1Info);
  sink(req2Debug);
  sink(req2Info);
  assertEquals(buffer.length, 0); // All buffered

  // Error in req-1 should only flush req-1 logs
  sink(req1Error);
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], req1Debug);
  assertEquals(buffer[1], req1Info);
  assertEquals(buffer[2], req1Error);

  // req-2 logs should still be buffered
  buffer.length = 0;
  sink(req2Debug); // Add another req-2 log
  assertEquals(buffer.length, 0); // Still buffered

  // Now trigger req-2
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2", data: "error2" },
  };
  sink(req2Error);
  assertEquals(buffer.length, 4); // 2x req2Debug + req2Info + req2Error
  assertEquals(buffer[0], req2Debug);
  assertEquals(buffer[1], req2Info);
  assertEquals(buffer[2], req2Debug); // Second instance
  assertEquals(buffer[3], req2Error);
});

test("fingersCrossed() - context isolation with multiple keys", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId", "sessionId"] },
  });

  // Create records with different combinations
  const record1: LogRecord = {
    ...debug,
    properties: { requestId: "req-1", sessionId: "sess-1" },
  };
  const record2: LogRecord = {
    ...debug,
    properties: { requestId: "req-1", sessionId: "sess-2" },
  };
  const record3: LogRecord = {
    ...debug,
    properties: { requestId: "req-2", sessionId: "sess-1" },
  };

  sink(record1);
  sink(record2);
  sink(record3);
  assertEquals(buffer.length, 0); // All buffered

  // Error with req-1/sess-1 should only flush that combination
  const trigger1: LogRecord = {
    ...error,
    properties: { requestId: "req-1", sessionId: "sess-1" },
  };
  sink(trigger1);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], record1);
  assertEquals(buffer[1], trigger1);

  // Other combinations still buffered
  buffer.length = 0;
  const trigger2: LogRecord = {
    ...error,
    properties: { requestId: "req-1", sessionId: "sess-2" },
  };
  sink(trigger2);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], record2);
  assertEquals(buffer[1], trigger2);
});

test("fingersCrossed() - context isolation with missing keys", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  // Records with and without requestId
  const withId: LogRecord = {
    ...debug,
    properties: { requestId: "req-1", other: "data" },
  };
  const withoutId: LogRecord = {
    ...debug,
    properties: { other: "data" },
  };
  const withUndefinedId: LogRecord = {
    ...debug,
    properties: { requestId: undefined, other: "data" },
  };

  sink(withId);
  sink(withoutId);
  sink(withUndefinedId);
  assertEquals(buffer.length, 0); // All buffered

  // Error without requestId should flush records without or with undefined requestId
  const triggerNoId: LogRecord = {
    ...error,
    properties: { other: "data" },
  };
  sink(triggerNoId);
  assertEquals(buffer.length, 3); // withoutId + withUndefinedId + triggerNoId
  assertEquals(buffer[0], withoutId);
  assertEquals(buffer[1], withUndefinedId);
  assertEquals(buffer[2], triggerNoId);

  // Records with requestId still buffered
  buffer.length = 0;
  const triggerWithId: LogRecord = {
    ...error,
    properties: { requestId: "req-1", other: "data" },
  };
  sink(triggerWithId);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], withId);
  assertEquals(buffer[1], triggerWithId);
});

test("fingersCrossed() - combined category and context isolation", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "descendant",
    isolateByContext: { keys: ["requestId"] },
  });

  // Create records with different categories and contexts
  const appReq1: LogRecord = {
    ...debug,
    category: ["app"],
    properties: { requestId: "req-1" },
  };
  const appModuleReq1: LogRecord = {
    ...debug,
    category: ["app", "module"],
    properties: { requestId: "req-1" },
  };
  const appReq2: LogRecord = {
    ...debug,
    category: ["app"],
    properties: { requestId: "req-2" },
  };
  const appModuleReq2: LogRecord = {
    ...debug,
    category: ["app", "module"],
    properties: { requestId: "req-2" },
  };
  const otherReq1: LogRecord = {
    ...debug,
    category: ["other"],
    properties: { requestId: "req-1" },
  };

  sink(appReq1);
  sink(appModuleReq1);
  sink(appReq2);
  sink(appModuleReq2);
  sink(otherReq1);
  assertEquals(buffer.length, 0); // All buffered

  // Error in ["app"] with req-1 should flush descendants with same requestId
  const triggerAppReq1: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: "req-1" },
  };
  sink(triggerAppReq1);
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], appReq1);
  assertEquals(buffer[1], appModuleReq1);
  assertEquals(buffer[2], triggerAppReq1);

  // Other combinations still buffered
  buffer.length = 0;
  const triggerAppReq2: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: "req-2" },
  };
  sink(triggerAppReq2);
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], appReq2);
  assertEquals(buffer[1], appModuleReq2);
  assertEquals(buffer[2], triggerAppReq2);
});

test("fingersCrossed() - context isolation buffer size limits", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: 2,
    isolateByContext: { keys: ["requestId"] },
  });

  // Create records for different contexts
  const req1Trace: LogRecord = {
    ...trace,
    properties: { requestId: "req-1" },
  };
  const req1Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  const req1Info: LogRecord = {
    ...info,
    properties: { requestId: "req-1" },
  };
  const req2Trace: LogRecord = {
    ...trace,
    properties: { requestId: "req-2" },
  };
  const req2Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-2" },
  };

  // Fill req-1 buffer beyond limit
  sink(req1Trace);
  sink(req1Debug);
  sink(req1Info); // Should drop req1Trace

  // Fill req-2 buffer
  sink(req2Trace);
  sink(req2Debug);

  // Trigger req-1
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  sink(req1Error);

  // Should only have the last 2 records plus error
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], req1Debug);
  assertEquals(buffer[1], req1Info);
  assertEquals(buffer[2], req1Error);

  // Trigger req-2
  buffer.length = 0;
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2" },
  };
  sink(req2Error);

  // req-2 buffer should still have both records
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], req2Trace);
  assertEquals(buffer[1], req2Debug);
  assertEquals(buffer[2], req2Error);
});

test("fingersCrossed() - context isolation with special values", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["value"] },
  });

  // Records with special values
  const nullValue: LogRecord = {
    ...debug,
    properties: { value: null },
  };
  const undefinedValue: LogRecord = {
    ...debug,
    properties: { value: undefined },
  };
  const zeroValue: LogRecord = {
    ...debug,
    properties: { value: 0 },
  };
  const emptyString: LogRecord = {
    ...debug,
    properties: { value: "" },
  };
  const falseValue: LogRecord = {
    ...debug,
    properties: { value: false },
  };

  sink(nullValue);
  sink(undefinedValue);
  sink(zeroValue);
  sink(emptyString);
  sink(falseValue);
  assertEquals(buffer.length, 0); // All buffered

  // Trigger with null value
  const triggerNull: LogRecord = {
    ...error,
    properties: { value: null },
  };
  sink(triggerNull);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], nullValue);
  assertEquals(buffer[1], triggerNull);

  // Trigger with zero value
  buffer.length = 0;
  const triggerZero: LogRecord = {
    ...error,
    properties: { value: 0 },
  };
  sink(triggerZero);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], zeroValue);
  assertEquals(buffer[1], triggerZero);

  // Trigger with false value
  buffer.length = 0;
  const triggerFalse: LogRecord = {
    ...error,
    properties: { value: false },
  };
  sink(triggerFalse);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], falseValue);
  assertEquals(buffer[1], triggerFalse);
});

test("fingersCrossed() - context isolation only (no category isolation)", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  // Different categories, same context
  const cat1Req1: LogRecord = {
    ...debug,
    category: ["cat1"],
    properties: { requestId: "req-1" },
  };
  const cat2Req1: LogRecord = {
    ...debug,
    category: ["cat2"],
    properties: { requestId: "req-1" },
  };
  const cat1Req2: LogRecord = {
    ...debug,
    category: ["cat1"],
    properties: { requestId: "req-2" },
  };

  sink(cat1Req1);
  sink(cat2Req1);
  sink(cat1Req2);
  assertEquals(buffer.length, 0); // All buffered

  // Error in any category with req-1 should flush all req-1 logs
  const triggerReq1: LogRecord = {
    ...error,
    category: ["cat3"],
    properties: { requestId: "req-1" },
  };
  sink(triggerReq1);
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], cat1Req1);
  assertEquals(buffer[1], cat2Req1);
  assertEquals(buffer[2], triggerReq1);

  // req-2 still buffered
  buffer.length = 0;
  const triggerReq2: LogRecord = {
    ...error,
    category: ["cat1"],
    properties: { requestId: "req-2" },
  };
  sink(triggerReq2);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], cat1Req2);
  assertEquals(buffer[1], triggerReq2);
});

test("fingersCrossed() - context isolation with nested objects", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["user"] },
  });

  // Records with nested object values
  const user1: LogRecord = {
    ...debug,
    properties: { user: { id: 1, name: "Alice" } },
  };
  const user1Same: LogRecord = {
    ...debug,
    properties: { user: { id: 1, name: "Alice" } },
  };
  const user2: LogRecord = {
    ...debug,
    properties: { user: { id: 2, name: "Bob" } },
  };

  sink(user1);
  sink(user1Same);
  sink(user2);
  assertEquals(buffer.length, 0); // All buffered

  // Trigger with same user object
  const triggerUser1: LogRecord = {
    ...error,
    properties: { user: { id: 1, name: "Alice" } },
  };
  sink(triggerUser1);
  assertEquals(buffer.length, 3);
  assertEquals(buffer[0], user1);
  assertEquals(buffer[1], user1Same);
  assertEquals(buffer[2], triggerUser1);

  // user2 still buffered
  buffer.length = 0;
  const triggerUser2: LogRecord = {
    ...error,
    properties: { user: { id: 2, name: "Bob" } },
  };
  sink(triggerUser2);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], user2);
  assertEquals(buffer[1], triggerUser2);
});

test("fingersCrossed() - context isolation after trigger", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  // Trigger req-1 immediately
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  sink(req1Error);
  assertEquals(buffer.length, 1);
  assertEquals(buffer[0], req1Error);

  // After trigger, req-1 logs pass through
  const req1Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(req1Debug);
  assertEquals(buffer.length, 2);
  assertEquals(buffer[1], req1Debug);

  // But req-2 logs are still buffered
  const req2Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-2" },
  };
  sink(req2Debug);
  assertEquals(buffer.length, 2); // No change

  // Until req-2 triggers
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2" },
  };
  sink(req2Error);
  assertEquals(buffer.length, 4);
  assertEquals(buffer[2], req2Debug);
  assertEquals(buffer[3], req2Error);
});

test("fingersCrossed() - TTL-based buffer cleanup", async () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      bufferTtlMs: 100, // 100ms TTL
      cleanupIntervalMs: 50, // cleanup every 50ms
    },
  }) as Sink & Disposable;

  try {
    // Create records with different request IDs
    const req1Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    const req2Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-2" },
      timestamp: Date.now(),
    };

    // Add records to buffers
    sink(req1Record);
    sink(req2Record);

    // Wait for TTL to expire and cleanup to run
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Add a new record after TTL expiry
    const req3Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-3" },
      timestamp: Date.now(),
    };
    sink(req3Record);

    // Trigger an error for req-1 (should not flush expired req-1 buffer)
    const req1Error: LogRecord = {
      ...error,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    sink(req1Error);

    // Should only have req-1 error (req-1 debug was cleaned up by TTL)
    assertEquals(buffer.length, 1);
    assertEquals(buffer[0], req1Error);

    // Trigger an error for req-3 (should flush req-3 buffer)
    buffer.length = 0; // Clear buffer
    const req3Error: LogRecord = {
      ...error,
      properties: { requestId: "req-3" },
      timestamp: Date.now(),
    };
    sink(req3Error);

    // Should have both req-3 debug and error
    assertEquals(buffer.length, 2);
    assertEquals(buffer[0], req3Record);
    assertEquals(buffer[1], req3Error);
  } finally {
    // Clean up timer
    sink[Symbol.dispose]();
  }
});

test("fingersCrossed() - TTL disabled when bufferTtlMs is zero", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      bufferTtlMs: 0, // TTL disabled
    },
  });

  // Should return a regular sink without disposal functionality
  assertEquals("dispose" in sink, false);

  // Add a record
  const record: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(record);

  // Trigger should work normally
  const errorRecord: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  sink(errorRecord);

  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], record);
  assertEquals(buffer[1], errorRecord);
});

test("fingersCrossed() - TTL disabled when bufferTtlMs is undefined", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      // bufferTtlMs not specified
    },
  });

  // Should return a regular sink without disposal functionality
  assertEquals("dispose" in sink, false);
});

test("fingersCrossed() - LRU-based buffer eviction", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      maxContexts: 2, // Only keep 2 context buffers
    },
  });

  // Step 1: Add req-1
  const req1Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(req1Record);

  // Step 2: Add req-2
  const req2Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-2" },
  };
  sink(req2Record);

  // Step 3: Add req-3 (should evict req-1)
  const req3Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-3" },
  };
  sink(req3Record);

  // Test req-1 was evicted by triggering error
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  sink(req1Error);

  // If req-1 was evicted, should only have error (length=1)
  // If req-1 wasn't evicted, should have debug+error (length=2)
  assertEquals(buffer.length, 1, "req-1 should have been evicted by LRU");
  assertEquals(buffer[0], req1Error);
});

test("fingersCrossed() - LRU eviction order with access updates", async () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      maxContexts: 2,
    },
  });

  // Add two contexts with time gap to ensure different timestamps
  const req1Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(req1Record); // req-1 is oldest

  // Small delay to ensure different lastAccess times
  await new Promise((resolve) => setTimeout(resolve, 1));

  const req2Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-2" },
  };
  sink(req2Record); // req-2 is newest

  // Access req-1 again after another delay to make it more recent
  await new Promise((resolve) => setTimeout(resolve, 1));

  const req1Second: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(req1Second); // Now req-2 is oldest, req-1 is newest

  // Add third context - should evict req-2 (now the oldest)
  const req3Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-3" },
  };
  sink(req3Record);

  // Verify req-2 was evicted
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2" },
  };
  sink(req2Error);

  // Should only have error record (no buffered records)
  assertEquals(buffer.length, 1, "req-2 should have been evicted");
  assertEquals(buffer[0], req2Error);
});

test("fingersCrossed() - LRU disabled when maxContexts is zero", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      maxContexts: 0, // LRU disabled
    },
  });

  // Create many contexts - should not be limited
  for (let i = 0; i < 100; i++) {
    const record: LogRecord = {
      ...debug,
      properties: { requestId: `req-${i}` },
    };
    sink(record);
  }

  // Trigger the last context
  const errorRecord: LogRecord = {
    ...error,
    properties: { requestId: "req-99" },
  };
  sink(errorRecord);

  // Should have both debug and error records
  assertEquals(buffer.length, 2);
  assertEquals(buffer[0].properties?.requestId, "req-99");
  assertEquals(buffer[1], errorRecord);
});

test("fingersCrossed() - LRU disabled when maxContexts is undefined", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      // maxContexts not specified
    },
  });

  // Should work normally without LRU limits
  const record: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(record);

  const errorRecord: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  sink(errorRecord);

  assertEquals(buffer.length, 2);
  assertEquals(buffer[0], record);
  assertEquals(buffer[1], errorRecord);
});

test("fingersCrossed() - Combined TTL and LRU functionality", async () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      maxContexts: 2, // LRU limit
      bufferTtlMs: 100, // TTL limit
      cleanupIntervalMs: 50, // cleanup interval
    },
  }) as Sink & Disposable;

  try {
    // Create records for multiple contexts
    const req1Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    const req2Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-2" },
      timestamp: Date.now(),
    };

    // Add two contexts (within LRU limit)
    sink(req1Record);
    sink(req2Record);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Add a third context (should work because TTL cleaned up old ones)
    const req3Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-3" },
      timestamp: Date.now(),
    };
    sink(req3Record);

    // Trigger req-1 (should not find buffered records due to TTL expiry)
    const req1Error: LogRecord = {
      ...error,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    sink(req1Error);

    // Should only have the error record
    assertEquals(buffer.length, 1);
    assertEquals(buffer[0], req1Error);

    // Clear buffer and trigger req-3 (should have recent record)
    buffer.length = 0;
    const req3Error: LogRecord = {
      ...error,
      properties: { requestId: "req-3" },
      timestamp: Date.now(),
    };
    sink(req3Error);

    // Should have both debug and error records
    assertEquals(buffer.length, 2);
    assertEquals(buffer[0], req3Record);
    assertEquals(buffer[1], req3Error);
  } finally {
    sink[Symbol.dispose]();
  }
});

test("fingersCrossed() - LRU priority over TTL for active contexts", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      maxContexts: 2,
      bufferTtlMs: 10000, // Long TTL (10 seconds)
    },
  }) as Sink & Disposable;

  try {
    // Create 3 contexts quickly (before TTL expires)
    const req1Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
    };
    const req2Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-2" },
    };
    const req3Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-3" },
    };

    sink(req1Record); // LRU position: oldest
    sink(req2Record); // LRU position: middle
    sink(req3Record); // LRU position: newest, should evict req-1 due to LRU

    // Now trigger req-2 (should have buffered record)
    const req2Error: LogRecord = {
      ...error,
      properties: { requestId: "req-2" },
    };
    sink(req2Error);

    // Should have both debug and error records
    assertEquals(buffer.length, 2);
    assertEquals(buffer[0], req2Record);
    assertEquals(buffer[1], req2Error);
  } finally {
    sink[Symbol.dispose]();
  }
});

test("fingersCrossed() - bufferLevel basic functionality", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    bufferLevel: "debug", // Only buffer trace and debug
    triggerLevel: "warning", // Trigger on warning or higher
  });

  // trace and debug should be buffered
  sink(trace);
  sink(debug);
  assertEquals(buffer.length, 0);

  // info should pass through immediately (above bufferLevel, below triggerLevel)
  sink(info);
  assertEquals(buffer, [info]);

  // warning should trigger flush and include itself
  sink(warning);
  assertEquals(buffer, [info, trace, debug, warning]);

  // After trigger, all logs pass through
  sink(trace);
  assertEquals(buffer, [info, trace, debug, warning, trace]);
});

test("fingersCrossed() - bufferLevel with null value", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    bufferLevel: null, // Explicit null means buffer all below triggerLevel
    triggerLevel: "error",
  });

  // All levels below error should be buffered
  sink(trace);
  sink(debug);
  sink(info);
  sink(warning);
  assertEquals(buffer.length, 0);

  // error triggers flush
  sink(error);
  assertEquals(buffer, [trace, debug, info, warning, error]);
});

test("fingersCrossed() - bufferLevel validation: invalid level", () => {
  assertThrows(
    () =>
      fingersCrossed(() => {}, {
        bufferLevel: "invalid" as LogLevel,
        triggerLevel: "error",
      }),
    TypeError,
    "Invalid bufferLevel",
  );
});

test("fingersCrossed() - bufferLevel validation: bufferLevel >= triggerLevel", () => {
  // bufferLevel same as triggerLevel
  assertThrows(
    () =>
      fingersCrossed(() => {}, {
        bufferLevel: "error",
        triggerLevel: "error",
      }),
    RangeError,
    "bufferLevel",
  );

  // bufferLevel higher than triggerLevel
  assertThrows(
    () =>
      fingersCrossed(() => {}, {
        bufferLevel: "fatal",
        triggerLevel: "error",
      }),
    RangeError,
    "bufferLevel",
  );
});

test("fingersCrossed() - bufferLevel with category isolation", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    bufferLevel: "debug",
    triggerLevel: "error",
    isolateByCategory: "descendant",
  });

  const appDebug: LogRecord = { ...debug, category: ["app"] };
  const appInfo: LogRecord = { ...info, category: ["app"] };
  const appError: LogRecord = { ...error, category: ["app"] };

  // debug buffered, info passes through
  sink(appDebug);
  assertEquals(buffer.length, 0);

  sink(appInfo);
  assertEquals(buffer, [appInfo]);

  // error triggers flush
  sink(appError);
  assertEquals(buffer, [appInfo, appDebug, appError]);
});

test("fingersCrossed() - bufferLevel with context isolation", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    bufferLevel: "debug",
    triggerLevel: "error",
    isolateByContext: { keys: ["requestId"] },
  }) as Sink & Disposable;

  try {
    const req1Debug: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
    };
    const req1Info: LogRecord = {
      ...info,
      properties: { requestId: "req-1" },
    };
    const req1Error: LogRecord = {
      ...error,
      properties: { requestId: "req-1" },
    };

    // debug buffered
    sink(req1Debug);
    assertEquals(buffer.length, 0);

    // info passes through immediately
    sink(req1Info);
    assertEquals(buffer, [req1Info]);

    // error triggers flush
    sink(req1Error);
    assertEquals(buffer, [req1Info, req1Debug, req1Error]);
  } finally {
    sink[Symbol.dispose]?.();
  }
});

test("fingersCrossed() - bufferLevel edge case: trace as bufferLevel", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    bufferLevel: "trace", // Only buffer trace
    triggerLevel: "error",
  });

  // Only trace is buffered
  sink(trace);
  assertEquals(buffer.length, 0);

  // debug and above pass through immediately
  sink(debug);
  assertEquals(buffer, [debug]);

  sink(info);
  assertEquals(buffer, [debug, info]);

  // error triggers flush
  sink(error);
  assertEquals(buffer, [debug, info, trace, error]);
});

test("fingersCrossed() - bufferLevel preserves chronological order on flush", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    bufferLevel: "debug",
    triggerLevel: "error",
  });

  // Mix buffered and pass-through records
  const t1 = { ...trace, timestamp: 1 };
  const t2 = { ...info, timestamp: 2 }; // pass-through
  const t3 = { ...debug, timestamp: 3 };
  const t4 = { ...info, timestamp: 4 }; // pass-through
  const t5 = { ...error, timestamp: 5 }; // trigger

  sink(t1);
  sink(t2);
  sink(t3);
  sink(t4);
  sink(t5);

  // info records passed through first, then buffered records flushed, then trigger
  assertEquals(buffer, [t2, t4, t1, t3, t5]);
});
