import assert from "node:assert/strict";
import test from "node:test";
import type { LogRecord } from "@logtape/logtape";
import { getSentrySink, type SentryNamespace } from "./mod.ts";

// Helper to create a mock log record
function createMockLogRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    category: ["test", "category"],
    level: "info",
    message: ["Hello, ", "world", "!"],
    rawMessage: "Hello, {name}!",
    timestamp: Date.now(),
    properties: {},
    ...overrides,
  };
}

function createMockSentryNamespace(
  overrides: Partial<SentryNamespace> = {},
): SentryNamespace {
  return {
    captureMessage: () => "message-id",
    captureException: () => "exception-id",
    getActiveSpan: () => undefined,
    getClient: () => undefined,
    getIsolationScope: () => undefined,
    ...overrides,
  };
}

// =============================================================================
// Sink creation tests
// =============================================================================

test("getSentrySink() creates sink without parameters", () => {
  const sink = getSentrySink();
  assert.strictEqual(typeof sink, "function");
});

test("getSentrySink() accepts deprecated client parameter", () => {
  // Deprecated client path still works (logs warning via meta logger)
  const mockClient = {
    captureMessage: () => "id",
    captureException: () => "id",
  };
  const sink = getSentrySink(mockClient);
  assert.strictEqual(typeof sink, "function");
});

test("getSentrySink() accepts Sentry SDK namespace option", () => {
  const sink = getSentrySink({ sentry: createMockSentryNamespace() });
  assert.strictEqual(typeof sink, "function");
});

test("getSentrySink() throws on invalid parameter type", () => {
  let threw = false;
  try {
    // @ts-expect-error Testing invalid input
    getSentrySink("invalid");
  } catch (e) {
    threw = true;
    assert.ok((e as Error).message.includes("Invalid parameter"));
  }
  assert.ok(threw);
});

// =============================================================================
// beforeSend hook tests
// =============================================================================

test("beforeSend can transform records", () => {
  const transformedRecords: LogRecord[] = [];

  const sink = getSentrySink({
    beforeSend: (record) => {
      const transformed = {
        ...record,
        properties: { ...record.properties, transformed: true },
      };
      transformedRecords.push(transformed);
      return transformed;
    },
  });

  sink(createMockLogRecord());

  assert.strictEqual(transformedRecords.length, 1);
  assert.strictEqual(transformedRecords[0].properties.transformed, true);
});

test("beforeSend can filter records by returning null", () => {
  let processedCount = 0;

  const sink = getSentrySink({
    beforeSend: (record) => {
      if (record.level === "debug") {
        return null;
      }
      processedCount++;
      return record;
    },
  });

  sink(createMockLogRecord({ level: "debug" }));
  sink(createMockLogRecord({ level: "info" }));
  sink(createMockLogRecord({ level: "debug" }));
  sink(createMockLogRecord({ level: "error" }));

  assert.strictEqual(processedCount, 2);
});

// =============================================================================
// Error resilience tests
// =============================================================================

test("sink never throws even when beforeSend throws", () => {
  const sink = getSentrySink({
    beforeSend: () => {
      throw new Error("beforeSend error");
    },
  });

  // Should not throw
  sink(createMockLogRecord());
});

test("sink handles circular references in properties", () => {
  const sink = getSentrySink();

  const circular: Record<string, unknown> = { name: "test" };
  circular.self = circular;

  // Should not throw
  sink(createMockLogRecord({
    properties: { data: circular },
  }));
});

// =============================================================================
// Behavior verification tests
// =============================================================================

test("sink with Error at error level triggers exception path", () => {
  let sawError = false;
  const sink = getSentrySink({
    beforeSend: (record) => {
      if (record.properties.error instanceof Error) {
        sawError = true;
      }
      return record;
    },
  });

  sink(createMockLogRecord({
    level: "error",
    properties: { error: new Error("Test") },
  }));

  assert.strictEqual(sawError, true);
});

test("sink without Error at error level does not trigger exception path", () => {
  let sawError = false;
  const sink = getSentrySink({
    beforeSend: (record) => {
      sawError = record.properties.error instanceof Error;
      return record;
    },
  });

  sink(createMockLogRecord({
    level: "error",
    message: ["Error without Error instance"],
  }));

  assert.strictEqual(sawError, false);
});

test("sink processes all log levels without error", () => {
  const sink = getSentrySink();
  const levels: LogRecord["level"][] = [
    "trace",
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ];

  for (const level of levels) {
    sink(createMockLogRecord({ level }));
  }
});

test("sink handles template messages correctly", () => {
  let capturedMessage: readonly unknown[] | null = null;
  const sink = getSentrySink({
    beforeSend: (record) => {
      capturedMessage = record.message;
      return record;
    },
  });

  sink(createMockLogRecord({
    message: ["User ", { id: 123 }, " logged in"],
  }));

  assert.strictEqual(capturedMessage!.length, 3);
  assert.strictEqual(capturedMessage![0], "User ");
  assert.strictEqual((capturedMessage![1] as { id: number }).id, 123);
});

// =============================================================================
// Options tests
// =============================================================================

test("sink accepts enableBreadcrumbs option", () => {
  const sink = getSentrySink({ enableBreadcrumbs: true });

  // Should not throw
  sink(createMockLogRecord({ level: "info" }));
  sink(createMockLogRecord({ level: "debug" }));
});

test("sink uses configured Sentry namespace for error messages", () => {
  const capturedMessages: string[] = [];
  const sentry = createMockSentryNamespace({
    captureMessage: (message) => {
      capturedMessages.push(message.toString());
      return "message-id";
    },
  });
  const sink = getSentrySink({ sentry });

  sink(createMockLogRecord({
    level: "error",
    message: ["Error from ", "namespace"],
  }));

  assert.deepStrictEqual(capturedMessages, ['Error from "namespace"']);
});

test("sink uses configured Sentry namespace for exceptions", () => {
  const capturedExceptions: unknown[] = [];
  const error = new Error("Test");
  const sentry = createMockSentryNamespace({
    captureException: (exception) => {
      capturedExceptions.push(exception);
      return "exception-id";
    },
  });
  const sink = getSentrySink({ sentry });

  sink(createMockLogRecord({
    level: "error",
    properties: { error },
  }));

  assert.deepStrictEqual(capturedExceptions, [error]);
});

test("sink uses configured Sentry namespace for spans and structured logs", () => {
  const logs: Record<string, unknown>[] = [];
  const sentry = createMockSentryNamespace({
    getActiveSpan: () => ({
      spanContext: () => ({
        traceId: "trace-id",
        spanId: "span-id",
        parentSpanId: "parent-span-id",
      }),
    }),
    getClient: () => ({
      getOptions: () => ({ enableLogs: true }),
    }),
    logger: {
      info: (_message, attributes) => logs.push(attributes),
    },
  });
  const sink = getSentrySink({ sentry });

  sink(createMockLogRecord({ level: "info" }));

  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].trace_id, "trace-id");
  assert.strictEqual(logs[0].span_id, "span-id");
  assert.strictEqual(logs[0].parent_span_id, "parent-span-id");
});

test("sink uses configured Sentry namespace for breadcrumbs", () => {
  const breadcrumbs: unknown[] = [];
  const sentry = createMockSentryNamespace({
    getIsolationScope: () => ({
      addBreadcrumb: (breadcrumb) => breadcrumbs.push(breadcrumb),
    }),
  });
  const sink = getSentrySink({ sentry, enableBreadcrumbs: true });

  sink(createMockLogRecord({ level: "info", timestamp: 1000 }));

  assert.strictEqual(breadcrumbs.length, 1);
  assert.deepStrictEqual(breadcrumbs[0], {
    category: "test.category",
    level: "info",
    message: 'Hello, "world"!',
    timestamp: 1,
    data: {
      "sentry.origin": "auto.logging.logtape",
      category: "test.category",
      timestamp: 1000,
    },
  });
});

// =============================================================================
// Meta logger filtering tests
// =============================================================================

test("sink ignores logs from logtape.meta.sentry category", () => {
  let processedCount = 0;
  const sink = getSentrySink({
    beforeSend: (record) => {
      processedCount++;
      return record;
    },
  });

  // This should be ignored (meta logger category)
  sink(createMockLogRecord({
    category: ["logtape", "meta", "sentry"],
    message: ["Meta log message"],
  }));

  // This should be processed
  sink(createMockLogRecord({
    category: ["app", "module"],
    message: ["Normal log message"],
  }));

  assert.strictEqual(processedCount, 1);
});

test("sink does not ignore partial matches of meta category", () => {
  let processedCount = 0;
  const sink = getSentrySink({
    beforeSend: (record) => {
      processedCount++;
      return record;
    },
  });

  // These should NOT be ignored (partial matches or different third element)
  sink(createMockLogRecord({ category: ["logtape"] }));
  sink(createMockLogRecord({ category: ["logtape", "meta"] }));
  sink(createMockLogRecord({ category: ["logtape", "meta", "other"] }));

  assert.strictEqual(processedCount, 3);
});

test("sink ignores logtape.meta.sentry with child categories", () => {
  let processedCount = 0;
  const sink = getSentrySink({
    beforeSend: (record) => {
      processedCount++;
      return record;
    },
  });

  // Child categories of logtape.meta.sentry should also be ignored
  sink(createMockLogRecord({
    category: ["logtape", "meta", "sentry", "child"],
  }));

  assert.strictEqual(processedCount, 0);
});
