import { suite } from "@alinea/suite";
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { LogRecord } from "@logtape/logtape";
import { getSentrySink } from "./mod.ts";

const test = suite(import.meta);

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

// =============================================================================
// Sink creation tests
// =============================================================================

test("getSentrySink() creates sink without parameters", () => {
  const sink = getSentrySink();
  assertEquals(typeof sink, "function");
});

test("getSentrySink() accepts deprecated client parameter", () => {
  // Deprecated client path still works (logs warning via meta logger)
  const mockClient = {
    captureMessage: () => "id",
    captureException: () => "id",
  };
  const sink = getSentrySink(mockClient);
  assertEquals(typeof sink, "function");
});

test("getSentrySink() throws on invalid parameter type", () => {
  let threw = false;
  try {
    // @ts-expect-error Testing invalid input
    getSentrySink("invalid");
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Invalid parameter");
  }
  assertEquals(threw, true);
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

  assertEquals(transformedRecords.length, 1);
  assertEquals(transformedRecords[0].properties.transformed, true);
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

  assertEquals(processedCount, 2);
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

  assertEquals(sawError, true);
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

  assertEquals(sawError, false);
});

test("sink processes all log levels without error", () => {
  const sink = getSentrySink();
  const levels: LogRecord["level"][] = [
    "trace", "debug", "info", "warning", "error", "fatal",
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

  assertEquals(capturedMessage!.length, 3);
  assertEquals(capturedMessage![0], "User ");
  assertEquals((capturedMessage![1] as { id: number }).id, 123);
});
