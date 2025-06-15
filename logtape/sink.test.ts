import { suite } from "@alinea/suite";
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
  withBuffer,
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

test("withBuffer() - buffer size limit", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 3 });

  // Add records one by one
  sink(trace);
  assertEquals(buffer.length, 0); // Not flushed yet

  sink(debug);
  assertEquals(buffer.length, 0); // Not flushed yet

  sink(info);
  assertEquals(buffer.length, 3); // Flushed when buffer is full
  assertEquals(buffer, [trace, debug, info]);

  // Add more records
  sink(warning);
  assertEquals(buffer.length, 3); // Previous records remain

  sink(error);
  assertEquals(buffer.length, 3); // Still not flushed

  sink(fatal);
  assertEquals(buffer.length, 6); // Flushed again
  assertEquals(buffer, [trace, debug, info, warning, error, fatal]);

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - flush interval", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), {
    bufferSize: 10,
    flushInterval: 100,
  });

  sink(trace);
  assertEquals(buffer.length, 0); // Not flushed immediately

  // Wait for flush interval
  await delay(150);
  assertEquals(buffer.length, 1); // Flushed after interval
  assertEquals(buffer, [trace]);

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - dispose flushes remaining records", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 10 });

  sink(trace);
  sink(debug);
  assertEquals(buffer.length, 0); // Not flushed yet

  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2); // Flushed on dispose
  assertEquals(buffer, [trace, debug]);
});

test("withBuffer() - disabled flush interval", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), {
    bufferSize: 10,
    flushInterval: 0,
  });

  sink(trace);
  assertEquals(buffer.length, 0); // Not flushed immediately

  // Wait longer than normal flush interval
  await delay(200);
  assertEquals(buffer.length, 0); // Still not flushed due to disabled interval

  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 1); // Flushed only on dispose
  assertEquals(buffer, [trace]);
});

test("withBuffer() - default options", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer));

  // Add 9 records (less than default buffer size of 10)
  for (let i = 0; i < 9; i++) {
    sink(trace);
  }
  assertEquals(buffer.length, 0); // Not flushed yet

  // Add 10th record to trigger flush
  sink(trace);
  assertEquals(buffer.length, 10); // Flushed when buffer is full

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - no operation after dispose", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 3 });

  await sink[Symbol.asyncDispose]();

  // Try to add records after dispose
  sink(trace);
  sink(debug);
  assertEquals(buffer.length, 0); // No records added after dispose
});

test("withBuffer() - disposes underlying AsyncDisposable sink", async () => {
  const buffer: LogRecord[] = [];
  let disposed = false;

  const disposableSink: Sink & AsyncDisposable = (record: LogRecord) => {
    buffer.push(record);
  };
  disposableSink[Symbol.asyncDispose] = () => {
    disposed = true;
    return Promise.resolve();
  };

  const bufferedSink = withBuffer(disposableSink);

  await bufferedSink[Symbol.asyncDispose]();

  assertEquals(disposed, true); // Underlying sink should be disposed
});

test("withBuffer() - disposes underlying Disposable sink", async () => {
  const buffer: LogRecord[] = [];
  let disposed = false;

  const disposableSink: Sink & Disposable = (record: LogRecord) => {
    buffer.push(record);
  };
  disposableSink[Symbol.dispose] = () => {
    disposed = true;
  };

  const bufferedSink = withBuffer(disposableSink);

  await bufferedSink[Symbol.asyncDispose]();

  assertEquals(disposed, true); // Underlying sink should be disposed
});

test("withBuffer() - handles non-disposable sink gracefully", async () => {
  const buffer: LogRecord[] = [];
  const regularSink: Sink = (record: LogRecord) => {
    buffer.push(record);
  };

  const bufferedSink = withBuffer(regularSink);

  // Should not throw when disposing non-disposable sink
  await bufferedSink[Symbol.asyncDispose]();

  // This test passes if no error is thrown
  assertEquals(true, true);
});

test("withBuffer() - edge case: bufferSize 1", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 1 });

  // Every record should flush immediately
  sink(trace);
  assertEquals(buffer.length, 1);
  assertEquals(buffer, [trace]);

  sink(debug);
  assertEquals(buffer.length, 2);
  assertEquals(buffer, [trace, debug]);

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - edge case: bufferSize 0 or negative", async () => {
  const buffer: LogRecord[] = [];
  const sink1 = withBuffer(buffer.push.bind(buffer), { bufferSize: 0 });
  const sink2 = withBuffer(buffer.push.bind(buffer), { bufferSize: -5 });

  // Should still work, but behavior may vary
  sink1(trace);
  sink2(debug);

  await sink1[Symbol.asyncDispose]();
  await sink2[Symbol.asyncDispose]();

  assertEquals(buffer.length, 2);
  assertEquals(buffer, [trace, debug]);
});

test("withBuffer() - edge case: very large bufferSize", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 10000 });

  // Add many records without hitting buffer limit
  for (let i = 0; i < 100; i++) {
    sink(trace);
  }
  assertEquals(buffer.length, 0); // Not flushed yet

  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 100); // All flushed on dispose
});

test("withBuffer() - edge case: rapid successive calls", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 3 });

  // Add records in rapid succession
  sink(trace);
  sink(debug);
  sink(info); // This should trigger flush
  sink(warning);
  sink(error);
  sink(fatal); // This should trigger another flush

  assertEquals(buffer.length, 6);
  assertEquals(buffer, [trace, debug, info, warning, error, fatal]);

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - edge case: multiple timer flushes", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), {
    bufferSize: 10,
    flushInterval: 50,
  });

  sink(trace);
  await delay(60);
  assertEquals(buffer.length, 1); // First flush

  sink(debug);
  await delay(60);
  assertEquals(buffer.length, 2); // Second flush

  sink(info);
  await delay(60);
  assertEquals(buffer.length, 3); // Third flush

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - edge case: timer and buffer size interaction", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), {
    bufferSize: 3,
    flushInterval: 100,
  });

  // Add 2 records (less than bufferSize)
  sink(trace);
  sink(debug);
  assertEquals(buffer.length, 0);

  // Wait for timer flush
  await delay(120);
  assertEquals(buffer.length, 2); // Timer flush

  // Add 3 more records to trigger buffer flush
  sink(info);
  sink(warning);
  sink(error); // Should trigger immediate flush
  assertEquals(buffer.length, 5);

  await sink[Symbol.asyncDispose]();
});

test("withBuffer() - edge case: dispose called multiple times", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 10 });

  sink(trace);
  sink(debug);

  // First dispose
  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2);

  // Second dispose - should not cause errors or duplicate records
  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2); // Should remain the same

  // Third dispose
  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 2); // Should remain the same
});

test("withBuffer() - edge case: underlying sink throws error", async () => {
  let errorCount = 0;
  const errorSink: Sink = () => {
    errorCount++;
    throw new Error("Sink error");
  };

  const bufferedSink = withBuffer(errorSink, { bufferSize: 2 });

  // First record goes to buffer
  bufferedSink(trace);

  // Second record should trigger flush and throw error
  try {
    bufferedSink(debug);
    // Should not reach here
    assertEquals(true, false, "Expected error to be thrown");
  } catch (error) {
    assertInstanceOf(error, Error);
    assertEquals(error.message, "Sink error");
    assertEquals(errorCount, 1); // Only first record processed before error
  }

  await bufferedSink[Symbol.asyncDispose]();
});

test("withBuffer() - edge case: underlying AsyncDisposable throws error", async () => {
  const buffer: LogRecord[] = [];
  let disposed = false;

  const errorDisposableSink: Sink & AsyncDisposable = (record: LogRecord) => {
    buffer.push(record);
  };
  errorDisposableSink[Symbol.asyncDispose] = () => {
    disposed = true;
    throw new Error("Dispose error");
  };

  const bufferedSink = withBuffer(errorDisposableSink);

  bufferedSink(trace);

  try {
    await bufferedSink[Symbol.asyncDispose]();
    // Should not reach here
    assertEquals(true, false, "Expected dispose error to be thrown");
  } catch (error) {
    assertInstanceOf(error, Error);
    assertEquals(error.message, "Dispose error");
    assertEquals(disposed, true); // Should still be disposed
    assertEquals(buffer.length, 1); // Buffer should have been flushed before dispose error
  }
});

test("withBuffer() - edge case: negative flushInterval", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), {
    bufferSize: 10,
    flushInterval: -1000,
  });

  sink(trace);
  assertEquals(buffer.length, 0);

  // Wait longer than a normal flush interval
  await delay(200);
  assertEquals(buffer.length, 0); // Should not flush due to negative interval

  await sink[Symbol.asyncDispose]();
  assertEquals(buffer.length, 1); // Should only flush on dispose
});

test("withBuffer() - edge case: concurrent dispose and log calls", async () => {
  const buffer: LogRecord[] = [];
  const sink = withBuffer(buffer.push.bind(buffer), { bufferSize: 10 });

  sink(trace);

  // Start dispose and immediately try to log more
  const disposePromise = sink[Symbol.asyncDispose]();
  sink(debug); // This should be ignored since dispose is in progress
  sink(info); // This should be ignored since dispose is in progress

  await disposePromise;

  // Only the first record should be in buffer
  assertEquals(buffer.length, 1);
  assertEquals(buffer, [trace]);
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
  assertEquals(true, true);
});
