// TODO: Add substantial tests for OpenTelemetry integration.
// Current tests only verify basic browser compatibility and that the sink
// can be created without errors. Future tests should include:
// - Actual log record processing and OpenTelemetry output verification
// - Integration with real OpenTelemetry collectors
// - Message formatting and attribute handling
// - Error handling scenarios
// - Performance testing

import assert from "node:assert/strict";
import test from "node:test";
import type { LogRecord } from "@logtape/logtape";
import {
  getOpenTelemetrySink,
  type OpenTelemetrySink,
  type OpenTelemetrySinkExporterOptions,
  type OpenTelemetrySinkProviderOptions,
} from "./mod.ts";

// Helper to create a mock log record
function createMockLogRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    category: ["test", "category"],
    level: "info",
    message: ["Hello, ", { name: "world" }, "!"],
    rawMessage: "Hello, {name}!",
    timestamp: Date.now(),
    properties: {},
    ...overrides,
  };
}

// Mock logger that captures emitted records
interface MockLogRecord {
  severityNumber: number;
  severityText: string;
  body: unknown;
  attributes: Record<string, unknown>;
  timestamp: Date;
}

function createMockLoggerProvider() {
  const emittedRecords: MockLogRecord[] = [];
  let shutdownCalled = false;

  const mockLogger = {
    emit: (record: MockLogRecord) => {
      emittedRecords.push(record);
    },
  };

  const mockLoggerProvider = {
    getLogger: (_name: string, _version?: string) => mockLogger,
    shutdown: () => {
      shutdownCalled = true;
      return Promise.resolve();
    },
  };

  return {
    provider: mockLoggerProvider,
    emittedRecords,
    isShutdownCalled: () => shutdownCalled,
  };
}

// =============================================================================
// Basic sink creation tests
// =============================================================================

test("getOpenTelemetrySink() creates sink without node:process dependency", () => {
  // This test should pass in all environments (Deno, Node.js, browsers)
  // without throwing errors about missing node:process
  const sink = getOpenTelemetrySink();

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() works with explicit serviceName", () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() handles missing environment variables gracefully", () => {
  // Should not throw even if OTEL_SERVICE_NAME is not set
  const sink = getOpenTelemetrySink({
    // serviceName not provided, should fall back to env var
  });

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() with diagnostics enabled", () => {
  const sink = getOpenTelemetrySink({
    diagnostics: true,
  });

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom messageType", () => {
  const sink = getOpenTelemetrySink({
    messageType: "array",
  });

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom objectRenderer", () => {
  const sink = getOpenTelemetrySink({
    objectRenderer: "json",
  });

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom bodyFormatter", () => {
  const sink = getOpenTelemetrySink({
    messageType: (message) => message.join(" "),
  });

  assert.strictEqual(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom loggerProvider", () => {
  const { provider } = createMockLoggerProvider();

  const options: OpenTelemetrySinkProviderOptions = {
    loggerProvider: provider as never,
  };
  const sink = getOpenTelemetrySink(options);

  assert.strictEqual(typeof sink, "function");
  assert.strictEqual(typeof sink[Symbol.asyncDispose], "function");
});

test("getOpenTelemetrySink() exporter options type check", () => {
  // Verify that exporter options work correctly
  const options: OpenTelemetrySinkExporterOptions = {
    serviceName: "test-service",
    otlpExporterConfig: {
      url: "http://localhost:4318/v1/logs",
    },
  };
  const sink = getOpenTelemetrySink(options);

  assert.strictEqual(typeof sink, "function");
  // Lazy initialization means async dispose should be available
  assert.strictEqual(typeof sink[Symbol.asyncDispose], "function");
});

test("getOpenTelemetrySink() sink has async dispose", () => {
  const sink = getOpenTelemetrySink();

  // All sinks should have async dispose for proper cleanup
  assert.strictEqual(typeof sink[Symbol.asyncDispose], "function");
});

// =============================================================================
// Log record processing tests with mock logger provider
// =============================================================================

test("sink emits log records to the logger provider", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  const record = createMockLogRecord();
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
});

test("sink correctly maps log levels to severity numbers", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  const levels = [
    "trace",
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ] as const;
  const expectedSeverities = [1, 5, 9, 13, 17, 21]; // TRACE=1, DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21

  for (let i = 0; i < levels.length; i++) {
    const record = createMockLogRecord({ level: levels[i] });
    sink(record);
  }

  assert.strictEqual(emittedRecords.length, levels.length);
  for (let i = 0; i < levels.length; i++) {
    assert.strictEqual(emittedRecords[i].severityNumber, expectedSeverities[i]);
    assert.strictEqual(emittedRecords[i].severityText, levels[i]);
  }
});

test("sink converts message to string by default", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    messageType: "string",
    objectRenderer: "json",
  });

  const record = createMockLogRecord({
    message: ["Hello, ", "world", "!"],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(emittedRecords[0].body, "Hello, world!");
});

test("sink converts message to array when messageType is 'array'", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    messageType: "array",
    objectRenderer: "json",
  });

  const record = createMockLogRecord({
    message: ["Hello, ", "world", "!"],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.deepStrictEqual(emittedRecords[0].body, ["Hello, ", "world", "!"]);
});

test("sink uses custom bodyFormatter when provided", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    messageType: (message) => `CUSTOM: ${message.filter(Boolean).join("")}`,
    objectRenderer: "json",
  });

  const record = createMockLogRecord({
    message: ["Hello, ", "world", "!"],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(emittedRecords[0].body, "CUSTOM: Hello, world!");
});

test("sink includes category in attributes", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  const record = createMockLogRecord({
    category: ["app", "module", "component"],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.deepStrictEqual(
    emittedRecords[0].attributes["category"],
    ["app", "module", "component"],
  );
});

test("sink converts properties to attributes", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
  });

  const record = createMockLogRecord({
    properties: {
      userId: 123,
      action: "login",
      details: { ip: "127.0.0.1" },
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(emittedRecords[0].attributes["userId"], 123);
  assert.strictEqual(emittedRecords[0].attributes["action"], "login");
  assert.strictEqual(
    emittedRecords[0].attributes["details"],
    '{"ip":"127.0.0.1"}',
  );
});

test("sink correctly converts timestamp", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  const timestamp = 1700000000000;
  const record = createMockLogRecord({ timestamp });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.notStrictEqual(emittedRecords[0].timestamp, null);
  assert.strictEqual(emittedRecords[0].timestamp.getTime(), timestamp);
});

// =============================================================================
// Meta logger filtering tests
// =============================================================================

test("sink ignores logs from logtape.meta.otel category", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  // This should be ignored
  const metaRecord = createMockLogRecord({
    category: ["logtape", "meta", "otel"],
    message: ["Meta log message"],
  });
  sink(metaRecord);

  // This should be emitted
  const normalRecord = createMockLogRecord({
    category: ["app", "module"],
    message: ["Normal log message"],
  });
  sink(normalRecord);

  assert.strictEqual(emittedRecords.length, 1);
  assert.deepStrictEqual(emittedRecords[0].attributes["category"], [
    "app",
    "module",
  ]);
});

test("sink does not ignore partial matches of meta category", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  // These should NOT be ignored (partial matches or different third element)
  sink(createMockLogRecord({ category: ["logtape"] }));
  sink(createMockLogRecord({ category: ["logtape", "meta"] }));
  sink(createMockLogRecord({ category: ["logtape", "meta", "other"] }));

  assert.strictEqual(emittedRecords.length, 3);
});

test("sink ignores logs from logtape.meta.otel with children", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  // Child categories of logtape.meta.otel are also ignored
  // because the filter checks category[0], [1], [2] only
  sink(
    createMockLogRecord({ category: ["logtape", "meta", "otel", "child"] }),
  );

  assert.strictEqual(emittedRecords.length, 0);
});

// =============================================================================
// Async dispose tests
// =============================================================================

test("async dispose calls shutdown on logger provider", async () => {
  const { provider, isShutdownCalled } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  assert.strictEqual(isShutdownCalled(), false);

  await sink[Symbol.asyncDispose]();

  assert.strictEqual(isShutdownCalled(), true);
});

test("async dispose handles provider without shutdown method", async () => {
  const providerWithoutShutdown = {
    getLogger: () => ({
      emit: () => {},
    }),
    // No shutdown method
  };

  const sink = getOpenTelemetrySink({
    loggerProvider: providerWithoutShutdown as never,
  });

  // Should not throw
  await sink[Symbol.asyncDispose]();
});

// =============================================================================
// Edge cases and error handling
// =============================================================================

test("sink handles null/undefined values in properties", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
  });

  const record = createMockLogRecord({
    properties: {
      nullValue: null,
      undefinedValue: undefined,
      validValue: "test",
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  // null and undefined should be skipped
  assert.strictEqual(
    emittedRecords[0].attributes["nullValue"],
    undefined,
  );
  assert.strictEqual(
    emittedRecords[0].attributes["undefinedValue"],
    undefined,
  );
  assert.strictEqual(emittedRecords[0].attributes["validValue"], "test");
});

test("sink handles array values in properties", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
  });

  const record = createMockLogRecord({
    properties: {
      tags: ["a", "b", "c"],
      mixedArray: [1, "two", 3],
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.deepStrictEqual(
    emittedRecords[0].attributes["tags"],
    ["a", "b", "c"],
  );
  // Mixed arrays: implementation converts to strings when types differ
  // but the actual behavior is that it keeps original values after detecting mixed types
  assert.deepStrictEqual(emittedRecords[0].attributes["mixedArray"], [
    1,
    "two",
    3,
  ]);
});

test("sink handles Date objects in properties", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
  });

  const testDate = new Date("2024-01-15T10:30:00.000Z");
  const record = createMockLogRecord({
    properties: {
      timestamp: testDate,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(
    emittedRecords[0].attributes["timestamp"],
    "2024-01-15T10:30:00.000Z",
  );
});

test("sink handles empty message array", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    messageType: "string",
  });

  const record = createMockLogRecord({
    message: [],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(emittedRecords[0].body, "");
});

test("sink handles empty properties object", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  const record = createMockLogRecord({
    properties: {},
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  // Only category should be in attributes
  assert.strictEqual(Object.keys(emittedRecords[0].attributes).length, 1);
  assert.notStrictEqual(emittedRecords[0].attributes["category"], null);
});

test("sink handles unknown log level", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  // Use type assertion to test runtime behavior with an unknown level
  const record = createMockLogRecord({
    level: "custom_level" as LogRecord["level"],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(emittedRecords[0].severityNumber, 0); // UNSPECIFIED
  assert.strictEqual(emittedRecords[0].severityText, "custom_level");
});

// =============================================================================
// Lazy initialization tests (exporter options path)
// =============================================================================

test("lazy init sink can be disposed before any logs", async () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  // Should not throw when disposing before any logs
  await sink[Symbol.asyncDispose]();
});

test("lazy init sink creates function with correct signature", () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  assert.strictEqual(typeof sink, "function");
  assert.strictEqual(sink.length, 1); // Expects one argument (LogRecord)
  assert.strictEqual(typeof sink[Symbol.asyncDispose], "function");
});

// =============================================================================
// Object renderer tests
// =============================================================================

test("objectRenderer 'json' uses JSON.stringify for objects", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    messageType: "string",
  });

  const record = createMockLogRecord({
    message: ["Data: ", { foo: "bar" }, ""],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  assert.strictEqual(emittedRecords[0].body, 'Data: {"foo":"bar"}');
});

test("objectRenderer 'inspect' uses platform inspect function", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "inspect",
    messageType: "string",
  });

  const record = createMockLogRecord({
    message: ["Data: ", { foo: "bar" }, ""],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  // The exact output depends on the runtime's inspect function
  // but it should contain the object representation
  const body = emittedRecords[0].body as string;
  assert.strictEqual(body.includes("foo"), true);
  assert.strictEqual(body.includes("bar"), true);
});

// =============================================================================
// Multiple log records processing
// =============================================================================

test("sink processes multiple log records in order", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    messageType: "string",
  });

  for (let i = 0; i < 5; i++) {
    sink(createMockLogRecord({
      message: [`Message ${i}`],
    }));
  }

  assert.strictEqual(emittedRecords.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(emittedRecords[i].body, `Message ${i}`);
  }
});

test("sink handles rapid succession of logs", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  const count = 100;
  for (let i = 0; i < count; i++) {
    sink(createMockLogRecord({ timestamp: Date.now() + i }));
  }

  assert.strictEqual(emittedRecords.length, count);
});

// =============================================================================
// NoopLogger fallback tests (when no endpoint is configured)
// =============================================================================

test("sink with no endpoint config creates valid sink function", () => {
  // When no endpoint is configured (no env vars, no url in config),
  // the sink should still work without throwing errors
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
    // No otlpExporterConfig.url and no OTEL_EXPORTER_OTLP_ENDPOINT env var
  });

  assert.strictEqual(typeof sink, "function");
  assert.strictEqual(typeof sink[Symbol.asyncDispose], "function");
});

test("sink with no endpoint accepts logs without errors", () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  // Should not throw when logging without an endpoint
  const record = createMockLogRecord();
  sink(record);
  sink(record);
  sink(record);

  // No assertion needed - we're just verifying it doesn't throw
});

test("sink with explicit url in config should not use noop", () => {
  // When a URL is explicitly provided, it should attempt to use a real exporter
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
    otlpExporterConfig: {
      url: "http://localhost:4318/v1/logs",
    },
  });

  assert.strictEqual(typeof sink, "function");
});

test("sink with no endpoint can be disposed cleanly", async () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  // Log something to trigger lazy initialization
  sink(createMockLogRecord());

  // Should not throw when disposing
  await sink[Symbol.asyncDispose]();
});

// =============================================================================
// ready property tests (added in 1.3.1)
// =============================================================================

test("sink has ready property that is a Promise", () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  assert.notStrictEqual(sink.ready, null);
  assert.strictEqual(sink.ready instanceof Promise, true);
});

test("sink with loggerProvider has ready that resolves immediately", async () => {
  const { provider } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  // Should resolve immediately without waiting
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const resolved = await Promise.race([
    sink.ready.then(() => "resolved"),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve("timeout"), 10);
    }),
  ]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);

  assert.strictEqual(resolved, "resolved");
});

test("lazy init sink ready resolves after initialization", async () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  // Send a log to trigger initialization
  sink(createMockLogRecord());

  // ready should eventually resolve
  await sink.ready;

  // Should not throw
  await sink[Symbol.asyncDispose]();
});

// =============================================================================
// Regression test for issue #110: logs during lazy initialization were dropped
// https://github.com/dahlia/logtape/issues/110
// =============================================================================

test("issue #110: multiple logs during sync initialization are all emitted", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
  });

  // Send multiple logs rapidly (simulating what happens after configure())
  sink(createMockLogRecord({ message: ["Log 1"] }));
  sink(createMockLogRecord({ message: ["Log 2"] }));
  sink(createMockLogRecord({ message: ["Log 3"] }));
  sink(createMockLogRecord({ message: ["Log 4"] }));
  sink(createMockLogRecord({ message: ["Log 5"] }));

  // All logs should be emitted (this worked before, but verifies the fix
  // doesn't break synchronous path)
  assert.strictEqual(emittedRecords.length, 5);
});

test("issue #110: sink buffers logs during lazy initialization", async () => {
  // This test verifies that logs sent during lazy initialization are buffered
  // and emitted once initialization completes.
  // Note: We can't directly test the lazy init path with a mock provider,
  // but we can verify the sink accepts multiple logs and completes without error.
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
    // No endpoint configured, so noop logger will be used
  });

  // Send multiple logs rapidly before initialization completes
  for (let i = 0; i < 10; i++) {
    sink(createMockLogRecord({ message: [`Log ${i}`] }));
  }

  // Wait for initialization to complete
  await sink.ready;

  // The sink should have processed all logs without errors
  // (with noop logger they won't actually be sent anywhere,
  // but they shouldn't be dropped either)

  await sink[Symbol.asyncDispose]();
});

test("OpenTelemetrySink type has ready property", () => {
  // Type check: verify OpenTelemetrySink interface includes ready
  const sink: OpenTelemetrySink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  // TypeScript should allow accessing ready property
  const _ready: Promise<void> = sink.ready;
  assert.notStrictEqual(_ready, null);
});

// =============================================================================
// Error object serialization tests (issue #123)
// =============================================================================

test("sink serializes Error objects in properties with JSON renderer (raw mode)", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    exceptionAttributes: "raw",
  });

  const testError = new Error("Something went wrong");
  testError.stack = "Error: Something went wrong\n  at test.ts:1:1";

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const errorAttr = emittedRecords[0].attributes["error"] as string;
  // Should not be an empty object
  assert.strictEqual(errorAttr.includes("Something went wrong"), true);
  assert.strictEqual(errorAttr.includes("name"), true);
  assert.strictEqual(errorAttr.includes("message"), true);
  assert.strictEqual(errorAttr.includes("stack"), true);
});

test("sink serializes Error with cause (raw mode)", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    exceptionAttributes: "raw",
  });

  const cause = new Error("Root cause");
  const testError = new Error("Something went wrong", { cause });

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const errorAttr = emittedRecords[0].attributes["error"] as string;
  assert.strictEqual(errorAttr.includes("cause"), true);
  assert.strictEqual(errorAttr.includes("Root cause"), true);
});

test("sink serializes AggregateError with errors array (raw mode)", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    exceptionAttributes: "raw",
  });

  const errors = [
    new Error("Error 1"),
    new Error("Error 2"),
  ];
  const aggregateError = new AggregateError(
    errors,
    "Multiple errors occurred",
  );

  const record = createMockLogRecord({
    properties: {
      error: aggregateError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const errorAttr = emittedRecords[0].attributes["error"] as string;
  assert.strictEqual(errorAttr.includes("errors"), true);
  assert.strictEqual(errorAttr.includes("Error 1"), true);
  assert.strictEqual(errorAttr.includes("Error 2"), true);
});

test("sink serializes Error with custom properties (raw mode)", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    exceptionAttributes: "raw",
  });

  const testError = new Error("Custom error") as Error & {
    code: string;
    statusCode: number;
  };
  testError.code = "ERR_CUSTOM";
  testError.statusCode = 500;

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const errorAttr = emittedRecords[0].attributes["error"] as string;
  assert.strictEqual(errorAttr.includes("ERR_CUSTOM"), true);
  assert.strictEqual(errorAttr.includes("500"), true);
});

test("sink handles Error in message values with JSON renderer (raw mode)", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    messageType: "string",
    exceptionAttributes: "raw",
  });

  const testError = new Error("Message error");

  const record = createMockLogRecord({
    message: ["Error occurred: ", testError, ""],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const body = emittedRecords[0].body as string;
  assert.strictEqual(body.includes("Message error"), true);
  assert.strictEqual(body.includes("name"), true);
});

test("sink uses semantic conventions for Error in properties (default)", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
  });

  const testError = new Error("Something went wrong");
  testError.stack = "Error: Something went wrong\n  at test.ts:1:1";

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const attrs = emittedRecords[0].attributes;
  assert.strictEqual(attrs["exception.type"], "Error");
  assert.strictEqual(attrs["exception.message"], "Something went wrong");
  assert.strictEqual(
    attrs["exception.stacktrace"],
    "Error: Something went wrong\n  at test.ts:1:1",
  );
  // Original error property should not exist
  assert.strictEqual(attrs["error"], undefined);
});

test("sink uses semantic conventions for Error with explicit semconv mode", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    exceptionAttributes: "semconv",
  });

  const testError = new TypeError("Type mismatch");
  testError.stack = "TypeError: Type mismatch\n  at check.ts:42:10";

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const attrs = emittedRecords[0].attributes;
  assert.strictEqual(attrs["exception.type"], "TypeError");
  assert.strictEqual(attrs["exception.message"], "Type mismatch");
  assert.strictEqual(
    attrs["exception.stacktrace"],
    "TypeError: Type mismatch\n  at check.ts:42:10",
  );
});

test("sink handles Error without stack in semconv mode", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    exceptionAttributes: "semconv",
  });

  const testError = new Error("No stack");
  delete testError.stack;

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const attrs = emittedRecords[0].attributes;
  assert.strictEqual(attrs["exception.type"], "Error");
  assert.strictEqual(attrs["exception.message"], "No stack");
  assert.strictEqual(attrs["exception.stacktrace"], undefined);
});

test("sink preserves non-Error properties with semconv mode", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    exceptionAttributes: "semconv",
  });

  const testError = new Error("Test error");
  testError.stack = "Error: Test error\n  at test.ts:1:1";

  const record = createMockLogRecord({
    properties: {
      error: testError,
      requestId: "abc123",
      userId: 42,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const attrs = emittedRecords[0].attributes;
  assert.strictEqual(attrs["exception.type"], "Error");
  assert.strictEqual(attrs["exception.message"], "Test error");
  assert.strictEqual(attrs["requestId"], "abc123");
  assert.strictEqual(attrs["userId"], 42);
});

test("sink with exceptionAttributes: false treats Error as object", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    exceptionAttributes: false,
  });

  const testError = new Error("Treated as object");

  const record = createMockLogRecord({
    properties: {
      error: testError,
    },
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const attrs = emittedRecords[0].attributes;
  // Should be serialized as JSON, but as a plain object (likely empty {})
  assert.strictEqual(attrs["error"], "{}");
  assert.strictEqual(attrs["exception.type"], undefined);
  assert.strictEqual(attrs["exception.message"], undefined);
  assert.strictEqual(attrs["exception.stacktrace"], undefined);
});

test("sink handles Error in message body with semconv mode", () => {
  const { provider, emittedRecords } = createMockLoggerProvider();
  const sink = getOpenTelemetrySink({
    loggerProvider: provider as never,
    objectRenderer: "json",
    messageType: "string",
    exceptionAttributes: "semconv",
  });

  const testError = new Error("Message error");
  testError.stack = "Error: Message error\n  at app.ts:10:5";

  const record = createMockLogRecord({
    message: ["Error occurred: ", testError, ""],
  });
  sink(record);

  assert.strictEqual(emittedRecords.length, 1);
  const body = emittedRecords[0].body as string;
  // In message body, errors are still serialized as JSON (not converted to semconv)
  assert.strictEqual(body.includes("Message error"), true);
  assert.strictEqual(body.includes("name"), true);
  // Semantic conventions should NOT be in attributes for message-level errors
  const attrs = emittedRecords[0].attributes;
  assert.strictEqual(attrs["exception.type"], undefined);
});
