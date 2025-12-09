import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { configure, type LogRecord, reset } from "@logtape/logtape";
import { getLogTapeFastifyLogger } from "./mod.ts";

const test = suite(import.meta);

// Test fixture: Collect log records, filtering out internal LogTape meta logs
function createTestSink(): {
  sink: (record: LogRecord) => void;
  logs: LogRecord[];
} {
  const logs: LogRecord[] = [];
  return {
    // Filter out logtape meta logs automatically
    sink: (record: LogRecord) => {
      if (record.category[0] !== "logtape") {
        logs.push(record);
      }
    },
    logs,
  };
}

// Setup helper
async function setupLogtape(): Promise<{
  logs: LogRecord[];
  cleanup: () => Promise<void>;
}> {
  const { sink, logs } = createTestSink();
  await configure({
    sinks: { test: sink },
    loggers: [{ category: [], sinks: ["test"] }],
  });
  return { logs, cleanup: () => reset() };
}

// ============================================
// Basic Logger Creation Tests
// ============================================

test("getLogTapeFastifyLogger(): creates a Pino-like logger", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();

    assertEquals(typeof logger.info, "function");
    assertEquals(typeof logger.error, "function");
    assertEquals(typeof logger.debug, "function");
    assertEquals(typeof logger.warn, "function");
    assertEquals(typeof logger.trace, "function");
    assertEquals(typeof logger.fatal, "function");
    assertEquals(typeof logger.silent, "function");
    assertEquals(typeof logger.child, "function");
    assertEquals(typeof logger.level, "string");
  } finally {
    await cleanup();
  }
});

test("getLogTapeFastifyLogger(): uses default category ['fastify']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("test message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["fastify"]);
  } finally {
    await cleanup();
  }
});

test("getLogTapeFastifyLogger(): uses custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger({ category: ["myapp", "http"] });
    logger.info("test message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["myapp", "http"]);
  } finally {
    await cleanup();
  }
});

test("getLogTapeFastifyLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger({ category: "myapp" });
    logger.info("test message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["myapp"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Log Level Method Tests - String Messages
// ============================================

test("logger.info(): logs at info level with string message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Hello world");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "info");
    assertEquals(logs[0].rawMessage, "Hello world");
  } finally {
    await cleanup();
  }
});

test("logger.error(): logs at error level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.error("An error occurred");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "error");
    assertEquals(logs[0].rawMessage, "An error occurred");
  } finally {
    await cleanup();
  }
});

test("logger.debug(): logs at debug level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.debug("Debug message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "debug");
    assertEquals(logs[0].rawMessage, "Debug message");
  } finally {
    await cleanup();
  }
});

test("logger.warn(): logs at warning level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.warn("Warning message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "warning");
    assertEquals(logs[0].rawMessage, "Warning message");
  } finally {
    await cleanup();
  }
});

test("logger.trace(): logs at trace level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.trace("Trace message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "trace");
    assertEquals(logs[0].rawMessage, "Trace message");
  } finally {
    await cleanup();
  }
});

test("logger.fatal(): logs at fatal level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.fatal("Fatal error");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "fatal");
    assertEquals(logs[0].rawMessage, "Fatal error");
  } finally {
    await cleanup();
  }
});

test("logger.silent(): is a no-op", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.silent();

    assertEquals(logs.length, 0);
  } finally {
    await cleanup();
  }
});

// ============================================
// Object + Message Tests
// ============================================

test("logger.info(): logs with object and message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info({ userId: 123, action: "login" }, "User logged in");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "info");
    assertEquals(logs[0].rawMessage, "User logged in");
    assertEquals(logs[0].properties.userId, 123);
    assertEquals(logs[0].properties.action, "login");
  } finally {
    await cleanup();
  }
});

test("logger.info(): logs object-only with msg property", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info({ msg: "Hello", data: 456 });

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Hello");
    assertEquals(logs[0].properties.data, 456);
    assertEquals("msg" in logs[0].properties, false);
  } finally {
    await cleanup();
  }
});

test("logger.info(): logs object-only without msg property", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info({ key: "value", num: 789 });

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "{*}");
    assertEquals(logs[0].properties.key, "value");
    assertEquals(logs[0].properties.num, 789);
  } finally {
    await cleanup();
  }
});

// ============================================
// Printf-style Interpolation Tests
// ============================================

test("logger.info(): supports printf-style %s interpolation", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Hello %s", "world");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Hello world");
  } finally {
    await cleanup();
  }
});

test("logger.info(): supports printf-style %d interpolation", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Count: %d", 42);

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Count: 42");
  } finally {
    await cleanup();
  }
});

test("logger.info(): supports printf-style %j interpolation", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Data: %j", { key: "value" });

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, 'Data: {"key":"value"}');
  } finally {
    await cleanup();
  }
});

test("logger.info(): supports printf-style %o interpolation", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Object: %o", { a: 1 });

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, 'Object: {"a":1}');
  } finally {
    await cleanup();
  }
});

test("logger.info(): supports multiple interpolations", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("User %s performed %s %d times", "alice", "login", 3);

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "User alice performed login 3 times");
  } finally {
    await cleanup();
  }
});

test("logger.info(): handles escaped %%", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("100%% complete");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "100% complete");
  } finally {
    await cleanup();
  }
});

test("logger.info(): handles missing interpolation args", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Hello %s %s", "world");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Hello world %s");
  } finally {
    await cleanup();
  }
});

// ============================================
// Child Logger Tests
// ============================================

test("logger.child(): creates a child logger with bindings", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const child = logger.child({ reqId: "abc123" });

    child.info("Request received");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.reqId, "abc123");
  } finally {
    await cleanup();
  }
});

test("logger.child(): returns a PinoLikeLogger", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const child = logger.child({ reqId: "abc123" });

    assertEquals(typeof child.info, "function");
    assertEquals(typeof child.error, "function");
    assertEquals(typeof child.child, "function");
    assertEquals(typeof child.level, "string");
  } finally {
    await cleanup();
  }
});

test("logger.child(): merges bindings with additional properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const child = logger.child({ reqId: "abc123" });

    child.info({ action: "test" }, "Message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.reqId, "abc123");
    assertEquals(logs[0].properties.action, "test");
  } finally {
    await cleanup();
  }
});

test("logger.child(): creates nested child loggers", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const child1 = logger.child({ reqId: "abc123" });
    const child2 = child1.child({ userId: 456 });

    child2.info("Nested log");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.reqId, "abc123");
    assertEquals(logs[0].properties.userId, 456);
  } finally {
    await cleanup();
  }
});

test("logger.child(): child can override parent bindings", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const parent = logger.child({ key: "parent" });
    const child = parent.child({ key: "child" });

    child.info("Test");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.key, "child");
  } finally {
    await cleanup();
  }
});

test("logger.child(): preserves parent category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger({ category: ["myapp"] });
    const child = logger.child({ reqId: "123" });

    child.info("Test");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["myapp"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Level Property Tests
// ============================================

test("logger.level: has default level 'info'", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    assertEquals(logger.level, "info");
  } finally {
    await cleanup();
  }
});

test("logger.level: accepts custom initial level", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger({ level: "debug" });
    assertEquals(logger.level, "debug");
  } finally {
    await cleanup();
  }
});

test("logger.level: is writable", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.level = "error";
    assertEquals(logger.level, "error");
  } finally {
    await cleanup();
  }
});

test("logger.level: child inherits parent level", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger({ level: "debug" });
    const child = logger.child({ reqId: "123" });
    assertEquals(child.level, "debug");
  } finally {
    await cleanup();
  }
});

// ============================================
// Fastify-specific Request/Response Object Tests
// ============================================

test("logger handles serialized request object from Fastify", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const serializedReq = {
      method: "GET",
      url: "/api/users",
      hostname: "localhost",
      remoteAddress: "127.0.0.1",
    };

    logger.info({ req: serializedReq }, "incoming request");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.req, serializedReq);
    assertEquals(logs[0].rawMessage, "incoming request");
  } finally {
    await cleanup();
  }
});

test("logger handles serialized response object from Fastify", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const serializedRes = {
      statusCode: 200,
    };

    logger.info({ res: serializedRes, responseTime: 42 }, "request completed");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.res, serializedRes);
    assertEquals(logs[0].properties.responseTime, 42);
    assertEquals(logs[0].rawMessage, "request completed");
  } finally {
    await cleanup();
  }
});

// ============================================
// Error Object Tests
// ============================================

test("logger.error(): handles error objects in properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    const error = new Error("Something went wrong");

    logger.error({ err: error }, "An error occurred");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "error");
    assertEquals(logs[0].properties.err, error);
    assertEquals(logs[0].rawMessage, "An error occurred");
  } finally {
    await cleanup();
  }
});

// ============================================
// Edge Cases
// ============================================

test("logger handles empty message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "");
  } finally {
    await cleanup();
  }
});

test("logger handles empty object", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info({});

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "{*}");
  } finally {
    await cleanup();
  }
});

test("logger handles null-ish values in interpolation", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Value: %s", null);

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Value: null");
  } finally {
    await cleanup();
  }
});

test("logger handles undefined in interpolation", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogTapeFastifyLogger();
    logger.info("Value: %s", undefined);

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Value: undefined");
  } finally {
    await cleanup();
  }
});

// ============================================
// Integration Tests with Fastify
// ============================================

// Note: Fastify uses internal timers, so we need to disable sanitizers for integration tests
const sanitizerOptions = {
  sanitizeOps: false,
  sanitizeResources: false,
};

test(
  "integration: Fastify server logs requests",
  sanitizerOptions,
  async () => {
    const { default: Fastify } = await import("fastify");
    const { logs, cleanup } = await setupLogtape();
    try {
      const fastify = Fastify({
        loggerInstance: getLogTapeFastifyLogger({
          category: ["fastify", "test"],
        }),
      });

      fastify.get("/", (_request, _reply) => {
        return { hello: "world" };
      });

      await fastify.ready();

      // Make a request using inject (doesn't require actual server)
      const response = await fastify.inject({
        method: "GET",
        url: "/",
      });

      assertEquals(response.statusCode, 200);
      assertEquals(JSON.parse(response.body), { hello: "world" });

      // Fastify should have logged server ready message
      const serverLogs = logs.filter((log) =>
        log.category[0] === "fastify" && log.category[1] === "test"
      );
      assertEquals(serverLogs.length > 0, true);

      await fastify.close();
    } finally {
      await cleanup();
    }
  },
);

test(
  "integration: Fastify request.log creates child logger",
  sanitizerOptions,
  async () => {
    const { default: Fastify } = await import("fastify");
    const { logs, cleanup } = await setupLogtape();
    try {
      const fastify = Fastify({
        loggerInstance: getLogTapeFastifyLogger({ category: ["fastify"] }),
      });

      fastify.get("/test", (request, _reply) => {
        request.log.info({ customProp: "test-value" }, "Request handler log");
        return { ok: true };
      });

      await fastify.ready();

      const response = await fastify.inject({
        method: "GET",
        url: "/test",
      });

      assertEquals(response.statusCode, 200);

      // Find the log from our handler
      const handlerLog = logs.find((log) =>
        log.rawMessage === "Request handler log"
      );
      assertEquals(handlerLog !== undefined, true);
      assertEquals(handlerLog?.properties.customProp, "test-value");
      // Fastify adds reqId to child logger bindings
      assertEquals("reqId" in (handlerLog?.properties ?? {}), true);

      await fastify.close();
    } finally {
      await cleanup();
    }
  },
);

test(
  "integration: Fastify logs at different levels",
  sanitizerOptions,
  async () => {
    const { default: Fastify } = await import("fastify");
    const { logs, cleanup } = await setupLogtape();
    try {
      const fastify = Fastify({
        loggerInstance: getLogTapeFastifyLogger(),
      });

      fastify.get("/levels", (request, _reply) => {
        request.log.debug("Debug message");
        request.log.info("Info message");
        request.log.warn("Warn message");
        request.log.error("Error message");
        return { ok: true };
      });

      await fastify.ready();

      await fastify.inject({
        method: "GET",
        url: "/levels",
      });

      const debugLog = logs.find((log) => log.rawMessage === "Debug message");
      const infoLog = logs.find((log) => log.rawMessage === "Info message");
      const warnLog = logs.find((log) => log.rawMessage === "Warn message");
      const errorLog = logs.find((log) => log.rawMessage === "Error message");

      assertEquals(debugLog?.level, "debug");
      assertEquals(infoLog?.level, "info");
      assertEquals(warnLog?.level, "warning");
      assertEquals(errorLog?.level, "error");

      await fastify.close();
    } finally {
      await cleanup();
    }
  },
);

test(
  "integration: Fastify logs with object properties",
  sanitizerOptions,
  async () => {
    const { default: Fastify } = await import("fastify");
    const { logs, cleanup } = await setupLogtape();
    try {
      const fastify = Fastify({
        loggerInstance: getLogTapeFastifyLogger(),
      });

      fastify.get("/props", (request, _reply) => {
        request.log.info({ userId: 123, action: "test" }, "Action performed");
        return { ok: true };
      });

      await fastify.ready();

      await fastify.inject({
        method: "GET",
        url: "/props",
      });

      const actionLog = logs.find((log) =>
        log.rawMessage === "Action performed"
      );
      assertEquals(actionLog?.properties.userId, 123);
      assertEquals(actionLog?.properties.action, "test");

      await fastify.close();
    } finally {
      await cleanup();
    }
  },
);
