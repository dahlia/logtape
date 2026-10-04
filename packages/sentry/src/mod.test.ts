import assert from "node:assert/strict";
import test from "node:test";
import type { LogRecord } from "@logtape/logtape";
import * as SentryCore from "@sentry/core";
import { getSentrySink, type SentryNamespace } from "./mod.ts";

// Resolved per runtime so expectations match the sink's own formatting
// (util.inspect on Node/Bun, Deno.inspect on Deno, JSON.stringify elsewhere).
import { inspect } from "#util";

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

test("sink handles circular references in interpolated message values", () => {
  const capturedMessages: string[] = [];
  const sentry = createMockSentryNamespace({
    captureMessage: (message) => {
      capturedMessages.push(message.toString());
      return "message-id";
    },
  });
  const sink = getSentrySink({ sentry });

  // A circular value (resembling a Response with a back-reference) used as a
  // message interpolation value.  Previously this hit JSON.stringify's circular
  // structure error inside getParameterizedString(), which the sink swallowed,
  // so captureMessage was never reached.  Now inspect() (util.inspect /
  // Deno.inspect) renders it instead.
  const circular: Record<string, unknown> = { body: "ok" };
  circular.self = circular;

  sink(createMockLogRecord({
    level: "error",
    message: ["Saw error: ", circular, ""],
    rawMessage: "Saw error: {error}",
    properties: { error: circular },
  }));

  assert.strictEqual(capturedMessages.length, 1);
  assert.ok(capturedMessages[0].startsWith("Saw error: "));
  assert.ok(capturedMessages[0].length > "Saw error: ".length);
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

test("sink uses err property as exception fallback", () => {
  let capturedException: unknown;
  let capturedHint: unknown;
  const error = new Error("Test");
  const sink = getSentrySink({
    captureMessage: () => "message-id",
    captureException: (exception, hint) => {
      capturedException = exception;
      capturedHint = hint;
      return "exception-id";
    },
  });

  sink(createMockLogRecord({
    level: "error",
    properties: { error: "not an Error", err: error, requestId: "request-1" },
  }));

  const extra = (capturedHint as { extra: Record<string, unknown> }).extra;
  assert.strictEqual(capturedException, error);
  assert.strictEqual("err" in extra, false);
  assert.strictEqual(extra.error, "not an Error");
  assert.strictEqual(extra.requestId, "request-1");
});

test("sink prefers error property over err property", () => {
  let capturedException: unknown;
  let capturedHint: unknown;
  const error = new Error("Primary");
  const err = new Error("Fallback");
  const sink = getSentrySink({
    captureMessage: () => "message-id",
    captureException: (exception, hint) => {
      capturedException = exception;
      capturedHint = hint;
      return "exception-id";
    },
  });

  sink(createMockLogRecord({
    level: "error",
    properties: { error, err },
  }));

  const extra = (capturedHint as { extra: Record<string, unknown> }).extra;
  assert.strictEqual(capturedException, error);
  assert.strictEqual("error" in extra, false);
  assert.strictEqual(extra.err, err);
});

test("sink uses configured error property names", () => {
  let capturedException: unknown;
  let capturedHint: unknown;
  const error = new Error("Default");
  const exception = new Error("Custom");
  const sink = getSentrySink({
    errorPropertyNames: ["exception"],
    sentry: createMockSentryNamespace({
      captureException: (capturedExceptionValue, hint) => {
        capturedException = capturedExceptionValue;
        capturedHint = hint;
        return "exception-id";
      },
    }),
  });

  sink(createMockLogRecord({
    level: "error",
    properties: { error, exception, requestId: "request-1" },
  }));

  const extra = (capturedHint as { extra: Record<string, unknown> }).extra;
  assert.strictEqual(capturedException, exception);
  assert.strictEqual(extra.error, error);
  assert.strictEqual("exception" in extra, false);
  assert.strictEqual(extra.requestId, "request-1");
});

test("sink uses configured error property order", () => {
  let capturedException: unknown;
  let capturedHint: unknown;
  const error = new Error("Default");
  const exception = new Error("Custom");
  const sink = getSentrySink({
    errorPropertyNames: ["exception", "error"],
    sentry: createMockSentryNamespace({
      captureException: (capturedExceptionValue, hint) => {
        capturedException = capturedExceptionValue;
        capturedHint = hint;
        return "exception-id";
      },
    }),
  });

  sink(createMockLogRecord({
    level: "error",
    properties: { error, exception },
  }));

  const extra = (capturedHint as { extra: Record<string, unknown> }).extra;
  assert.strictEqual(capturedException, exception);
  assert.strictEqual(extra.error, error);
  assert.strictEqual("exception" in extra, false);
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

test("sink accepts breadcrumbs option", () => {
  const breadcrumbs: unknown[] = [];
  const sentry = createMockSentryNamespace({
    getIsolationScope: () => ({
      addBreadcrumb: (breadcrumb) => breadcrumbs.push(breadcrumb),
    }),
  });
  const sink = getSentrySink({ sentry, breadcrumbs: true });

  sink(createMockLogRecord({ level: "info" }));

  assert.strictEqual(breadcrumbs.length, 1);
});

test("breadcrumbs option takes precedence over enableBreadcrumbs", () => {
  const breadcrumbs: unknown[] = [];
  const sentry = createMockSentryNamespace({
    getIsolationScope: () => ({
      addBreadcrumb: (breadcrumb) => breadcrumbs.push(breadcrumb),
    }),
  });
  const sink = getSentrySink({
    sentry,
    enableBreadcrumbs: true,
    breadcrumbs: false,
  });

  sink(createMockLogRecord({ level: "info" }));

  assert.deepStrictEqual(breadcrumbs, []);
});

test("logs level filters records sent through Sentry Logs API", () => {
  const logs: string[] = [];
  const sentry = createMockSentryNamespace({
    getClient: () => ({
      getOptions: () => ({ enableLogs: true }),
    }),
    logger: {
      info: (message) => logs.push(message.toString()),
      warn: (message) => logs.push(message.toString()),
    },
  });
  const sink = getSentrySink({ sentry, logs: { level: "warning" } });

  sink(createMockLogRecord({ level: "info", message: ["Info"] }));
  sink(createMockLogRecord({ level: "warning", message: ["Warning"] }));

  assert.deepStrictEqual(logs, ["Warning"]);
});

test("breadcrumbs level filters records below the minimum level", () => {
  const breadcrumbs: unknown[] = [];
  const sentry = createMockSentryNamespace({
    getIsolationScope: () => ({
      addBreadcrumb: (breadcrumb) => breadcrumbs.push(breadcrumb),
    }),
  });
  const sink = getSentrySink({
    sentry,
    breadcrumbs: { level: "info" },
  });

  sink(createMockLogRecord({ level: "debug" }));
  sink(createMockLogRecord({ level: "info" }));

  assert.strictEqual(breadcrumbs.length, 1);
});

test("breadcrumbs maxLevel filters records above the maximum level", () => {
  const breadcrumbs: unknown[] = [];
  const sentry = createMockSentryNamespace({
    getIsolationScope: () => ({
      addBreadcrumb: (breadcrumb) => breadcrumbs.push(breadcrumb),
    }),
  });
  const sink = getSentrySink({
    sentry,
    breadcrumbs: { maxLevel: "info" },
  });

  sink(createMockLogRecord({ level: "info" }));
  sink(createMockLogRecord({ level: "warning" }));

  assert.strictEqual(breadcrumbs.length, 1);
});

test("logs and breadcrumbs levels can route records separately", () => {
  const logs: string[] = [];
  const breadcrumbs: string[] = [];
  const sentry = createMockSentryNamespace({
    getClient: () => ({
      getOptions: () => ({ enableLogs: true }),
    }),
    getIsolationScope: () => ({
      addBreadcrumb: (breadcrumb) => breadcrumbs.push(breadcrumb.message),
    }),
    logger: {
      info: (message) => logs.push(message.toString()),
      warn: (message) => logs.push(message.toString()),
    },
  });
  const sink = getSentrySink({
    sentry,
    logs: { level: "warning" },
    breadcrumbs: { level: "trace", maxLevel: "info" },
  });

  sink(createMockLogRecord({ level: "info", message: ["Info"] }));
  sink(createMockLogRecord({ level: "warning", message: ["Warning"] }));

  assert.deepStrictEqual(logs, ["Warning"]);
  assert.deepStrictEqual(breadcrumbs, ["Info"]);
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

  assert.deepStrictEqual(capturedMessages, [
    `Error from ${inspect("namespace")}`,
  ]);
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

test("sink does not use the debug logger of a configured Sentry namespace", () => {
  // @sentry/core 9.x exports its internal debug logger as `logger`; the sink
  // must use _INTERNAL_captureLog() instead.
  const printed: unknown[] = [];
  const captured: Record<string, unknown>[] = [];
  const sentry = {
    ...createMockSentryNamespace({
      getClient: () => ({ getOptions: () => ({}) }),
      logger: { info: (message: unknown) => printed.push(message) },
    }),
    _INTERNAL_captureLog: (log: Record<string, unknown>) => captured.push(log),
  };
  (sentry.logger as Record<string, unknown>).isEnabled = () => true;
  const sink = getSentrySink({ sentry });

  sink(createMockLogRecord({ level: "warning", message: ["Hello, world!"] }));

  assert.deepStrictEqual(printed, []);
  assert.strictEqual(captured.length, 1);
  assert.strictEqual(captured[0].level, "warn");
  assert.strictEqual(String(captured[0].message), "Hello, world!");
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
    message: `Hello, ${inspect("world")}!`,
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

// =============================================================================
// Sentry SDK integration tests
// =============================================================================

const sdkMajorVersion = Number.parseInt(SentryCore.SDK_VERSION, 10);

// SDK 10.13.0+ exports the structured logger as `logger` from `@sentry/core`;
// SDK 9.x exports its internal debug logger under the same name instead, and
// SDK 10.0.0 through 10.12.x export neither.
const hasStructuredLogger = typeof (
  SentryCore as { logger?: { fmt?: unknown } }
).logger?.fmt === "function";

// SDK 9.x and 10.x provide the Logs API through _INTERNAL_captureLog() even
// without the structured logger; SDK 8.x has no Logs API.
const hasLogsApi = hasStructuredLogger ||
  typeof (SentryCore as Record<string, unknown>)._INTERNAL_captureLog ===
    "function";

interface EnvelopeItem {
  readonly type: string;
  readonly payload: unknown;
}

interface SentryTestClient {
  readonly items: EnvelopeItem[];
  flush(): Promise<void>;
  close(): void;
}

type ClientConstructor = new (options: Record<string, unknown>) => object;

/**
 * Installs a real Sentry client from `@sentry/core` as the current client.
 * Its transport records envelope items instead of sending them anywhere.
 */
function installSentryTestClient(
  options: Record<string, unknown> = {},
): SentryTestClient {
  const core = SentryCore as unknown as Record<string, unknown>;
  // SDK 8.x exports the base client as `BaseClient`, and SDK 11+ as `Client`.
  const BaseClient = (core.Client ?? core.BaseClient) as ClientConstructor;
  class TestClient extends BaseClient {
    eventFromException(exception: unknown): PromiseLike<unknown> {
      return Promise.resolve({
        exception: { values: [{ type: "Error", value: String(exception) }] },
      });
    }

    eventFromMessage(message: unknown, level?: string): PromiseLike<unknown> {
      return Promise.resolve({ message: String(message), level });
    }
  }

  const items: EnvelopeItem[] = [];
  const createTransport = core.createTransport as (
    options: unknown,
    makeRequest: (
      request: { body: string | Uint8Array },
    ) => PromiseLike<{ statusCode: number }>,
  ) => unknown;
  // initAndBind() is what Sentry.init() uses; unlike setCurrentClient(), it
  // also turns on the SDK's debug logger when the debug option is set.
  const initAndBind = core.initAndBind as (
    clientClass: ClientConstructor,
    options: Record<string, unknown>,
  ) => unknown;
  const client = initAndBind(TestClient, {
    dsn: "https://public@o0.ingest.sentry.io/0",
    integrations: [],
    stackParser: () => [],
    transport: (transportOptions: unknown) =>
      createTransport(transportOptions, (request) => {
        const body = typeof request.body === "string"
          ? request.body
          : new TextDecoder().decode(request.body);
        // An envelope is a header line followed by item header/payload pairs.
        const lines = body.split("\n").filter((line) => line !== "");
        for (let i = 1; i + 1 < lines.length; i += 2) {
          const header = JSON.parse(lines[i]) as { type: string };
          items.push({ type: header.type, payload: JSON.parse(lines[i + 1]) });
        }
        return Promise.resolve({ statusCode: 200 });
      }),
    ...options,
  });

  return {
    items,
    async flush() {
      // Logs are buffered separately from events.
      const flushLogs = core._INTERNAL_flushLogsBuffer as
        | ((client: unknown) => void)
        | undefined;
      flushLogs?.(client);
      await SentryCore.flush(2000);
    },
    close() {
      SentryCore.getCurrentScope().setClient(undefined);
      const debugLogger = core.debug as { disable?: () => void } | undefined;
      debugLogger?.disable?.();
    },
  };
}

interface SerializedLog {
  readonly body: string;
  readonly level: string;
  readonly attributes: Record<string, { readonly value: unknown }>;
}

function getLogs(items: readonly EnvelopeItem[]): SerializedLog[] {
  return items
    .filter((item) => item.type === "log")
    .flatMap((item) => (item.payload as { items: SerializedLog[] }).items);
}

test(
  "sink sends records to Sentry's Logs API with the log settings each SDK " +
    "version requires",
  { skip: !hasLogsApi },
  async () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (!hasLogsApi) return;

    // SDK 11+ removed the enableLogs option and always captures logs.
    const client = installSentryTestClient(
      sdkMajorVersion < 11 ? { enableLogs: true } : {},
    );
    try {
      const sink = getSentrySink();
      sink(createMockLogRecord({
        level: "warning",
        message: ["Hello, world!"],
        properties: { foo: "bar" },
      }));
      await client.flush();
      const logs = getLogs(client.items);
      assert.deepStrictEqual(
        logs.map((log) => ({
          body: log.body,
          level: log.level,
          foo: log.attributes.foo?.value,
          category: log.attributes.category?.value,
        })),
        [{
          body: "Hello, world!",
          level: "warn",
          foo: "bar",
          category: "test.category",
        }],
      );
    } finally {
      client.close();
    }
  },
);

test("@sentry/core provides a Logs API on SDK 9.41.0 or later", () => {
  // Guards the feature-detected tests above: if a future SDK drops both
  // entry points, they would be skipped instead of failing.
  const [major, minor] = SentryCore.SDK_VERSION.split(".").map(Number);
  if (major > 9 || major === 9 && minor >= 41) {
    assert.ok(hasLogsApi, `No Logs API found in SDK ${SentryCore.SDK_VERSION}`);
  }
});

const skipDisabledLogs = !hasLogsApi || sdkMajorVersion >= 11;

test(
  "sink leaves dropping logs to SDKs that have enableLogs: false",
  { skip: skipDisabledLogs },
  async () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (skipDisabledLogs) return;

    const client = installSentryTestClient({ enableLogs: false });
    try {
      const sink = getSentrySink();
      sink(createMockLogRecord());
      await client.flush();
      assert.deepStrictEqual(getLogs(client.items), []);
    } finally {
      client.close();
    }
  },
);

test(
  "sink does not print records through the debug logger of SDK 9.x",
  { skip: hasStructuredLogger },
  () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (hasStructuredLogger) return;

    const client = installSentryTestClient({ debug: true });
    const methods = ["debug", "info", "warn", "error", "log"] as const;
    const originals = methods.map((method) => console[method]);
    const printed: unknown[][] = [];
    for (const method of methods) {
      console[method] = (...args: unknown[]) => printed.push(args);
    }
    try {
      const sink = getSentrySink();
      sink(createMockLogRecord({ message: ["Hello, world!"] }));
    } finally {
      methods.forEach((method, i) => console[method] = originals[i]);
      client.close();
    }
    assert.deepStrictEqual(
      printed.filter((args) =>
        args.some((arg) => `${arg}` === "Hello, world!")
      ),
      [],
    );
  },
);
