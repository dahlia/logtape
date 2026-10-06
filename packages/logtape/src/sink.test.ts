import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import makeConsoleMock from "consolemock";
import fc from "fast-check";
import { debug, error, fatal, info, trace, warning } from "./fixtures.ts";
import { defaultTextFormatter } from "./formatter.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";
import { LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import {
  type AsyncSink,
  type AsyncSinkOptions,
  type AsyncSinkOverflowPolicy,
  fingersCrossed,
  fromAsyncSink,
  getConsoleSink,
  getStreamSink,
  type Sink,
  type SinkDropEvent,
  withFilter,
} from "./sink.ts";

const logLevelArb: fc.Arbitrary<LogLevel> = fc.constantFrom<LogLevel>(
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
);

test("withFilter()", () => {
  const buffer: LogRecord[] = [];
  const sink = withFilter(buffer.push.bind(buffer), "warning");
  sink(trace);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  assert.deepStrictEqual(buffer, [warning, error, fatal]);
});

test("withFilter() forwards generated records accepted by level filters", () => {
  fc.assert(
    fc.property(
      logLevelArb,
      fc.array(logLevelArb),
      (minimum, levels) => {
        const buffer: LogRecord[] = [];
        const sink = withFilter(buffer.push.bind(buffer), minimum);
        const records = levels.map(recordWithLevel);

        for (const record of records) sink(record);

        assert.deepStrictEqual(
          buffer,
          records.filter((record) =>
            compareLogLevel(record.level, minimum) >= 0
          ),
        );
      },
    ),
  );
});

test("withFilter() forwards Symbol.dispose", () => {
  const buffer: LogRecord[] = [];
  const rawSink = ((record: LogRecord) => {
    buffer.push(record);
  }) as Sink & Disposable & { disposed: boolean };
  rawSink.disposed = false;
  rawSink[Symbol.dispose] = function (this: typeof rawSink) {
    assert.strictEqual(this, rawSink);
    this.disposed = true;
  };

  const sink = withFilter(rawSink, "warning");

  sink(info);
  sink(warning);
  (sink as Sink & Partial<Disposable>)[Symbol.dispose]?.();
  assert.deepStrictEqual(buffer, [warning]);
  assert.strictEqual(rawSink.disposed, true);
});

test("withFilter() forwards Symbol.asyncDispose", async () => {
  const buffer: LogRecord[] = [];
  const rawSink = ((record: LogRecord) => {
    buffer.push(record);
  }) as Sink & AsyncDisposable & { disposed: boolean };
  rawSink.disposed = false;
  rawSink[Symbol.asyncDispose] = async function (this: typeof rawSink) {
    await Promise.resolve();
    assert.strictEqual(this, rawSink);
    this.disposed = true;
  };

  const sink = withFilter(rawSink, "warning");

  sink(info);
  sink(warning);
  await (sink as Sink & Partial<AsyncDisposable>)[Symbol.asyncDispose]?.();
  assert.deepStrictEqual(buffer, [warning]);
  assert.strictEqual(rawSink.disposed, true);
});

interface ConsoleMock extends Console {
  history(): unknown[];
}

test("getStreamSink()", async () => {
  let buffer: string = "";
  let closed = false;
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
      close() {
        closed = true;
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
  assert.strictEqual(
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
  assert.strictEqual(closed, true);
});

test("getStreamSink() with closeStream: false", async () => {
  // Arrange
  let buffer = "";
  let closed = false;
  const decoder = new TextDecoder();
  const stream = new WritableStream({
    write(chunk: Uint8Array) {
      buffer += decoder.decode(chunk);
    },
    close() {
      closed = true;
    },
  });
  const sink = getStreamSink(stream, { closeStream: false });

  // Act
  sink(info);
  await sink[Symbol.asyncDispose]();

  // Assert
  assert.strictEqual(
    buffer,
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: " +
      "Hello, 123 & 456!\n",
  );
  assert.strictEqual(closed, false);
  const writer = stream.getWriter();
  await writer.write(new TextEncoder().encode("after disposal"));
  await writer.close();
  writer.releaseLock();
  assert.ok(buffer.endsWith("after disposal"));
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
  assert.ok(sink instanceof Function);
  assert.ok(Symbol.asyncDispose in sink);

  // Add records - they should not be written immediately
  sink(trace);
  sink(debug);
  assert.strictEqual(buffer, ""); // Not written yet

  // Wait for flush interval (default 100ms)
  await delay(150);
  assert.strictEqual(
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
  assert.strictEqual(buffer, ""); // Not flushed yet

  sink(debug); // This should trigger immediate flush (buffer size = 2)
  await delay(10); // Small delay for async flush
  assert.strictEqual(
    buffer,
    `2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
`,
  );

  // Add more records
  const prevLength = (buffer as string).length;
  sink(info);
  assert.strictEqual((buffer as string).length, prevLength); // Not flushed yet

  // Wait for flush interval
  await delay(60);
  assert.strictEqual(
    (buffer as string).substring(prevLength),
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
  assert.strictEqual(buffer, "");
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
  assert.strictEqual(buffer, ""); // Not flushed yet due to large buffer and long interval

  // Dispose should flush all remaining records
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(
    buffer,
    `2023-11-14 22:13:20.000 +00:00 [TRC] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
});

test(
  "getStreamSink() with nonBlocking and closeStream: false",
  async () => {
    // Arrange
    let buffer = "";
    let closed = false;
    const decoder = new TextDecoder();
    const stream = new WritableStream({
      write(chunk: Uint8Array) {
        buffer += decoder.decode(chunk);
      },
      close() {
        closed = true;
      },
    });
    const sink = getStreamSink(stream, {
      closeStream: false,
      nonBlocking: {
        bufferSize: 100,
        flushInterval: 5000,
      },
    });

    // Act
    sink(info);
    await sink[Symbol.asyncDispose]();

    // Assert
    assert.strictEqual(
      buffer,
      "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: " +
        "Hello, 123 & 456!\n",
    );
    assert.strictEqual(closed, false);
    const writer = stream.getWriter();
    await writer.close();
    writer.releaseLock();
  },
);

test(
  "getStreamSink() with nonBlocking waits for an active flush on dispose",
  async () => {
    // Arrange
    let markWriteStarted: () => void = () => {};
    let finishWrite: () => void = () => {};
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });
    const writeCanFinish = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const stream = new WritableStream({
      async write() {
        markWriteStarted();
        await writeCanFinish;
      },
    });
    const sink = getStreamSink(stream, {
      closeStream: false,
      nonBlocking: { bufferSize: 1 },
    });

    // Act
    sink(info);
    await beforeDeadline(writeStarted, "The buffered write did not start");
    let disposed = false;
    const disposePromise = Promise.resolve(sink[Symbol.asyncDispose]()).then(
      () => {
        disposed = true;
      },
    );
    await delay(0);

    // Assert
    assert.strictEqual(disposed, false);
    finishWrite();
    await beforeDeadline(disposePromise, "The stream sink was not disposed");
    const writer = stream.getWriter();
    await writer.close();
    writer.releaseLock();
  },
);

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
  assert.ok(
    recordsReceived < 20,
    `Expected < 20 records due to potential overflow, got ${recordsReceived}`,
  );
  assert.ok(recordsReceived > 0, "Expected some records to be logged");
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
  assert.ok(
    duration < 100,
    `Adding 100 logs took ${duration}ms, should be much faster`,
  );

  // Wait for flushes to complete
  await delay(200);

  // Should have logged some records
  assert.ok(buffer.length > 0, "Expected some records to be logged");

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
  assert.deepStrictEqual(mock.history(), [
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

  assert.throws(
    () => sink({ ...info, level: "invalid" as LogLevel }),
    TypeError,
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
  assert.deepStrictEqual(mock2.history(), [
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
  assert.deepStrictEqual(mock3.history(), [
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
  assert.ok(sink instanceof Function);
  assert.ok(Symbol.dispose in sink);

  // Add records - they should not be logged immediately
  sink(trace);
  sink(debug);
  assert.strictEqual(mock.history().length, 0); // Not logged yet

  // Wait for flush interval (default 100ms)
  await delay(150);
  assert.strictEqual(mock.history().length, 2); // Now they should be logged

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
  assert.strictEqual(mock.history().length, 0); // Not flushed yet

  sink(info); // This should trigger scheduled flush (buffer size = 3)
  await delay(10); // Wait for scheduled flush to execute
  assert.strictEqual(mock.history().length, 3); // Flushed due to buffer size

  // Add more records
  sink(warning);
  assert.strictEqual(mock.history().length, 3); // Not flushed yet

  // Wait for flush interval
  await delay(60);
  assert.strictEqual(mock.history().length, 4); // Flushed due to interval

  // Dispose and check remaining records are flushed
  sink(error);
  sink(fatal);
  (sink as Sink & Disposable)[Symbol.dispose]();
  assert.strictEqual(mock.history().length, 6); // All records flushed on dispose
});

test("getConsoleSink() with nonBlocking - cancels scheduled flush on dispose", () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timeoutId = 12345 as unknown as ReturnType<typeof setTimeout>;
  let scheduledCallback: (() => void) | undefined;
  let clearedTimeout: ReturnType<typeof setTimeout> | undefined;

  globalThis.setTimeout = ((callback: () => void) => {
    scheduledCallback = callback;
    return timeoutId;
  }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    clearedTimeout = id;
  }) as typeof globalThis.clearTimeout;

  try {
    const sink = getConsoleSink({
      console: mock,
      nonBlocking: {
        bufferSize: 1,
        flushInterval: 5000,
      },
    });

    sink(info);
    assert.strictEqual(mock.history().length, 0);

    (sink as Sink & Disposable)[Symbol.dispose]();
    assert.strictEqual(clearedTimeout, timeoutId);
    assert.strictEqual(mock.history().length, 1);

    scheduledCallback?.();
    assert.strictEqual(mock.history().length, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
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
  assert.strictEqual(mock.history().length, 0);
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
  assert.ok(
    historyLength <= 10,
    `Expected <= 10 records, got ${historyLength}`,
  );
  assert.ok(historyLength > 0, "Expected some records to be logged");
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
  assert.ok(
    duration < 100,
    `Adding 100 logs took ${duration}ms, should be much faster`,
  );

  // Wait for flushes to complete
  await delay(200);

  // Should have logged some records
  assert.ok(mock.history().length > 0, "Expected some records to be logged");

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
  assert.strictEqual(buffer.length, 0);

  // Wait for async operations to complete
  await sink[Symbol.asyncDispose]();

  // All records should be in buffer in order
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer, [trace, debug, info]);
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
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer, [trace, debug, info]);
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
  assert.strictEqual(errorCount, 1);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer, [trace, info]);
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
  assert.strictEqual(buffer.length, 2);

  // Second dispose should be safe
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(buffer.length, 2);

  // Third dispose should be safe
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(buffer.length, 2);
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
  assert.strictEqual(maxConcurrentCalls, 1);
  assert.strictEqual(buffer.length, 5);
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
  assert.strictEqual(errorCount, 1);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer, [trace, info]);
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
  assert.strictEqual(buffer.length, 0);

  // Wait for dispose to complete
  await disposePromise;

  // Now all records should be processed
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer, [trace, debug]);
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
  assert.ok(true);
});

test("fromAsyncSink() - errors are logged to meta logger", async () => {
  const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
  const metaBuffer: LogRecord[] = [];
  metaLogger.sinks.push(metaBuffer.push.bind(metaBuffer));
  const originalLowestLevel = metaLogger.lowestLevel;
  metaLogger.lowestLevel = "error";

  try {
    const asyncSink: AsyncSink = async (_record) => {
      await Promise.resolve();
      throw new Error("Async sink error");
    };

    const sink = fromAsyncSink(asyncSink);
    sink(error);

    // Wait for the async promise chain to settle
    await sink[Symbol.asyncDispose]();

    // Verify error was logged to meta logger
    assert.strictEqual(metaBuffer.length, 1);
    const metaRecord = metaBuffer[0];
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "error");
    const errorProp = metaRecord.properties.error as Error;
    assert.strictEqual(errorProp.message, "Async sink error");
    assert.strictEqual(metaRecord.properties.sink, asyncSink);
    assert.deepStrictEqual(metaRecord.properties.record, error);
  } finally {
    metaLogger.sinks.pop();
    metaLogger.lowestLevel = originalLowestLevel;
  }
});

test("fromAsyncSink() - does not recursively call failing sink via meta logger", async () => {
  const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
  const originalLowestLevel = metaLogger.lowestLevel;
  metaLogger.lowestLevel = "error";

  let callCount = 0;
  const asyncSink: AsyncSink = async (_record) => {
    callCount++;
    await Promise.resolve();
    throw new Error("Async sink error");
  };

  const sink = fromAsyncSink(asyncSink);

  // Simulate the failing sink being attached to the meta logger
  // (which inherits sinks from ancestor loggers by default)
  metaLogger.sinks.push(sink);

  try {
    sink(error);
    await sink[Symbol.asyncDispose]();

    // The bypass set prevents the meta logger from calling the
    // failing sink with the error report, avoiding recursion
    assert.strictEqual(callCount, 1);
  } finally {
    metaLogger.sinks.pop();
    metaLogger.lowestLevel = originalLowestLevel;
  }
});

test("fromAsyncSink() - suppresses error reporting for meta-logger records", async () => {
  const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
  const metaBuffer: LogRecord[] = [];
  const originalLowestLevel = metaLogger.lowestLevel;
  metaLogger.lowestLevel = "error";

  let callCount = 0;
  const asyncSink: AsyncSink = async (_record) => {
    callCount++;
    await Promise.resolve();
    throw new Error("Async sink error");
  };

  const rawSink = fromAsyncSink(asyncSink);
  const wrappedSink = withFilter(rawSink, "error");
  metaLogger.sinks.push(wrappedSink);
  metaLogger.sinks.push(metaBuffer.push.bind(metaBuffer));

  try {
    wrappedSink(error);
    const disposableSink = wrappedSink as Sink & Partial<AsyncDisposable>;
    await disposableSink[Symbol.asyncDispose]?.();

    // The error should be logged exactly once to the meta buffer
    assert.strictEqual(metaBuffer.length, 1);
    // The async sink is called twice: once for the original record
    // and once for the meta record (which is suppressed by the guard)
    assert.strictEqual(callCount, 2);
  } finally {
    metaLogger.sinks.pop();
    metaLogger.sinks.pop();
    metaLogger.lowestLevel = originalLowestLevel;
  }
});

test("fromAsyncSink() - meta-child records are not suppressed by marker", async () => {
  const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
  const metaBuffer: LogRecord[] = [];
  const originalLowestLevel = metaLogger.lowestLevel;
  metaLogger.lowestLevel = "error";
  metaLogger.sinks.push(metaBuffer.push.bind(metaBuffer));

  const asyncSink: AsyncSink = async (_record) => {
    await Promise.resolve();
    throw new Error("Async sink error");
  };

  const sink = fromAsyncSink(asyncSink);

  // Create a record with a meta-child category
  const metaChildRecord: LogRecord = {
    ...error,
    category: ["logtape", "meta", "child"],
  };

  try {
    sink(metaChildRecord);
    await sink[Symbol.asyncDispose]();

    // Errors from meta-child records should still be reported
    assert.strictEqual(metaBuffer.length, 1);
    const metaRecord = metaBuffer[0];
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "error");
  } finally {
    metaLogger.sinks.pop();
    metaLogger.lowestLevel = originalLowestLevel;
  }
});

interface GatedCall {
  readonly record: LogRecord;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

function createGatedAsyncSink(): {
  readonly asyncSink: AsyncSink;
  readonly calls: GatedCall[];
} {
  const calls: GatedCall[] = [];
  const asyncSink: AsyncSink = (record) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ record, resolve, reject });
    });
  return { asyncSink, calls };
}

function makeRecord(index: number): LogRecord {
  return { ...info, properties: { index } };
}

function indexOf(record: LogRecord): unknown {
  return record.properties.index;
}

async function withMetaSink<T>(
  metaSink: Sink,
  callback: () => Promise<T>,
): Promise<T> {
  const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
  const originalLowestLevel = metaLogger.lowestLevel;
  metaLogger.lowestLevel = "error";
  metaLogger.sinks.push(metaSink);
  try {
    return await callback();
  } finally {
    metaLogger.sinks.splice(metaLogger.sinks.indexOf(metaSink), 1);
    metaLogger.lowestLevel = originalLowestLevel;
  }
}

function trackSettled(promise: Promise<void>): { settled: boolean } {
  const state = { settled: false };
  promise.then(() => {
    state.settled = true;
  });
  return state;
}

test("fromAsyncSink() - does not call the async sink inside the logging call", async () => {
  let called = false;
  const asyncSink = ((_record: LogRecord) => {
    called = true;
    return Promise.resolve();
  }) as AsyncSink;
  const sink = fromAsyncSink(asyncSink, { maxQueueSize: 1 });
  sink(info);
  assert.strictEqual(called, false);
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(called, true);
});

test("fromAsyncSink() - reports non-Promise throws, including falsy values", async () => {
  const metaBuffer: LogRecord[] = [];
  await withMetaSink(metaBuffer.push.bind(metaBuffer), async () => {
    const thrown: unknown[] = [new Error("direct"), undefined, null];
    const delivered: unknown[] = [];
    const asyncSink = ((record: LogRecord) => {
      const index = indexOf(record) as number;
      if (index < thrown.length) throw thrown[index];
      delivered.push(index);
      return Promise.resolve();
    }) as AsyncSink;
    const sink = fromAsyncSink(asyncSink);
    for (let i = 0; i < 4; i++) sink(makeRecord(i));
    await sink[Symbol.asyncDispose]();
    assert.deepStrictEqual(delivered, [3]);
    assert.deepStrictEqual(
      metaBuffer.map((r) => r.properties.error),
      thrown,
    );
  });
});

test("fromAsyncSink() - rejects invalid options", () => {
  const asyncSink: AsyncSink = () => Promise.resolve();
  for (const maxQueueSize of [0, -1, 1.5, NaN, -Infinity]) {
    assert.throws(() => fromAsyncSink(asyncSink, { maxQueueSize }), RangeError);
  }
  assert.throws(
    () =>
      fromAsyncSink(asyncSink, {
        overflow: "drop-random" as AsyncSinkOverflowPolicy,
      }),
    TypeError,
  );
  fromAsyncSink(asyncSink, { maxQueueSize: Infinity });
  fromAsyncSink(asyncSink, { maxQueueSize: 1, overflow: "drop-newest" });
});

test("fromAsyncSink() - drop-oldest keeps the record being processed", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  const drops: SinkDropEvent[] = [];
  const sink = fromAsyncSink(asyncSink, {
    maxQueueSize: 2,
    onDrop: (event) => drops.push(event),
  });
  for (let i = 0; i < 3; i++) sink(makeRecord(i));
  assert.deepStrictEqual(drops, []);
  await delay(0);
  assert.strictEqual(calls.length, 1); // record 0 is being processed

  sink(makeRecord(3)); // the queue (1, 2) is full: record 1 is dropped
  // onDrop is called synchronously, without the dropped record:
  assert.deepStrictEqual(drops, [{ count: 1, reason: "overflow" }]);
  sink(makeRecord(4)); // record 2 is dropped
  assert.strictEqual(drops.length, 2);

  for (let i = 0; i < 3; i++) {
    calls[i].resolve();
    await delay(0);
  }
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(calls.map((c) => indexOf(c.record)), [0, 3, 4]);
});

test("fromAsyncSink() - drop-newest rejects the incoming record", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  const drops: SinkDropEvent[] = [];
  const registered: Promise<void>[] = [];
  const sink = fromAsyncSink(asyncSink, {
    maxQueueSize: 1,
    overflow: "drop-newest",
    onDrop: (event) => drops.push(event),
    waitUntil: (promise) => registered.push(promise),
  });
  sink(makeRecord(0));
  sink(makeRecord(1));
  assert.strictEqual(registered.length, 2);
  sink(makeRecord(2)); // rejected
  sink(makeRecord(3)); // rejected
  assert.strictEqual(registered.length, 2);
  assert.deepStrictEqual(drops, [
    { count: 1, reason: "overflow" },
    { count: 1, reason: "overflow" },
  ]);
  await delay(0);
  calls[0].resolve();
  await delay(0);
  calls[1].resolve();
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(calls.map((c) => indexOf(c.record)), [0, 1]);
});

test("fromAsyncSink() - sustained eviction behind a stalled record", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  let dropped = 0;
  const sink = fromAsyncSink(asyncSink, {
    maxQueueSize: 2,
    onDrop: ({ count }) => {
      dropped += count;
    },
  });
  for (let i = 0; i < 1000; i++) sink(makeRecord(i));
  await delay(0);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(dropped, 997);
  for (let i = 0; i < 3; i++) {
    calls[i].resolve();
    await delay(0);
  }
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(calls.map((c) => indexOf(c.record)), [0, 998, 999]);
});

const gc: (() => void) | undefined = (globalThis as { gc?: () => void }).gc ??
  ((globalThis as { Bun?: { gc(force: boolean): void } }).Bun == null
    ? undefined
    : () =>
      (globalThis as { Bun?: { gc(force: boolean): void } }).Bun!.gc(
        true,
      ));

test(
  "fromAsyncSink() - drop-oldest releases dropped records",
  { skip: typeof gc !== "function" },
  async () => {
    // Needs --expose-gc (Node.js) or --v8-flags=--expose-gc (Deno).
    if (typeof gc !== "function") return;
    const { asyncSink, calls } = createGatedAsyncSink();
    const sink = fromAsyncSink(asyncSink, { maxQueueSize: 1 });
    sink(makeRecord(0));
    let dropped: LogRecord | undefined = makeRecord(1);
    const ref = new WeakRef(dropped);
    sink(dropped);
    dropped = undefined;
    sink(makeRecord(2)); // drops record 1 while record 0 is still pending
    await delay(0);
    gc();
    await delay(0);
    gc();
    assert.strictEqual(ref.deref(), undefined);
    calls[0].resolve();
    await delay(0);
    calls[1].resolve();
    await sink[Symbol.asyncDispose]();
  },
);

test("fromAsyncSink() - waitUntil receives a prefix promise synchronously", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  const registered: Promise<void>[] = [];
  const sink = fromAsyncSink(asyncSink, {
    waitUntil: (promise) => registered.push(promise),
  });
  sink(makeRecord(0));
  assert.strictEqual(registered.length, 1);
  sink(makeRecord(1));
  sink(makeRecord(2));
  assert.strictEqual(registered.length, 3);
  assert.strictEqual(new Set(registered).size, 3);
  const states = registered.map(trackSettled);

  await delay(0);
  calls[0].resolve();
  await delay(0);
  assert.deepStrictEqual(states.map((s) => s.settled), [true, false, false]);
  calls[1].resolve();
  await delay(0);
  // Record 1's promise does not wait for record 2, which is still pending:
  assert.deepStrictEqual(states.map((s) => s.settled), [true, true, false]);
  calls[2].resolve();
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(states.map((s) => s.settled), [true, true, true]);
});

test("fromAsyncSink() - waitUntil promises of dropped records", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  const registered: Promise<void>[] = [];
  const sink = fromAsyncSink(asyncSink, {
    maxQueueSize: 1,
    waitUntil: (promise) => registered.push(promise),
  });
  sink(makeRecord(0)); // being processed
  sink(makeRecord(1)); // dropped by record 2
  sink(makeRecord(2)); // dropped by record 3
  sink(makeRecord(3));
  const states = registered.map(trackSettled);
  await delay(0);
  assert.deepStrictEqual(states.map((s) => s.settled), [
    false,
    false,
    false,
    false,
  ]);
  calls[0].resolve();
  await delay(0);
  // The dropped records' promises settle once record 0 has finished, while
  // record 3 is still being processed:
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(states.map((s) => s.settled), [
    true,
    true,
    true,
    false,
  ]);
  calls[1].resolve();
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(calls.map((c) => indexOf(c.record)), [0, 3]);
  assert.ok(states.every((s) => s.settled));
});

test("fromAsyncSink() - waitUntil promise fulfills after a failure is reported", async () => {
  const metaBuffer: LogRecord[] = [];
  await withMetaSink(metaBuffer.push.bind(metaBuffer), async () => {
    const registered: Promise<void>[] = [];
    const asyncSink: AsyncSink = async () => {
      await Promise.resolve();
      throw new Error("Async sink error");
    };
    const sink = fromAsyncSink(asyncSink, {
      waitUntil: (promise) => registered.push(promise),
    });
    sink(error);
    await registered[0]; // must not reject
    assert.strictEqual(metaBuffer.length, 1);
    assert.strictEqual(
      (metaBuffer[0].properties.error as Error).message,
      "Async sink error",
    );
    await sink[Symbol.asyncDispose]();
  });
});

test("fromAsyncSink() - runs each record in its own async context", async () => {
  const storage = new AsyncLocalStorage<string>();
  for (const options of [{}, { maxQueueSize: 1 }] as AsyncSinkOptions[]) {
    const seenBySink: [unknown, string | undefined][] = [];
    const seenByWaitUntil: [string | undefined, Promise<void>][] = [];
    const seenByMeta: [unknown, string | undefined][] = [];
    const metaSink: Sink = (record) => {
      const failed = record.properties.record as LogRecord;
      seenByMeta.push([indexOf(failed), storage.getStore()]);
    };
    await withMetaSink(metaSink, async () => {
      const { asyncSink, calls } = createGatedAsyncSink();
      const sink = fromAsyncSink(
        (record) => {
          seenBySink.push([indexOf(record), storage.getStore()]);
          return asyncSink(record);
        },
        {
          ...options,
          waitUntil: (promise) =>
            seenByWaitUntil.push([storage.getStore(), promise]),
        },
      );
      storage.run("request-a", () => sink(makeRecord(0)));
      storage.run("request-b", () => sink(makeRecord(1)));
      await delay(0);
      calls[0].reject(new Error("failed"));
      await delay(0);
      calls[1].resolve();
      await sink[Symbol.asyncDispose]();
    });
    assert.deepStrictEqual(seenBySink, [[0, "request-a"], [1, "request-b"]]);
    assert.deepStrictEqual(
      seenByWaitUntil.map(([store]) => store),
      ["request-a", "request-b"],
    );
    assert.deepStrictEqual(seenByMeta, [[0, "request-a"]]);
  }
});

test("fromAsyncSink() - callback errors do not escape the logging call", async () => {
  const metaBuffer: LogRecord[] = [];
  await withMetaSink(metaBuffer.push.bind(metaBuffer), async () => {
    const delivered: unknown[] = [];
    const sink = fromAsyncSink(
      (record) => {
        delivered.push(indexOf(record));
        return Promise.resolve();
      },
      {
        maxQueueSize: 1,
        onDrop: () => {
          throw new Error("onDrop failed");
        },
        waitUntil: () => {
          throw new Error("waitUntil failed");
        },
      },
    );
    sink(makeRecord(0));
    sink(makeRecord(1));
    sink(makeRecord(2)); // drops record 1
    await sink[Symbol.asyncDispose]();
    assert.deepStrictEqual(delivered, [0, 2]);
    assert.deepStrictEqual(
      metaBuffer.map((r) => [r.properties.callback, `${r.properties.error}`]),
      [
        ["waitUntil", "Error: waitUntil failed"],
        ["waitUntil", "Error: waitUntil failed"],
        ["onDrop", "Error: onDrop failed"],
        ["waitUntil", "Error: waitUntil failed"],
      ],
    );
    assert.deepStrictEqual(metaBuffer[0].category, ["logtape", "meta"]);
    assert.strictEqual(metaBuffer[0].level, "error");
  });
});

test("fromAsyncSink() - failing waitUntil routed back to the sink does not recurse", async () => {
  const delivered: LogRecord[] = [];
  let calls = 0;
  const rawSink = fromAsyncSink(
    (record) => {
      delivered.push(record);
      return Promise.resolve();
    },
    {
      maxQueueSize: 1,
      overflow: "drop-newest",
      waitUntil: () => {
        calls++;
        throw new Error("No request context");
      },
    },
  );
  // withFilter() wraps the sink, so the meta logger's bypass set does not
  // stop the report from reaching the adapter again:
  const wrappedSink = withFilter(rawSink, "info");
  await withMetaSink(wrappedSink, async () => {
    wrappedSink(info);
    // info is accepted, its waitUntil fails, the report is accepted too and
    // its waitUntil fails without being reported again:
    assert.strictEqual(calls, 2);
    wrappedSink(warning); // the queue is full: rejected without waitUntil
    assert.strictEqual(calls, 2);
    await rawSink[Symbol.asyncDispose]();
  });
  assert.strictEqual(delivered.length, 2);
  assert.strictEqual(delivered[0], info);
  assert.deepStrictEqual(delivered[1].category, ["logtape", "meta"]);
  assert.strictEqual(delivered[1].properties.callback, "waitUntil");
});

test("fromAsyncSink() - rejections of async callbacks are reported", async () => {
  const metaBuffer: LogRecord[] = [];
  await withMetaSink(metaBuffer.push.bind(metaBuffer), async () => {
    const sink = fromAsyncSink(() => Promise.resolve(), {
      maxQueueSize: 1,
      onDrop: async () => {
        await Promise.resolve();
        throw new Error("onDrop rejected");
      },
      waitUntil: async () => {
        await Promise.resolve();
        throw new Error("waitUntil rejected");
      },
    });
    sink(makeRecord(0));
    sink(makeRecord(1));
    sink(makeRecord(2)); // drops record 1
    await sink[Symbol.asyncDispose]();
    await delay(0);
    assert.deepStrictEqual(
      metaBuffer.map((r) => [r.properties.callback, `${r.properties.error}`])
        .sort(),
      [
        ["onDrop", "Error: onDrop rejected"],
        ["waitUntil", "Error: waitUntil rejected"],
        ["waitUntil", "Error: waitUntil rejected"],
        ["waitUntil", "Error: waitUntil rejected"],
      ],
    );
  });
});

test("fromAsyncSink() - callback results that cannot be inspected are contained", async () => {
  const metaBuffer: LogRecord[] = [];
  await withMetaSink(metaBuffer.push.bind(metaBuffer), async () => {
    const registered: Promise<void>[] = [];
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const sink = fromAsyncSink(() => Promise.resolve(), {
      maxQueueSize: 1,
      onDrop: () => proxy as unknown as void,
      waitUntil: (promise) => {
        registered.push(promise);
        return {
          get then(): never {
            throw new Error("then getter failed");
          },
        } as unknown as void;
      },
    });
    sink(makeRecord(0));
    sink(makeRecord(1));
    sink(makeRecord(2)); // drops record 1; onDrop returns a revoked proxy
    // The logging calls did not throw, and record 2 was still registered:
    assert.strictEqual(registered.length, 3);
    await sink[Symbol.asyncDispose]();
    assert.deepStrictEqual(
      metaBuffer.map((r) => r.properties.callback),
      ["waitUntil", "waitUntil", "onDrop", "waitUntil"],
    );
  });
});

test("fromAsyncSink() - rejecting waitUntil routed back to the sink does not loop", async () => {
  const delivered: LogRecord[] = [];
  let calls = 0;
  const rawSink = fromAsyncSink(
    (record) => {
      delivered.push(record);
      return Promise.resolve();
    },
    {
      waitUntil: async () => {
        calls++;
        await Promise.resolve();
        throw new Error("No request context");
      },
    },
  );
  const wrappedSink = withFilter(rawSink, "info");
  await withMetaSink(wrappedSink, async () => {
    wrappedSink(info);
    for (let i = 0; i < 5; i++) {
      await rawSink[Symbol.asyncDispose]();
      await delay(0);
    }
  });
  // info's rejection is reported once; the report's own rejection is not:
  assert.strictEqual(calls, 2);
  assert.strictEqual(delivered.length, 2);
  assert.strictEqual(delivered[0], info);
  assert.strictEqual(delivered[1].properties.callback, "waitUntil");
});

test("fromAsyncSink() - drops caused inside onDrop are carried over", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  const drops: SinkDropEvent[] = [];
  let logInsideOnDrop = true;
  const sink: Sink & AsyncDisposable = fromAsyncSink(asyncSink, {
    maxQueueSize: 1,
    overflow: "drop-newest",
    onDrop: (event) => {
      drops.push(event);
      // Logging through the same sink while it is full drops again:
      if (logInsideOnDrop) sink(warning);
    },
  });
  sink(makeRecord(0));
  sink(makeRecord(1));
  sink(makeRecord(2)); // dropped; the warning logged in onDrop is dropped too
  assert.deepStrictEqual(drops, [{ count: 1, reason: "overflow" }]);
  sink(makeRecord(3)); // dropped; reported together with the carried drop
  // (its own onDrop call logs another warning, which is carried again)
  assert.deepStrictEqual(drops.slice(1), [{ count: 2, reason: "overflow" }]);

  logInsideOnDrop = false;
  sink(makeRecord(4)); // dropped; reported with the drop carried above
  assert.deepStrictEqual(drops.slice(2), [{ count: 2, reason: "overflow" }]);

  logInsideOnDrop = true;
  sink(makeRecord(5)); // carries one drop again
  assert.strictEqual(drops.length, 4);
  logInsideOnDrop = false;
  await delay(0);
  calls[0].resolve();
  await delay(0);
  calls[1].resolve();
  // The carried drop is reported once on disposal:
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(drops.slice(4), [{ count: 1, reason: "overflow" }]);
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(drops.length, 5);
});

test("fromAsyncSink() - disposal reports carried drops at most once per call", async () => {
  const drops: SinkDropEvent[] = [];
  let logInsideOnDrop = true;
  const sink: Sink & AsyncDisposable = fromAsyncSink(() => delay(1), {
    maxQueueSize: 1,
    overflow: "drop-newest",
    onDrop: (event) => {
      drops.push(event);
      // Logs more than the queue can take, causing further drops:
      if (logInsideOnDrop) { for (let i = 0; i < 3; i++) sink(warning); }
    },
  });
  sink(makeRecord(0));
  sink(makeRecord(1));
  sink(makeRecord(2)); // dropped; 3 more drops carried
  assert.deepStrictEqual(drops, [{ count: 1, reason: "overflow" }]);
  // The first disposal reports the 3 carried drops once; the warnings that
  // notification logs are partly dropped again, and those are left for later:
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(drops.length, 2);
  assert.deepStrictEqual(drops[1], { count: 3, reason: "overflow" });
  logInsideOnDrop = false;
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(drops.slice(2), [{ count: 1, reason: "overflow" }]);
  await sink[Symbol.asyncDispose]();
  assert.strictEqual(drops.length, 3);
});

test("fromAsyncSink() - onDrop may drop the record that caused it", async () => {
  const { asyncSink, calls } = createGatedAsyncSink();
  const registered: Promise<void>[] = [];
  let reentered = false;
  const sink: Sink & AsyncDisposable = fromAsyncSink(asyncSink, {
    maxQueueSize: 1,
    onDrop: () => {
      if (reentered) return;
      reentered = true;
      sink(warning); // drops the record whose acceptance called onDrop
    },
    waitUntil: (promise) => registered.push(promise),
  });
  sink(makeRecord(0));
  sink(makeRecord(1));
  sink(makeRecord(2)); // drops 1; onDrop logs warning, which drops 2
  // Record 2 is still registered (after warning, as onDrop ran first):
  assert.strictEqual(registered.length, 4);
  const states = registered.map(trackSettled);
  await delay(0);
  calls[0].resolve();
  await delay(0);
  // Records 1 and 2 were dropped; their promises settle with record 0,
  // while the warning is still being processed:
  assert.deepStrictEqual(states.map((s) => s.settled), [
    true,
    true,
    false,
    true,
  ]);
  calls[1].resolve();
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(calls.map((c) => c.record), [makeRecord(0), warning]);
});

test("fromAsyncSink() - failure reports can refill an empty queue", async () => {
  const delivered: LogRecord[] = [];
  const rawSink = fromAsyncSink(
    async (record) => {
      await Promise.resolve();
      delivered.push(record);
      if (record === error) throw new Error("Async sink error");
    },
    { maxQueueSize: 1 },
  );
  const wrappedSink = withFilter(rawSink, "info");
  await withMetaSink(wrappedSink, async () => {
    wrappedSink(error);
    // The failure report re-enters the adapter right after the failed
    // record has left the queue:
    await rawSink[Symbol.asyncDispose]();
    assert.strictEqual(delivered.length, 2);
    assert.deepStrictEqual(delivered[1].category, ["logtape", "meta"]);
    wrappedSink(info);
    wrappedSink(warning);
    await rawSink[Symbol.asyncDispose]();
    assert.deepStrictEqual(delivered.slice(2), [info, warning]);
  });
});

test("fromAsyncSink() - a throwing meta sink does not break the chain", async () => {
  const registered: Promise<void>[] = [];
  const delivered: unknown[] = [];
  await withMetaSink(() => {
    throw new Error("Meta sink failed");
  }, async () => {
    const sink = fromAsyncSink(
      async (record) => {
        await Promise.resolve();
        if (indexOf(record) === 0) throw new Error("Async sink error");
        delivered.push(indexOf(record));
      },
      { waitUntil: (promise) => registered.push(promise) },
    );
    sink(makeRecord(0));
    sink(makeRecord(1));
    await registered[0];
    await registered[1];
    await sink[Symbol.asyncDispose]();
  });
  assert.deepStrictEqual(delivered, [1]);
});

test("fromAsyncSink() - a failing record that cannot be inspected does not break the chain", async () => {
  const delivered: unknown[] = [];
  const registered: Promise<void>[] = [];
  const { proxy, revoke } = Proxy.revocable({ ...makeRecord(0) }, {});
  const sink = fromAsyncSink(
    async (record) => {
      await Promise.resolve();
      if (record === proxy) {
        revoke();
        throw new Error("Async sink error");
      }
      delivered.push(indexOf(record));
    },
    { waitUntil: (promise) => registered.push(promise) },
  );
  sink(proxy);
  sink(makeRecord(1));
  await registered[0]; // must not reject
  await registered[1];
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(delivered, [1]);
});

test("fromAsyncSink() - disposal waits for records logged while it resumes", async () => {
  const delivered: unknown[] = [];
  const registered: Promise<void>[] = [];
  const sink = fromAsyncSink(async (record) => {
    await Promise.resolve();
    delivered.push(indexOf(record));
  }, { waitUntil: (promise) => registered.push(promise) });
  sink(makeRecord(0));
  // This reaction is registered before the disposer awaits the same promise,
  // so it logs right after the chain settles and before the disposer resumes:
  registered[0].then(() => sink(makeRecord(1)));
  await sink[Symbol.asyncDispose]();
  assert.deepStrictEqual(delivered, [0, 1]);
});

test("fromAsyncSink() - concurrent and idle disposal", async () => {
  const sink = fromAsyncSink(() => delay(5), { maxQueueSize: 1 });
  await sink[Symbol.asyncDispose](); // idle
  sink(makeRecord(0));
  sink(makeRecord(1));
  sink(makeRecord(2));
  await Promise.all([
    sink[Symbol.asyncDispose](),
    sink[Symbol.asyncDispose](),
  ]);
});

test("fingersCrossed() forwards Symbol.dispose", () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const rawSink = getConsoleSink({
    console: mock,
    nonBlocking: {
      bufferSize: 100,
      flushInterval: 1000,
    },
  });
  const sink = fingersCrossed(rawSink) as Sink & Partial<Disposable>;

  sink(error);
  assert.strictEqual(mock.history().length, 0);

  sink[Symbol.dispose]?.();

  assert.strictEqual(mock.history().length, 1);
});

test("fingersCrossed() forwards Symbol.asyncDispose", async () => {
  const rawSink = ((_record: LogRecord) => {}) as
    & Sink
    & AsyncDisposable
    & { disposed: boolean };
  rawSink.disposed = false;
  rawSink[Symbol.asyncDispose] = async function (this: typeof rawSink) {
    await Promise.resolve();
    assert.strictEqual(this, rawSink);
    this.disposed = true;
  };

  const sink = fingersCrossed(rawSink);

  await sink[Symbol.asyncDispose]();

  assert.strictEqual(rawSink.disposed, true);
});

test("fingersCrossed() composes TTL and wrapped sink disposal", () => {
  const rawSink = ((_record: LogRecord) => {}) as
    & Sink
    & Disposable
    & { disposed: boolean };
  rawSink.disposed = false;
  rawSink[Symbol.dispose] = function (this: typeof rawSink) {
    assert.strictEqual(this, rawSink);
    this.disposed = true;
  };
  const sink = fingersCrossed(rawSink, {
    isolateByContext: {
      keys: ["requestId"],
      bufferTtlMs: 100,
    },
  }) as Sink & Disposable;

  sink[Symbol.dispose]();

  assert.strictEqual(rawSink.disposed, true);
});

test("fingersCrossed() composes TTL and async sink disposal", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;
  let cleanupTimerCleared = false;
  globalThis.setInterval = ((callback: () => void, delay?: number) => {
    cleanupTimer = originalSetInterval(callback, delay);
    return cleanupTimer;
  }) as typeof setInterval;
  globalThis.clearInterval = ((timer: ReturnType<typeof setInterval>) => {
    if (timer === cleanupTimer) cleanupTimerCleared = true;
    originalClearInterval(timer);
  }) as typeof clearInterval;

  try {
    const rawSink = ((_record: LogRecord) => {}) as Sink & AsyncDisposable;
    let disposed = false;
    rawSink[Symbol.asyncDispose] = async () => {
      await Promise.resolve();
      disposed = true;
    };
    const sink = fingersCrossed(rawSink, {
      isolateByContext: {
        keys: ["requestId"],
        bufferTtlMs: 100,
      },
    });

    await sink[Symbol.asyncDispose]();

    assert.strictEqual(disposed, true);
    assert.strictEqual(cleanupTimerCleared, true);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    if (!cleanupTimerCleared) originalClearInterval(cleanupTimer);
  }
});

test("fingersCrossed() - basic functionality", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // Add debug and info logs - should be buffered
  sink(trace);
  sink(debug);
  sink(info);
  assert.strictEqual(buffer.length, 0); // Not flushed yet

  // Add warning - still buffered (default trigger is error)
  sink(warning);
  assert.strictEqual(buffer.length, 0);

  // Add error - should trigger flush
  sink(error);
  assert.deepStrictEqual(buffer, [trace, debug, info, warning, error]);

  // After trigger, logs pass through directly
  sink(fatal);
  assert.deepStrictEqual(buffer, [trace, debug, info, warning, error, fatal]);
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
  assert.strictEqual(buffer.length, 0);

  // Warning should trigger flush
  sink(warning);
  assert.deepStrictEqual(buffer, [trace, debug, info, warning]);

  // Subsequent logs pass through
  sink(error);
  assert.deepStrictEqual(buffer, [trace, debug, info, warning, error]);
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
  assert.strictEqual(buffer.length, 0); // Still buffered

  // Trigger flush
  sink(error);
  // Should only have last 3 records + error
  assert.deepStrictEqual(buffer, [debug, info, warning, error]);
});

test("fingersCrossed() - multiple trigger events", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // First batch
  sink(debug);
  sink(info);
  sink(error); // Trigger
  assert.deepStrictEqual(buffer, [debug, info, error]);

  // After trigger, everything passes through
  sink(debug);
  assert.deepStrictEqual(buffer, [debug, info, error, debug]);

  sink(error); // Another error
  assert.deepStrictEqual(buffer, [debug, info, error, debug, error]);
});

test("fingersCrossed() - trigger includes fatal", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    triggerLevel: "error",
  });

  sink(debug);
  sink(info);
  assert.strictEqual(buffer.length, 0);

  // Fatal should also trigger (since it's >= error)
  sink(fatal);
  assert.deepStrictEqual(buffer, [debug, info, fatal]);
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
  assert.strictEqual(buffer.length, 0);

  // Trigger in parent category
  sink(appError);

  // Should flush parent and all descendants, but not other
  assert.strictEqual(buffer.length, 4); // app, app.module, app.module.sub, and trigger
  assert.ok(buffer.includes(appDebug));
  assert.ok(buffer.includes(appModuleDebug));
  assert.ok(buffer.includes(appModuleSubDebug));
  assert.ok(buffer.includes(appError));
  assert.ok(!buffer.includes(otherDebug));
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
  assert.strictEqual(buffer.length, 0);

  // Trigger in child category
  sink(appModuleSubError);

  // Should flush child and all ancestors
  assert.strictEqual(buffer.length, 4);
  assert.ok(buffer.includes(appDebug));
  assert.ok(buffer.includes(appModuleDebug));
  assert.ok(buffer.includes(appModuleSubDebug));
  assert.ok(buffer.includes(appModuleSubError));
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
  assert.strictEqual(buffer.length, 0);

  // Trigger in middle category
  sink(parentError);

  // Should flush ancestors and descendants, but not siblings or unrelated
  assert.strictEqual(buffer.length, 4);
  assert.ok(buffer.includes(rootDebug)); // Ancestor
  assert.ok(buffer.includes(parentDebug)); // Same
  assert.ok(buffer.includes(childDebug)); // Descendant
  assert.ok(buffer.includes(parentError)); // Trigger
  assert.ok(!buffer.includes(siblingDebug)); // Sibling
  assert.ok(!buffer.includes(unrelatedDebug)); // Unrelated
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
  assert.strictEqual(buffer.length, 0);

  // Trigger
  sink(appError);

  // Should flush all with same first category element
  assert.strictEqual(buffer.length, 3);
  assert.ok(buffer.includes(app1Debug));
  assert.ok(buffer.includes(app2Debug));
  assert.ok(buffer.includes(appError));
  assert.ok(!buffer.includes(otherDebug));
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
  assert.deepStrictEqual(buffer, [app1Debug, app1Error]);

  // Buffer in app2 (should still be buffering)
  sink(app2Debug);
  assert.deepStrictEqual(buffer, [app1Debug, app1Error]); // app2 still buffered

  // Add more to triggered app1 (should pass through)
  sink(app1Debug);
  assert.deepStrictEqual(buffer, [app1Debug, app1Error, app1Debug]);

  // app2 still buffering
  sink(app2Info);
  assert.deepStrictEqual(buffer, [app1Debug, app1Error, app1Debug]); // app2 still buffered
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
  assert.deepStrictEqual(buffer, [app1, app2, app3, app4, appError]);
});

test("fingersCrossed() - empty buffer trigger", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // Trigger immediately without any buffered logs
  sink(error);
  assert.deepStrictEqual(buffer, [error]);

  // Continue to pass through
  sink(debug);
  assert.deepStrictEqual(buffer, [error, debug]);
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
  assert.strictEqual(buffer.length, 3);
  assert.ok(!buffer.some((r) => r === app1Trace)); // Dropped
  assert.ok(buffer.includes(app1Debug));
  assert.ok(buffer.includes(app1Info));
  assert.ok(buffer.includes(app1Error));
  // app2 records should not be flushed
  assert.ok(!buffer.includes(app2Trace));
  assert.ok(!buffer.includes(app2Debug));
});

test("fingersCrossed() - edge case: trigger level not in severity order", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    triggerLevel: "trace", // Lowest level triggers immediately
  });

  // Everything should pass through immediately
  sink(trace);
  assert.deepStrictEqual(buffer, [trace]);

  sink(debug);
  assert.deepStrictEqual(buffer, [trace, debug]);
});

test("fingersCrossed() - edge case: invalid trigger level", () => {
  const buffer: LogRecord[] = [];

  // Should throw TypeError during sink creation
  assert.throws(
    () => {
      fingersCrossed(buffer.push.bind(buffer), {
        triggerLevel: "invalid" as LogLevel,
      });
    },
    TypeError,
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
  assert.strictEqual(buffer.length, 0); // Still buffered

  sink(error);
  assert.strictEqual(buffer.length, 1001); // All 1000 + error
});

test("fingersCrossed() - edge case: zero buffer size", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: 0,
  });

  // Nothing should be buffered
  sink(debug);
  sink(info);
  assert.strictEqual(buffer.length, 0);

  // Trigger should still work
  sink(error);
  assert.deepStrictEqual(buffer, [error]); // Only the trigger
});

test("fingersCrossed() - edge case: negative buffer size", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    maxBufferSize: -1,
  });

  // Should behave like zero
  sink(debug);
  sink(info);
  assert.strictEqual(buffer.length, 0);

  sink(error);
  assert.deepStrictEqual(buffer, [error]);
});

test("fingersCrossed() - edge case: same record logged multiple times", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer));

  // Log same record multiple times
  sink(debug);
  sink(debug);
  sink(debug);
  assert.strictEqual(buffer.length, 0);

  sink(error);
  // All instances should be preserved
  assert.strictEqual(buffer.length, 4);
  assert.deepStrictEqual(buffer, [debug, debug, debug, error]);
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
  assert.strictEqual(buffer.length, 0);

  // Trigger with empty category
  sink(emptyError);

  // Only empty category should flush (no ancestors/descendants)
  assert.strictEqual(buffer.length, 2);
  assert.ok(buffer.includes(emptyCategory));
  assert.ok(buffer.includes(emptyError));
  assert.ok(!buffer.includes(normalCategory));
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
  assert.strictEqual(buffer.length, 0);

  // Should still work correctly despite special characters
  sink(specialError);

  assert.strictEqual(buffer.length, 2);
  assert.ok(buffer.includes(specialCategory));
  assert.ok(buffer.includes(specialError));
  assert.ok(!buffer.includes(normalCategory));
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
  assert.strictEqual(buffer.length, 2); // app1Debug + app1Error

  sink(app2Error); // Trigger app2
  assert.strictEqual(buffer.length, 4); // Previous + app2Debug + app2Error

  // After both triggered, everything passes through
  sink(app1Debug);
  sink(app2Debug);
  assert.strictEqual(buffer.length, 6);
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
  assert.ok(buffer.includes(app1Error));
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
  assert.strictEqual(buffer.length, 0);

  // Should flush all despite circular logic
  sink(trigger);
  assert.strictEqual(buffer.length, 4);

  // All buffers should be cleared after flush
  const newDebug: LogRecord = { ...debug, category: ["new"] };
  sink(newDebug);
  assert.strictEqual(buffer.length, 4); // New category should be buffered
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
  assert.deepStrictEqual(buffer[0], past);
  assert.deepStrictEqual(buffer[1], present);
  assert.deepStrictEqual(buffer[2], future);
  assert.deepStrictEqual(buffer[3], trigger);
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
  assert.strictEqual(buffer.length, 4);
  assert.ok(buffer.includes(nanTime));
  assert.ok(buffer.includes(infinityTime));
  assert.ok(buffer.includes(negInfinityTime));
  assert.ok(buffer.includes(normalTime));
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
  assert.deepStrictEqual(buffer[0].properties, weirdRecord.properties);
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
  assert.strictEqual(buffer.length, 0);

  // Should handle deep hierarchies
  sink(deepError);

  // Both should flush (ancestor relationship)
  assert.strictEqual(buffer.length, 3);
  assert.ok(buffer.includes(deepRecord));
  assert.ok(buffer.includes(parentRecord));
  assert.ok(buffer.includes(deepError));
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Error in req-1 should only flush req-1 logs
  sink(req1Error);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], req1Debug);
  assert.deepStrictEqual(buffer[1], req1Info);
  assert.deepStrictEqual(buffer[2], req1Error);

  // req-2 logs should still be buffered
  buffer.length = 0;
  sink(req2Debug); // Add another req-2 log
  assert.strictEqual(buffer.length, 0); // Still buffered

  // Now trigger req-2
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2", data: "error2" },
  };
  sink(req2Error);
  assert.strictEqual(buffer.length, 4); // 2x req2Debug + req2Info + req2Error
  assert.deepStrictEqual(buffer[0], req2Debug);
  assert.deepStrictEqual(buffer[1], req2Info);
  assert.deepStrictEqual(buffer[2], req2Debug); // Second instance
  assert.deepStrictEqual(buffer[3], req2Error);
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Error with req-1/sess-1 should only flush that combination
  const trigger1: LogRecord = {
    ...error,
    properties: { requestId: "req-1", sessionId: "sess-1" },
  };
  sink(trigger1);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], record1);
  assert.deepStrictEqual(buffer[1], trigger1);

  // Other combinations still buffered
  buffer.length = 0;
  const trigger2: LogRecord = {
    ...error,
    properties: { requestId: "req-1", sessionId: "sess-2" },
  };
  sink(trigger2);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], record2);
  assert.deepStrictEqual(buffer[1], trigger2);
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Error without requestId should flush records without or with undefined requestId
  const triggerNoId: LogRecord = {
    ...error,
    properties: { other: "data" },
  };
  sink(triggerNoId);
  assert.strictEqual(buffer.length, 3); // withoutId + withUndefinedId + triggerNoId
  assert.deepStrictEqual(buffer[0], withoutId);
  assert.deepStrictEqual(buffer[1], withUndefinedId);
  assert.deepStrictEqual(buffer[2], triggerNoId);

  // Records with requestId still buffered
  buffer.length = 0;
  const triggerWithId: LogRecord = {
    ...error,
    properties: { requestId: "req-1", other: "data" },
  };
  sink(triggerWithId);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], withId);
  assert.deepStrictEqual(buffer[1], triggerWithId);
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Error in ["app"] with req-1 should flush descendants with same requestId
  const triggerAppReq1: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: "req-1" },
  };
  sink(triggerAppReq1);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], appReq1);
  assert.deepStrictEqual(buffer[1], appModuleReq1);
  assert.deepStrictEqual(buffer[2], triggerAppReq1);

  // Other combinations still buffered
  buffer.length = 0;
  const triggerAppReq2: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: "req-2" },
  };
  sink(triggerAppReq2);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], appReq2);
  assert.deepStrictEqual(buffer[1], appModuleReq2);
  assert.deepStrictEqual(buffer[2], triggerAppReq2);
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
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], req1Debug);
  assert.deepStrictEqual(buffer[1], req1Info);
  assert.deepStrictEqual(buffer[2], req1Error);

  // Trigger req-2
  buffer.length = 0;
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2" },
  };
  sink(req2Error);

  // req-2 buffer should still have both records
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], req2Trace);
  assert.deepStrictEqual(buffer[1], req2Debug);
  assert.deepStrictEqual(buffer[2], req2Error);
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Trigger with null value
  const triggerNull: LogRecord = {
    ...error,
    properties: { value: null },
  };
  sink(triggerNull);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], nullValue);
  assert.deepStrictEqual(buffer[1], triggerNull);

  // Trigger with zero value
  buffer.length = 0;
  const triggerZero: LogRecord = {
    ...error,
    properties: { value: 0 },
  };
  sink(triggerZero);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], zeroValue);
  assert.deepStrictEqual(buffer[1], triggerZero);

  // Trigger with false value
  buffer.length = 0;
  const triggerFalse: LogRecord = {
    ...error,
    properties: { value: false },
  };
  sink(triggerFalse);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], falseValue);
  assert.deepStrictEqual(buffer[1], triggerFalse);
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Error in any category with req-1 should flush all req-1 logs
  const triggerReq1: LogRecord = {
    ...error,
    category: ["cat3"],
    properties: { requestId: "req-1" },
  };
  sink(triggerReq1);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], cat1Req1);
  assert.deepStrictEqual(buffer[1], cat2Req1);
  assert.deepStrictEqual(buffer[2], triggerReq1);

  // req-2 still buffered
  buffer.length = 0;
  const triggerReq2: LogRecord = {
    ...error,
    category: ["cat1"],
    properties: { requestId: "req-2" },
  };
  sink(triggerReq2);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], cat1Req2);
  assert.deepStrictEqual(buffer[1], triggerReq2);
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
  assert.strictEqual(buffer.length, 0); // All buffered

  // Trigger with same user object
  const triggerUser1: LogRecord = {
    ...error,
    properties: { user: { id: 1, name: "Alice" } },
  };
  sink(triggerUser1);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], user1);
  assert.deepStrictEqual(buffer[1], user1Same);
  assert.deepStrictEqual(buffer[2], triggerUser1);

  // user2 still buffered
  buffer.length = 0;
  const triggerUser2: LogRecord = {
    ...error,
    properties: { user: { id: 2, name: "Bob" } },
  };
  sink(triggerUser2);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], user2);
  assert.deepStrictEqual(buffer[1], triggerUser2);
});

// A context value which contains a circular reference; each call allocates
// a separate object, so two contexts built with the same id are equal without
// being identical.
function selfReferencing(id: string): Record<string, unknown> {
  const value: Record<string, unknown> = { id };
  value.self = value;
  return value;
}

test("fingersCrossed() - context isolation with a circular context value", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  const requestId = selfReferencing("req-1");
  const req1Debug: LogRecord = { ...debug, properties: { requestId } };
  const req1Info: LogRecord = { ...info, properties: { requestId } };

  sink(req1Debug);
  sink(req1Info);
  assert.strictEqual(buffer.length, 0); // Buffered, not thrown away

  const req1Error: LogRecord = { ...error, properties: { requestId } };
  sink(req1Error);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], req1Debug);
  assert.deepStrictEqual(buffer[1], req1Info);
  assert.deepStrictEqual(buffer[2], req1Error);
});

test("fingersCrossed() - context isolation with equal circular context values", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  // Separately allocated but equal, as the acyclic nested object case is
  const first: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-1") },
  };
  const second: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-1") },
  };

  sink(first);
  sink(second);
  assert.strictEqual(buffer.length, 0);

  const trigger: LogRecord = {
    ...error,
    properties: { requestId: selfReferencing("req-1") },
  };
  sink(trigger);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], first);
  assert.deepStrictEqual(buffer[1], second);
  assert.deepStrictEqual(buffer[2], trigger);
});

test("fingersCrossed() - context isolation with differing circular context values", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  const req1Debug: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-1") },
  };
  const req2Debug: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-2") },
  };

  sink(req1Debug);
  sink(req2Debug);
  assert.strictEqual(buffer.length, 0);

  // Triggering one context leaves the other's buffer alone
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: selfReferencing("req-1") },
  };
  sink(req1Error);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], req1Debug);
  assert.deepStrictEqual(buffer[1], req1Error);

  // And the other context keeps buffering instead of passing through
  buffer.length = 0;
  const req2Info: LogRecord = {
    ...info,
    properties: { requestId: selfReferencing("req-2") },
  };
  sink(req2Info);
  assert.strictEqual(buffer.length, 0);

  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: selfReferencing("req-2") },
  };
  sink(req2Error);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], req2Debug);
  assert.deepStrictEqual(buffer[1], req2Info);
  assert.deepStrictEqual(buffer[2], req2Error);
});

test("fingersCrossed() - context isolation by circular reference target", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"] },
  });

  // The two differ only in which ancestor the reference points back to: the
  // whole value in the first case, its `p` property in the second.
  function pointingAtRoot(): Record<string, unknown> {
    const value: Record<string, unknown> = { p: {} };
    (value.p as Record<string, unknown>).q = value;
    return value;
  }
  function pointingAtParent(): Record<string, unknown> {
    const value: Record<string, unknown> = { p: {} };
    (value.p as Record<string, unknown>).q = value.p;
    return value;
  }

  const rootDebug: LogRecord = {
    ...debug,
    properties: { requestId: pointingAtRoot() },
  };
  const parentDebug: LogRecord = {
    ...debug,
    properties: { requestId: pointingAtParent() },
  };

  sink(rootDebug);
  sink(parentDebug);
  assert.strictEqual(buffer.length, 0);

  const rootError: LogRecord = {
    ...error,
    properties: { requestId: pointingAtRoot() },
  };
  sink(rootError);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], rootDebug);
  assert.deepStrictEqual(buffer[1], rootError);

  buffer.length = 0;
  const parentError: LogRecord = {
    ...error,
    properties: { requestId: pointingAtParent() },
  };
  sink(parentError);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], parentDebug);
  assert.deepStrictEqual(buffer[1], parentError);
});

test("fingersCrossed() - combined isolation with a circular context value", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByCategory: "descendant",
    isolateByContext: { keys: ["requestId"] },
  });

  const appReq1: LogRecord = {
    ...debug,
    category: ["app"],
    properties: { requestId: selfReferencing("req-1") },
  };
  const appModuleReq1: LogRecord = {
    ...debug,
    category: ["app", "module"],
    properties: { requestId: selfReferencing("req-1") },
  };
  const appModuleReq2: LogRecord = {
    ...debug,
    category: ["app", "module"],
    properties: { requestId: selfReferencing("req-2") },
  };

  sink(appReq1);
  sink(appModuleReq1);
  sink(appModuleReq2);
  assert.strictEqual(buffer.length, 0);

  // The descendant with the same context is flushed; the one with another
  // context is not
  const triggerAppReq1: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: selfReferencing("req-1") },
  };
  sink(triggerAppReq1);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], appReq1);
  assert.deepStrictEqual(buffer[1], appModuleReq1);
  assert.deepStrictEqual(buffer[2], triggerAppReq1);

  buffer.length = 0;
  const triggerAppReq2: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: selfReferencing("req-2") },
  };
  sink(triggerAppReq2);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], appModuleReq2);
  assert.deepStrictEqual(buffer[1], triggerAppReq2);
});

test("fingersCrossed() - LRU eviction with circular context values", () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: { keys: ["requestId"], maxContexts: 2 },
  });

  const req1First: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-1") },
  };
  const req2Debug: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-2") },
  };
  // An equal but separately allocated context, so it has to land in the buffer
  // the first record opened rather than a third one
  const req1Second: LogRecord = {
    ...info,
    properties: { requestId: selfReferencing("req-1") },
  };
  const req3Debug: LogRecord = {
    ...debug,
    properties: { requestId: selfReferencing("req-3") },
  };

  sink(req1First);
  sink(req2Debug);
  sink(req1Second);
  sink(req3Debug);
  assert.strictEqual(buffer.length, 0);

  // req-1 was the least recently used until its second record refreshed it,
  // so req-2 is the buffer that made room for req-3
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: selfReferencing("req-1") },
  };
  sink(req1Error);
  assert.strictEqual(buffer.length, 3);
  assert.deepStrictEqual(buffer[0], req1First);
  assert.deepStrictEqual(buffer[1], req1Second);
  assert.deepStrictEqual(buffer[2], req1Error);

  buffer.length = 0;
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: selfReferencing("req-2") },
  };
  sink(req2Error);
  assert.deepStrictEqual(buffer, [req2Error]);

  buffer.length = 0;
  const req3Error: LogRecord = {
    ...error,
    properties: { requestId: selfReferencing("req-3") },
  };
  sink(req3Error);
  assert.deepStrictEqual(buffer, [req3Debug, req3Error]);
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
  assert.strictEqual(buffer.length, 1);
  assert.deepStrictEqual(buffer[0], req1Error);

  // After trigger, req-1 logs pass through
  const req1Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  sink(req1Debug);
  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[1], req1Debug);

  // But req-2 logs are still buffered
  const req2Debug: LogRecord = {
    ...debug,
    properties: { requestId: "req-2" },
  };
  sink(req2Debug);
  assert.strictEqual(buffer.length, 2); // No change

  // Until req-2 triggers
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2" },
  };
  sink(req2Error);
  assert.strictEqual(buffer.length, 4);
  assert.deepStrictEqual(buffer[2], req2Debug);
  assert.deepStrictEqual(buffer[3], req2Error);
});

test("fingersCrossed() - context isolation supports delimiter text in categories", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
  });
  const requestDebug: LogRecord = {
    ...debug,
    category: ["a]:b"],
    properties: { requestId: "req-1" },
  };
  const requestError: LogRecord = {
    ...error,
    category: ["a]:b"],
    properties: { requestId: "req-1" },
  };

  // Act
  sink(requestDebug);
  sink(requestError);

  // Assert
  assert.deepStrictEqual(output, [requestDebug, requestError]);
});

test("fingersCrossed() - bufferAction flushes and releases a context", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
    bufferAction: (record) =>
      record.properties.requestCompleted === true ? "flush" : undefined,
  });
  const requestDebug: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  const requestCompleted: LogRecord = {
    ...info,
    properties: { requestId: "req-1", requestCompleted: true },
  };

  // Act
  sink(requestDebug);
  sink(requestCompleted);
  sink(requestDebug);

  // Assert
  assert.deepStrictEqual(output, [requestDebug, requestCompleted]);
  sink.flush({ context: { requestId: "req-1" } });
  assert.deepStrictEqual(output, [
    requestDebug,
    requestCompleted,
    requestDebug,
  ]);
});

test("fingersCrossed() - bufferAction discards an already-triggered context", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
    bufferAction: (record) =>
      record.properties.requestCompleted === true ? "discard" : undefined,
  });
  const requestError: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  const requestCompleted: LogRecord = {
    ...info,
    properties: { requestId: "req-1", requestCompleted: true },
  };
  const nextRequestDebug: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };

  // Act
  sink(requestError);
  sink(requestCompleted);
  sink(nextRequestDebug);

  // Assert
  assert.deepStrictEqual(output, [requestError]);
  sink.flush({ context: { requestId: "req-1" } });
  assert.deepStrictEqual(output, [requestError, nextRequestDebug]);
});

test("fingersCrossed() - discard() selects a context across categories", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
  });
  const appRequest1: LogRecord = {
    ...debug,
    category: ["app"],
    properties: { requestId: "req-1" },
  };
  const databaseRequest1: LogRecord = {
    ...info,
    category: ["database"],
    properties: { requestId: "req-1" },
  };
  const appRequest2: LogRecord = {
    ...debug,
    category: ["app"],
    properties: { requestId: "req-2" },
  };

  // Act
  sink(appRequest1);
  sink(databaseRequest1);
  sink(appRequest2);
  sink.discard({ context: { requestId: "req-1" } });
  sink({ ...error, properties: { requestId: "req-1" } });
  sink({ ...error, properties: { requestId: "req-2" } });

  // Assert
  assert.deepStrictEqual(output, [
    { ...error, properties: { requestId: "req-1" } },
    appRequest2,
    { ...error, properties: { requestId: "req-2" } },
  ]);
});

test("fingersCrossed() - flush() and discard() control the global buffer", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output));

  // Act
  sink(debug);
  sink.flush();
  sink(info);
  sink.discard();
  sink(error);
  sink.discard();
  sink(debug);

  // Assert
  assert.deepStrictEqual(output, [debug, error]);
  sink.flush();
  assert.deepStrictEqual(output, [debug, error, debug]);
});

test("fingersCrossed() - flush() clears global state before sink errors", () => {
  // Arrange
  const attempts: LogRecord[] = [];
  let shouldThrow = true;
  const sink = fingersCrossed((record) => {
    attempts.push(record);
    if (shouldThrow) {
      shouldThrow = false;
      throw new Error("Sink failed.");
    }
  });

  // Act and assert
  sink(debug);
  assert.throws(() => sink.flush(), {
    message: "Sink failed.",
  });
  sink(info);
  sink.flush();
  assert.deepStrictEqual(attempts, [debug, info]);
});

test("fingersCrossed() - flush() isolates synchronous re-entry", () => {
  // Arrange
  const output: LogRecord[] = [];
  const reentrantRecord: LogRecord = {
    ...info,
    message: ["Re-entered while flushing."],
  };
  let reenter = (_record: LogRecord): void => {};
  const sink = fingersCrossed((record) => {
    output.push(record);
    if (record === debug) reenter(reentrantRecord);
  });
  reenter = sink;

  // Act
  sink(debug);
  sink(info);
  sink.flush();

  // Assert
  assert.deepStrictEqual(output, [debug, info]);
  sink.flush();
  assert.deepStrictEqual(output, [debug, info, reentrantRecord]);
});

test("fingersCrossed() - category selector uses the isolation matcher", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByCategory: "descendant",
    isolateByContext: { keys: ["requestId"] },
  });
  const app: LogRecord = {
    ...debug,
    category: ["app"],
    properties: { requestId: "req-1" },
  };
  const appModule: LogRecord = {
    ...info,
    category: ["app", "module"],
    properties: { requestId: "req-1" },
  };
  const other: LogRecord = {
    ...debug,
    category: ["other"],
    properties: { requestId: "req-1" },
  };

  // Act
  sink(app);
  sink(appModule);
  sink(other);
  sink.discard({
    category: ["app"],
    context: { requestId: "req-1" },
  });
  sink({
    ...error,
    category: ["other"],
    properties: { requestId: "req-1" },
  });

  // Assert
  assert.deepStrictEqual(output, [
    other,
    {
      ...error,
      category: ["other"],
      properties: { requestId: "req-1" },
    },
  ]);
});

test("fingersCrossed() - methods without a selector control all contexts", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
  });
  const request1: LogRecord = {
    ...debug,
    properties: { requestId: "req-1" },
  };
  const request2: LogRecord = {
    ...info,
    properties: { requestId: "req-2" },
  };

  // Act
  sink(request1);
  sink(request2);
  sink.flush();
  sink({ ...error, properties: { requestId: "req-1" } });
  sink({ ...error, properties: { requestId: "req-2" } });
  sink.discard();
  sink(request1);
  sink(request2);

  // Assert
  assert.deepStrictEqual(output, [
    request1,
    request2,
    { ...error, properties: { requestId: "req-1" } },
    { ...error, properties: { requestId: "req-2" } },
  ]);
  sink.flush();
  assert.deepStrictEqual(output.slice(-2), [request1, request2]);
});

test("fingersCrossed() - context selectors require every isolation key", () => {
  // Arrange
  const sink = fingersCrossed(() => {}, {
    isolateByContext: { keys: ["requestId", "sessionId"] },
  });

  // Act and assert
  assert.throws(
    () => sink.discard({ context: { requestId: "req-1" } }),
    {
      name: "TypeError",
      message: "Missing context selector keys: sessionId.",
    },
  );
});

test("fingersCrossed() - afterTrigger defaults to passthrough", () => {
  for (const afterTrigger of [undefined, "passthrough"] as const) {
    // Arrange
    const output: LogRecord[] = [];
    const sink = fingersCrossed(output.push.bind(output), { afterTrigger });
    const before: LogRecord = { ...debug, message: ["Before."] };
    const after: LogRecord = { ...debug, message: ["After."] };

    // Act
    sink(before);
    sink(error);
    sink(after);

    // Assert
    assert.deepStrictEqual(output, [before, error, after]);
  }
});

test("fingersCrossed() - afterTrigger passthrough keeps isolated buffers triggered", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
    afterTrigger: "passthrough",
  });
  const after: LogRecord = { ...debug, properties: { requestId: "req-1" } };

  // Act
  sink({ ...error, properties: { requestId: "req-1" } });
  sink(after);

  // Assert
  assert.deepStrictEqual(output, [
    { ...error, properties: { requestId: "req-1" } },
    after,
  ]);
});

test("fingersCrossed() - afterTrigger buffer returns to buffering", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
  });
  const first: LogRecord = { ...debug, message: ["First."] };
  const firstError: LogRecord = { ...error, message: ["First error."] };
  const second: LogRecord = { ...info, message: ["Second."] };
  const third: LogRecord = { ...debug, message: ["Third."] };
  const secondError: LogRecord = { ...fatal, message: ["Second error."] };

  // Act
  sink(first);
  sink(firstError);
  sink(second);
  sink(third);

  // Assert
  assert.deepStrictEqual(output, [first, firstError]);
  sink(secondError);
  assert.deepStrictEqual(output, [
    first,
    firstError,
    second,
    third,
    secondError,
  ]);
});

test("fingersCrossed() - afterTrigger buffer handles consecutive triggers", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
  });
  const secondError: LogRecord = { ...error, message: ["Second error."] };

  // Act
  sink(debug);
  sink(error);
  sink(secondError);

  // Assert
  assert.deepStrictEqual(output, [debug, error, secondError]);
});

test("fingersCrossed() - afterTrigger buffer limits each cycle", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
    maxBufferSize: 2,
  });
  const records = Array.from(
    { length: 6 },
    (_, i): LogRecord => ({ ...debug, message: [`Record ${i}.`] }),
  );

  // Act
  for (const record of records.slice(0, 3)) sink(record);
  sink(error);
  for (const record of records.slice(3)) sink(record);
  sink(fatal);

  // Assert
  assert.deepStrictEqual(output, [
    records[1],
    records[2],
    error,
    records[4],
    records[5],
    fatal,
  ]);
});

test("fingersCrossed() - afterTrigger buffer with zero maxBufferSize", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
    bufferLevel: "debug",
    maxBufferSize: 0,
  });

  // Act
  sink(debug);
  sink(error);
  sink(debug);
  sink(info);
  sink(fatal);

  // Assert
  assert.deepStrictEqual(output, [error, info, fatal]);
});

test("fingersCrossed() - afterTrigger buffer respects bufferLevel", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
    bufferLevel: "debug",
    triggerLevel: "warning",
  });

  // Act
  sink(warning);
  sink(debug);
  sink(info);

  // Assert
  assert.deepStrictEqual(output, [warning, info]);
  sink(error);
  assert.deepStrictEqual(output, [warning, info, debug, error]);
});

test("fingersCrossed() - afterTrigger buffer restarts context buffers", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"] },
    afterTrigger: "buffer",
  });
  const req1Before: LogRecord = {
    ...debug,
    message: ["Request 1 before."],
    properties: { requestId: "req-1" },
  };
  const req1After: LogRecord = {
    ...debug,
    message: ["Request 1 after."],
    properties: { requestId: "req-1" },
  };
  const req2: LogRecord = { ...debug, properties: { requestId: "req-2" } };
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  const req2Error: LogRecord = {
    ...error,
    properties: { requestId: "req-2" },
  };

  // Act
  sink(req1Before);
  sink(req2);
  sink(req1Error);
  sink(req1After);

  // Assert
  assert.deepStrictEqual(output, [req1Before, req1Error]);
  sink(req2Error);
  assert.deepStrictEqual(output, [req1Before, req1Error, req2, req2Error]);
  sink(req1Error);
  assert.deepStrictEqual(output, [
    req1Before,
    req1Error,
    req2,
    req2Error,
    req1After,
    req1Error,
  ]);
});

test("fingersCrossed() - afterTrigger buffer reselects descendant buffers", () => {
  for (const afterTrigger of ["passthrough", "buffer"] as const) {
    // Arrange
    const output: LogRecord[] = [];
    const sink = fingersCrossed(output.push.bind(output), {
      isolateByCategory: "descendant",
      afterTrigger,
    });
    const parentError: LogRecord = { ...error, category: ["app"] };
    const child: LogRecord = { ...debug, category: ["app", "db"] };

    // Act
    sink(parentError);
    sink(child);
    sink(parentError);

    // Assert
    assert.deepStrictEqual(
      output,
      afterTrigger === "buffer"
        ? [parentError, child, parentError]
        : [parentError, parentError],
      afterTrigger,
    );
  }
});

test("fingersCrossed() - afterTrigger buffer with category matchers", () => {
  const parent: LogRecord = { ...debug, category: ["app"] };
  const child: LogRecord = { ...debug, category: ["app", "db"] };
  const other: LogRecord = { ...debug, category: ["other"] };
  const cases = [
    {
      isolateByCategory: "ancestor",
      trigger: { ...error, category: ["app", "db"] },
      flushed: [parent, child],
    },
    {
      isolateByCategory: "both",
      trigger: { ...error, category: ["app"] },
      flushed: [parent, child],
    },
    {
      isolateByCategory: (
        trigger: readonly string[],
        buffered: readonly string[],
      ) => trigger[0] === "app" && buffered[0] === "other",
      trigger: { ...error, category: ["app"] },
      flushed: [parent, other],
    },
  ] as const;
  for (const { isolateByCategory, trigger, flushed } of cases) {
    // Arrange
    const output: LogRecord[] = [];
    const sink = fingersCrossed(output.push.bind(output), {
      isolateByCategory,
      afterTrigger: "buffer",
    });

    // Act
    sink(parent);
    sink(child);
    sink(other);
    sink(trigger);
    output.length = 0;
    sink(parent);
    sink(child);
    sink(other);
    sink(trigger);

    // Assert
    assert.deepStrictEqual(
      new Set(output.slice(0, -1)),
      new Set(flushed),
      String(isolateByCategory),
    );
    assert.strictEqual(output.at(-1), trigger);
    assert.strictEqual(output.length, flushed.length + 1);
  }
});

test("fingersCrossed() - afterTrigger buffer with combined isolation", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByCategory: "descendant",
    isolateByContext: { keys: ["requestId"] },
    afterTrigger: "buffer",
  });
  const req1Child: LogRecord = {
    ...debug,
    category: ["app", "db"],
    properties: { requestId: "req-1" },
  };
  const req2Child: LogRecord = {
    ...debug,
    category: ["app", "db"],
    properties: { requestId: "req-2" },
  };
  const req1Error: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: "req-1" },
  };
  const req2Error: LogRecord = {
    ...error,
    category: ["app"],
    properties: { requestId: "req-2" },
  };

  // Act
  sink(req1Child);
  sink(req2Child);
  sink(req1Error);
  sink(req1Child);
  sink(req2Error);

  // Assert
  assert.deepStrictEqual(output, [req1Child, req1Error, req2Child, req2Error]);
  sink(req1Error);
  assert.deepStrictEqual(output.slice(-2), [req1Child, req1Error]);
});

test("fingersCrossed() - bufferAction takes precedence over afterTrigger", () => {
  // Arrange
  const output: LogRecord[] = [];
  const flushRecord: LogRecord = { ...debug, message: ["Flush."] };
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
    bufferAction: (record) =>
      record === flushRecord
        ? "flush"
        : record.level === "fatal"
        ? "discard"
        : undefined,
  });

  // Act
  sink(info);
  sink(fatal);
  sink(debug);
  sink(flushRecord);

  // Assert
  assert.deepStrictEqual(output, [debug, flushRecord]);
});

test("fingersCrossed() - manual controls with afterTrigger buffer", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    afterTrigger: "buffer",
  });

  // Act
  sink(debug);
  sink(error);
  sink(info);
  sink.discard();
  sink.discard();
  sink(debug);
  sink.flush();
  sink.flush();
  sink(info);

  // Assert
  assert.deepStrictEqual(output, [debug, error, debug]);
  sink(error);
  assert.deepStrictEqual(output, [debug, error, debug, info, error]);
});

test("fingersCrossed() - afterTrigger buffer isolates synchronous re-entry", () => {
  // Arrange
  const output: LogRecord[] = [];
  const reentrantRecord: LogRecord = {
    ...debug,
    message: ["Re-entered while flushing."],
  };
  let reenter = (_record: LogRecord): void => {};
  const sink = fingersCrossed((record) => {
    output.push(record);
    if (record === info) reenter(reentrantRecord);
  }, { afterTrigger: "buffer" });
  reenter = sink;

  // Act
  sink(info);
  sink(debug);
  sink(error);

  // Assert
  assert.deepStrictEqual(output, [info, debug, error]);
  sink(fatal);
  assert.deepStrictEqual(output, [info, debug, error, reentrantRecord, fatal]);
});

test("fingersCrossed() - afterTrigger buffer processes re-entrant triggers", () => {
  // Arrange
  const output: LogRecord[] = [];
  const reentrantError: LogRecord = {
    ...error,
    message: ["Re-entered while flushing."],
  };
  let reentered = false;
  let reenter = (_record: LogRecord): void => {};
  const sink = fingersCrossed((record) => {
    output.push(record);
    if (record === info && !reentered) {
      reentered = true;
      reenter(trace);
      reenter(reentrantError);
    }
  }, { afterTrigger: "buffer" });
  reenter = sink;

  // Act
  sink(info);
  sink(debug);
  sink(fatal);

  // Assert
  assert.deepStrictEqual(output, [
    info,
    trace,
    reentrantError,
    debug,
    fatal,
  ]);
});

test("fingersCrossed() - afterTrigger buffer isolates re-entry per context", () => {
  // Arrange
  const output: LogRecord[] = [];
  const buffered: LogRecord = {
    ...info,
    properties: { requestId: "req-1" },
  };
  const reentrantRecord: LogRecord = {
    ...debug,
    message: ["Re-entered while flushing."],
    properties: { requestId: "req-1" },
  };
  const req1Error: LogRecord = {
    ...error,
    properties: { requestId: "req-1" },
  };
  let reenter = (_record: LogRecord): void => {};
  const sink = fingersCrossed((record) => {
    output.push(record);
    if (record === buffered) reenter(reentrantRecord);
  }, {
    isolateByContext: { keys: ["requestId"] },
    afterTrigger: "buffer",
  });
  reenter = sink;

  // Act
  sink(buffered);
  sink(req1Error);

  // Assert
  assert.deepStrictEqual(output, [buffered, req1Error]);
  sink(req1Error);
  assert.deepStrictEqual(output, [
    buffered,
    req1Error,
    reentrantRecord,
    req1Error,
  ]);
});

test("fingersCrossed() - afterTrigger buffer consumes batches on sink errors", () => {
  // Arrange
  const attempts: LogRecord[] = [];
  let shouldThrow = true;
  const sink = fingersCrossed((record) => {
    attempts.push(record);
    if (shouldThrow) {
      shouldThrow = false;
      throw new Error("Sink failed.");
    }
  }, { afterTrigger: "buffer" });

  // Act and assert
  sink(debug);
  assert.throws(() => sink(error), { message: "Sink failed." });
  sink(info);
  sink(fatal);
  assert.deepStrictEqual(attempts, [debug, info, fatal]);
});

test("fingersCrossed() - afterTrigger buffer keeps unselected buffers on sink errors", () => {
  // Arrange
  const attempts: LogRecord[] = [];
  let shouldThrow = true;
  const req1: LogRecord = { ...debug, properties: { requestId: "req-1" } };
  const req2: LogRecord = { ...debug, properties: { requestId: "req-2" } };
  const sink = fingersCrossed((record) => {
    attempts.push(record);
    if (shouldThrow) {
      shouldThrow = false;
      throw new Error("Sink failed.");
    }
  }, {
    isolateByContext: { keys: ["requestId"] },
    afterTrigger: "buffer",
  });

  // Act and assert
  sink(req1);
  sink(req2);
  assert.throws(
    () => sink({ ...error, properties: { requestId: "req-1" } }),
    { message: "Sink failed." },
  );
  sink({ ...error, properties: { requestId: "req-1" } });
  sink({ ...error, properties: { requestId: "req-2" } });
  assert.deepStrictEqual(attempts, [
    req1,
    { ...error, properties: { requestId: "req-1" } },
    req2,
    { ...error, properties: { requestId: "req-2" } },
  ]);
});

test("fingersCrossed() - afterTrigger buffer applies LRU after a trigger", () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: { keys: ["requestId"], maxContexts: 2 },
    afterTrigger: "buffer",
  });
  const record = (requestId: string): LogRecord => ({
    ...debug,
    properties: { requestId },
  });
  const failure = (requestId: string): LogRecord => ({
    ...error,
    properties: { requestId },
  });

  // Act
  sink(record("req-1"));
  sink(failure("req-1"));
  sink(record("req-1"));
  sink(record("req-2"));
  sink(record("req-3"));
  output.length = 0;
  sink(failure("req-1"));
  sink(failure("req-3"));

  // Assert
  assert.deepStrictEqual(output, [
    failure("req-1"),
    record("req-3"),
    failure("req-3"),
  ]);
});

test("fingersCrossed() - afterTrigger buffer applies TTL after a trigger", async () => {
  // Arrange
  const output: LogRecord[] = [];
  const sink = fingersCrossed(output.push.bind(output), {
    isolateByContext: {
      keys: ["requestId"],
      bufferTtlMs: 100,
      cleanupIntervalMs: 50,
    },
    afterTrigger: "buffer",
  }) as Sink & Disposable;

  try {
    // Act
    sink({
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    });
    sink({ ...error, properties: { requestId: "req-1" } });
    sink({
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    });
    await delay(250);
    output.length = 0;
    sink({ ...error, properties: { requestId: "req-1" } });

    // Assert
    assert.deepStrictEqual(output, [
      { ...error, properties: { requestId: "req-1" } },
    ]);
  } finally {
    sink[Symbol.dispose]();
  }
});

test("fingersCrossed() - afterTrigger validation", () => {
  for (const afterTrigger of [null, "invalid", 1]) {
    assert.throws(
      () =>
        fingersCrossed(() => {}, {
          afterTrigger: afterTrigger as unknown as "buffer",
        }),
      {
        name: "TypeError",
        message: `Invalid afterTrigger: ${JSON.stringify(afterTrigger)}. ` +
          'Expected "passthrough", "buffer", or undefined.',
      },
    );
  }
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
    await delay(200);

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
    assert.strictEqual(buffer.length, 1);
    assert.deepStrictEqual(buffer[0], req1Error);

    // Clear buffer and trigger req-3 (should flush req-3 buffer)
    buffer.length = 0; // Clear buffer
    const req3Error: LogRecord = {
      ...error,
      properties: { requestId: "req-3" },
      timestamp: Date.now(),
    };
    sink(req3Error);

    // Should have both req-3 debug and error
    assert.strictEqual(buffer.length, 2);
    assert.deepStrictEqual(buffer[0], req3Record);
    assert.deepStrictEqual(buffer[1], req3Error);
  } finally {
    // Clean up timer
    sink[Symbol.dispose]();
  }
});

test("fingersCrossed() - TTL cleanup expires triggered contexts", async () => {
  const buffer: LogRecord[] = [];
  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      bufferTtlMs: 50,
      cleanupIntervalMs: 10,
    },
  }) as Sink & Disposable;

  try {
    const req1Debug: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    const req1Error: LogRecord = {
      ...error,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };

    sink(req1Debug);
    sink(req1Error);
    assert.deepStrictEqual(buffer, [req1Debug, req1Error]);

    await delay(120);
    buffer.length = 0;

    const req1SecondDebug: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    sink(req1SecondDebug);

    assert.deepStrictEqual(buffer, []);

    const req1SecondError: LogRecord = {
      ...error,
      properties: { requestId: "req-1" },
      timestamp: Date.now(),
    };
    sink(req1SecondError);

    assert.deepStrictEqual(buffer, [req1SecondDebug, req1SecondError]);
  } finally {
    sink[Symbol.dispose]();
  }
});

test("fingersCrossed() - TTL cleanup preserves active triggered contexts", async () => {
  const buffer: LogRecord[] = [];
  const originalDateNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  const sink = fingersCrossed(buffer.push.bind(buffer), {
    isolateByContext: {
      keys: ["requestId"],
      bufferTtlMs: 100,
      cleanupIntervalMs: 10,
    },
  }) as Sink & Disposable;

  try {
    const req1Debug: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: now,
    };
    const req1Error: LogRecord = {
      ...error,
      properties: { requestId: "req-1" },
      timestamp: now,
    };

    sink(req1Debug);
    sink(req1Error);
    assert.deepStrictEqual(buffer, [req1Debug, req1Error]);

    now += 50;
    const req1PassThrough: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: now,
    };
    sink(req1PassThrough);
    assert.deepStrictEqual(buffer, [
      req1Debug,
      req1Error,
      req1PassThrough,
    ]);

    buffer.length = 0;
    now += 70;
    await delay(50);

    const req1StillActive: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
      timestamp: now,
    };
    sink(req1StillActive);

    assert.deepStrictEqual(buffer, [req1StillActive]);
  } finally {
    sink[Symbol.dispose]();
    Date.now = originalDateNow;
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
  assert.strictEqual("dispose" in sink, false);

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

  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], record);
  assert.deepStrictEqual(buffer[1], errorRecord);
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
  assert.strictEqual("dispose" in sink, false);
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
  assert.strictEqual(buffer.length, 1, "req-1 should have been evicted by LRU");
  assert.deepStrictEqual(buffer[0], req1Error);
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
  await delay(1);

  const req2Record: LogRecord = {
    ...debug,
    properties: { requestId: "req-2" },
  };
  sink(req2Record); // req-2 is newest

  // Access req-1 again after another delay to make it more recent
  await delay(1);

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
  assert.strictEqual(buffer.length, 1, "req-2 should have been evicted");
  assert.deepStrictEqual(buffer[0], req2Error);
});

test("fingersCrossed() - LRU access updates within same millisecond", () => {
  const buffer: LogRecord[] = [];
  const originalDateNow = Date.now;
  Date.now = () => 1_000;

  try {
    const sink = fingersCrossed(buffer.push.bind(buffer), {
      isolateByContext: {
        keys: ["requestId"],
        maxContexts: 2,
      },
    });

    const req1Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
    };
    const req2Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-2" },
    };
    const req1Second: LogRecord = {
      ...debug,
      properties: { requestId: "req-1" },
    };
    const req3Record: LogRecord = {
      ...debug,
      properties: { requestId: "req-3" },
    };

    sink(req1Record);
    sink(req2Record);
    sink(req1Second);
    sink(req3Record);

    const req2Error: LogRecord = {
      ...error,
      properties: { requestId: "req-2" },
    };
    sink(req2Error);

    assert.strictEqual(buffer.length, 1, "req-2 should have been evicted");
    assert.deepStrictEqual(buffer[0], req2Error);
  } finally {
    Date.now = originalDateNow;
  }
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
  assert.strictEqual(buffer.length, 2);
  assert.strictEqual(buffer[0].properties?.requestId, "req-99");
  assert.deepStrictEqual(buffer[1], errorRecord);
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

  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0], record);
  assert.deepStrictEqual(buffer[1], errorRecord);
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
    await delay(150);

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
    assert.strictEqual(buffer.length, 1);
    assert.deepStrictEqual(buffer[0], req1Error);

    // Clear buffer and trigger req-3 (should have recent record)
    buffer.length = 0;
    const req3Error: LogRecord = {
      ...error,
      properties: { requestId: "req-3" },
      timestamp: Date.now(),
    };
    sink(req3Error);

    // Should have both debug and error records
    assert.strictEqual(buffer.length, 2);
    assert.deepStrictEqual(buffer[0], req3Record);
    assert.deepStrictEqual(buffer[1], req3Error);
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
    assert.strictEqual(buffer.length, 2);
    assert.deepStrictEqual(buffer[0], req2Record);
    assert.deepStrictEqual(buffer[1], req2Error);
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
  assert.strictEqual(buffer.length, 0);

  // info should pass through immediately (above bufferLevel, below triggerLevel)
  sink(info);
  assert.deepStrictEqual(buffer, [info]);

  // warning should trigger flush and include itself
  sink(warning);
  assert.deepStrictEqual(buffer, [info, trace, debug, warning]);

  // After trigger, all logs pass through
  sink(trace);
  assert.deepStrictEqual(buffer, [info, trace, debug, warning, trace]);
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
  assert.strictEqual(buffer.length, 0);

  // error triggers flush
  sink(error);
  assert.deepStrictEqual(buffer, [trace, debug, info, warning, error]);
});

test("fingersCrossed() - bufferLevel validation: invalid level", () => {
  assert.throws(
    () =>
      fingersCrossed(() => {}, {
        bufferLevel: "invalid" as LogLevel,
        triggerLevel: "error",
      }),
    TypeError,
  );
});

test("fingersCrossed() - bufferLevel validation: bufferLevel >= triggerLevel", () => {
  // bufferLevel same as triggerLevel
  assert.throws(
    () =>
      fingersCrossed(() => {}, {
        bufferLevel: "error",
        triggerLevel: "error",
      }),
    RangeError,
  );

  // bufferLevel higher than triggerLevel
  assert.throws(
    () =>
      fingersCrossed(() => {}, {
        bufferLevel: "fatal",
        triggerLevel: "error",
      }),
    RangeError,
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
  assert.strictEqual(buffer.length, 0);

  sink(appInfo);
  assert.deepStrictEqual(buffer, [appInfo]);

  // error triggers flush
  sink(appError);
  assert.deepStrictEqual(buffer, [appInfo, appDebug, appError]);
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
    assert.strictEqual(buffer.length, 0);

    // info passes through immediately
    sink(req1Info);
    assert.deepStrictEqual(buffer, [req1Info]);

    // error triggers flush
    sink(req1Error);
    assert.deepStrictEqual(buffer, [req1Info, req1Debug, req1Error]);
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
  assert.strictEqual(buffer.length, 0);

  // debug and above pass through immediately
  sink(debug);
  assert.deepStrictEqual(buffer, [debug]);

  sink(info);
  assert.deepStrictEqual(buffer, [debug, info]);

  // error triggers flush
  sink(error);
  assert.deepStrictEqual(buffer, [debug, info, trace, error]);
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
  assert.deepStrictEqual(buffer, [t2, t4, t1, t3, t5]);
});

function recordWithLevel(level: LogLevel): LogRecord {
  return {
    level,
    category: ["test"],
    message: ["message"],
    rawMessage: "message",
    timestamp: 0,
    properties: {},
  };
}

async function beforeDeadline<T>(
  promise: Promise<T>,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(new Error(message));
        }, 1000);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}
