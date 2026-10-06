import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import { configure, getLogger, type LogRecord, reset } from "@logtape/logtape";
import Koa from "koa";
import {
  type CompletionLevelFunction,
  type KoaContext,
  koaLogger,
  type KoaMiddleware,
} from "./mod.ts";

// Test fixture: Collect log records, filtering out internal LogTape meta logs
function createTestSink(options: { includeMeta?: boolean } = {}): {
  sink: (record: LogRecord) => void;
  logs: LogRecord[];
} {
  const logs: LogRecord[] = [];
  return {
    sink: (record: LogRecord) => {
      if (options.includeMeta || record.category[0] !== "logtape") {
        logs.push(record);
      }
    },
    logs,
  };
}

// Setup helper
async function setupLogtape(options: {
  contextLocalStorage?: boolean;
  includeMeta?: boolean;
} = {}): Promise<{
  logs: LogRecord[];
  cleanup: () => Promise<void>;
}> {
  const { sink, logs } = createTestSink({
    includeMeta: options.includeMeta,
  });
  await configure({
    sinks: { test: sink },
    loggers: [{ category: [], sinks: ["test"] }],
    contextLocalStorage: options.contextLocalStorage
      ? new AsyncLocalStorage()
      : undefined,
  });
  return { logs, cleanup: () => reset() };
}

function useFixedDateNow(timestamp: number): () => void {
  const originalDateNow = Date.now;
  Date.now = () => timestamp;
  return () => {
    Date.now = originalDateNow;
  };
}

interface MockKoaContext extends KoaContext {
  readonly responseHeaders: Record<string, string>;
}

// Mock Koa context
function createMockContext(
  overrides: Partial<KoaContext> = {},
): MockKoaContext {
  const responseHeaders: Record<string, string> = {};
  return {
    method: "GET",
    url: "/test",
    path: "/test",
    status: 200,
    ip: "127.0.0.1",
    response: {
      length: undefined,
    },
    req: {
      httpVersion: "1.1",
    },
    get: (field: string) => {
      const headers: Record<string, string> = {
        "user-agent": "test-agent/1.0",
        "referer": "http://example.com",
        "referrer": "http://example.com",
      };
      return headers[field.toLowerCase()] ?? "";
    },
    set: (field: string, value: string) => {
      responseHeaders[field.toLowerCase()] = value;
    },
    responseHeaders,
    ...overrides,
  };
}

// Helper to run middleware
async function runMiddleware(
  middleware: KoaMiddleware,
  ctx: KoaContext,
  next: () => Promise<void> = async () => {},
): Promise<void> {
  await middleware(ctx, next);
}

// ============================================
// Basic Middleware Creation Tests
// ============================================

test("koaLogger(): creates a middleware function", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    assert.strictEqual(typeof middleware, "function");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs request after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// Category Configuration Tests
// ============================================

test("koaLogger(): uses default category ['koa']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["koa"]);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): uses custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ category: ["myapp", "http"] });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp", "http"]);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ category: "myapp" });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Log Level Tests
// ============================================

test("koaLogger(): uses default log level 'info'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "info");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): uses custom log level 'debug'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ level: "debug" });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): uses custom log level 'warning'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ level: "warning" });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "warning");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Combined (default)
// ============================================

test("koaLogger(): combined format logs structured properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ format: "combined" });
    const ctx = createMockContext({
      response: { length: 123 },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    const props = logs[0].properties;
    assert.strictEqual(props.method, "GET");
    assert.strictEqual(props.url, "/test");
    assert.strictEqual(props.path, "/test");
    assert.strictEqual(props.status, 200);
    assert.notStrictEqual(props.responseTime, null);
    assert.strictEqual(props.contentLength, 123);
    assert.strictEqual(props.remoteAddr, "127.0.0.1");
    assert.strictEqual(props.userAgent, "test-agent/1.0");
    assert.strictEqual(props.referrer, "http://example.com");
  } finally {
    await cleanup();
  }
});

test(
  "koaLogger(): structured-combined format logs structured properties",
  async () => {
    const { logs, cleanup } = await setupLogtape();
    try {
      const middleware = koaLogger({ format: "structured-combined" });
      const ctx = createMockContext({
        response: { length: 123 },
      });

      await runMiddleware(middleware, ctx);

      assert.strictEqual(logs.length, 1);
      const props = logs[0].properties;
      assert.strictEqual(props.method, "GET");
      assert.strictEqual(props.url, "/test");
      assert.strictEqual(props.path, "/test");
      assert.strictEqual(props.status, 200);
      assert.notStrictEqual(props.responseTime, null);
      assert.strictEqual(props.contentLength, 123);
      assert.strictEqual(props.remoteAddr, "127.0.0.1");
      assert.strictEqual(props.userAgent, "test-agent/1.0");
      assert.strictEqual(props.referrer, "http://example.com");
    } finally {
      await cleanup();
    }
  },
);

// ============================================
// Format Tests - Common
// ============================================

test("koaLogger(): common format excludes referrer and userAgent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ format: "common" });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    const props = logs[0].properties;
    assert.strictEqual(props.method, "GET");
    assert.strictEqual(props.path, "/test");
    assert.strictEqual(props.status, 200);
    assert.strictEqual(props.referrer, undefined);
    assert.strictEqual(props.userAgent, undefined);
  } finally {
    await cleanup();
  }
});

test(
  "koaLogger(): structured-common format excludes referrer and userAgent",
  async () => {
    const { logs, cleanup } = await setupLogtape();
    try {
      const middleware = koaLogger({ format: "structured-common" });
      const ctx = createMockContext();

      await runMiddleware(middleware, ctx);

      assert.strictEqual(logs.length, 1);
      const props = logs[0].properties;
      assert.strictEqual(props.method, "GET");
      assert.strictEqual(props.path, "/test");
      assert.strictEqual(props.status, 200);
      assert.strictEqual(props.referrer, undefined);
      assert.strictEqual(props.userAgent, undefined);
    } finally {
      await cleanup();
    }
  },
);

// ============================================
// Format Tests - Morgan
// ============================================

test("koaLogger(): morgan-combined format returns access log", async () => {
  const { logs, cleanup } = await setupLogtape();
  const restoreDateNow = useFixedDateNow(Date.UTC(2000, 9, 10, 13, 55, 36));
  try {
    const middleware = koaLogger({ format: "morgan-combined" });
    const ctx = createMockContext({
      ip: "203.0.113.7",
      method: "POST",
      url: "/test?name=alice",
      path: "/test",
      status: 201,
      response: { length: 42 },
      get: (field: string) => {
        const headers: Record<string, string> = {
          "authorization": "Basic ZnJhbms6c2VjcmV0",
          "user-agent": 'test-agent "quoted"',
          "referrer": "http://example.com/start",
          "referer": "http://example.com/start",
        };
        return headers[field.toLowerCase()] ?? "";
      },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].rawMessage,
      '203.0.113.7 - frank [10/Oct/2000:13:55:36 +0000] "POST /test?name=alice HTTP/1.1" 201 42 "http://example.com/start" "test-agent \\"quoted\\""',
    );
  } finally {
    restoreDateNow();
    await cleanup();
  }
});

test("koaLogger(): morgan-common format returns access log", async () => {
  const { logs, cleanup } = await setupLogtape();
  const restoreDateNow = useFixedDateNow(Date.UTC(2000, 9, 10, 13, 55, 36));
  try {
    const middleware = koaLogger({ format: "morgan-common" });
    const ctx = createMockContext({
      ip: "",
      status: 204,
      response: { length: undefined },
      req: {},
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].rawMessage,
      '- - - [10/Oct/2000:13:55:36 +0000] "GET /test HTTP/-" 204 -',
    );
  } finally {
    restoreDateNow();
    await cleanup();
  }
});

// ============================================
// Format Tests - Dev
// ============================================

test("koaLogger(): dev format returns string message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ format: "dev" });
    const ctx = createMockContext({
      method: "POST",
      path: "/api/users",
      status: 201,
      response: { length: 456 },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("POST"));
    assert.ok(msg.includes("/api/users"));
    assert.ok(msg.includes("201"));
    assert.ok(msg.includes("ms"));
    assert.ok(msg.includes("456"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Short
// ============================================

test("koaLogger(): short format includes remote addr", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ format: "short" });
    const ctx = createMockContext({
      ip: "192.168.1.1",
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("192.168.1.1"));
    assert.ok(msg.includes("GET"));
    assert.ok(msg.includes("/test"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Tiny
// ============================================

test("koaLogger(): tiny format is minimal", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ format: "tiny" });
    const ctx = createMockContext({ status: 404 });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("GET"));
    assert.ok(msg.includes("/test"));
    assert.ok(msg.includes("404"));
    assert.ok(msg.includes("ms"));
    // Tiny format should NOT include remote addr
    assert.ok(!msg.includes("127.0.0.1"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Custom Format Function Tests
// ============================================

test("koaLogger(): custom format returning string", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      format: (ctx: KoaContext, _responseTime: number) =>
        `Custom: ${ctx.method} ${ctx.status}`,
    });
    const ctx = createMockContext({ method: "DELETE", status: 204 });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "Custom: DELETE 204");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): custom format returning object", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      format: (ctx: KoaContext, responseTime: number) => ({
        customMethod: ctx.method,
        customStatus: ctx.status,
        customDuration: responseTime,
      }),
    });
    const ctx = createMockContext({ method: "PATCH", status: 202 });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.customMethod, "PATCH");
    assert.strictEqual(logs[0].properties.customStatus, 202);
    assert.notStrictEqual(logs[0].properties.customDuration, null);
  } finally {
    await cleanup();
  }
});

// ============================================
// Skip Function Tests
// ============================================

test("koaLogger(): skip function prevents logging when returns true", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      skip: () => true,
    });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): skip function allows logging when returns false", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      skip: () => false,
    });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): skip function receives context", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      skip: (ctx: KoaContext) => ctx.path === "/health",
    });

    // Health endpoint should be skipped
    const healthCtx = createMockContext({ path: "/health" });
    await runMiddleware(middleware, healthCtx);
    assert.strictEqual(logs.length, 0);

    // Other endpoints should be logged
    const testCtx = createMockContext({ path: "/test" });
    await runMiddleware(middleware, testCtx);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// logRequest (Immediate) Mode Tests
// ============================================

test("koaLogger(): logRequest mode logs at request start", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ logRequest: true });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.responseTime, 0); // Zero because it's immediate
  } finally {
    await cleanup();
  }
});

test("koaLogger(): non-logRequest mode logs after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({ logRequest: false });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx, async () => {
      // Small delay to ensure non-zero response time
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    assert.strictEqual(logs.length, 1);
    assert.ok((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

// ============================================
// Request Context Tests
// ============================================

test("koaLogger(): context true uses incoming request ID", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const appLogger = getLogger(["app"]);
    const middleware = koaLogger({ context: true });
    const ctx = createMockContext({
      get: (field: string) => {
        const headers: Record<string, string> = {
          "x-request-id": "request-123",
          "user-agent": "test-agent/1.0",
        };
        return headers[field.toLowerCase()] ?? "";
      },
    });

    await runMiddleware(middleware, ctx, () => {
      appLogger.info("Handled request");
      return Promise.resolve();
    });

    assert.strictEqual(ctx.responseHeaders["x-request-id"], "request-123");
    assert.strictEqual(logs.length, 2);
    assert.deepStrictEqual(logs[0].category, ["app"]);
    assert.strictEqual(logs[0].properties.requestId, "request-123");
    assert.strictEqual(logs[1].properties.requestId, "request-123");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): context true generates missing request ID", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = koaLogger({
      context: { requestId: { generate: () => "generated-123" } },
    });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(ctx.responseHeaders["x-request-id"], "generated-123");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.requestId, "generated-123");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): context supports custom options", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = koaLogger({
      context: {
        requestId: {
          property: "correlationId",
          headerNames: ["x-correlation-id", "x-request-id"],
          responseHeader: "x-correlation-id",
          normalize: (value) => value.trim().toUpperCase(),
        },
        include: ["requestId", "method", "path", "remoteAddr"],
        enrich: (ctx) => ({ route: ctx.path }),
      },
    });
    const ctx = createMockContext({
      ip: "203.0.113.1",
      get: (field: string) => {
        const headers: Record<string, string> = {
          "x-correlation-id": " custom-123 ",
        };
        return headers[field.toLowerCase()] ?? "";
      },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(ctx.responseHeaders["x-correlation-id"], "CUSTOM-123");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.correlationId, "CUSTOM-123");
    assert.strictEqual(logs[0].properties.method, "GET");
    assert.strictEqual(logs[0].properties.path, "/test");
    assert.strictEqual(logs[0].properties.remoteAddr, "203.0.113.1");
    assert.strictEqual(logs[0].properties.route, "/test");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): context keeps implicit context when skipped", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const appLogger = getLogger(["app"]);
    const middleware = koaLogger({
      context: { requestId: { generate: () => "skip-123" } },
      skip: () => true,
    });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx, () => {
      appLogger.info("Handled skipped request");
      return Promise.resolve();
    });

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["app"]);
    assert.strictEqual(logs[0].properties.requestId, "skip-123");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): context works with logRequest", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = koaLogger({
      context: { requestId: { generate: () => "immediate-123" } },
      logRequest: true,
    });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx);

    assert.strictEqual(ctx.responseHeaders["x-request-id"], "immediate-123");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.requestId, "immediate-123");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): missing context storage still logs request ID", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const appLogger = getLogger(["app"]);
    const middleware = koaLogger({
      context: { requestId: { generate: () => "no-storage-123" } },
    });
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx, () => {
      appLogger.info("Handled request");
      return Promise.resolve();
    });

    const appLog = logs.find((record) => record.category[0] === "app");
    const requestLog = logs.find((record) => record.category[0] === "koa");
    const metaLog = logs.find((record) =>
      record.category[0] === "logtape" && record.category[1] === "meta" &&
      record.level === "warning"
    );
    assert.ok(appLog);
    assert.ok(requestLog);
    assert.ok(metaLog);
    assert.strictEqual(appLog.properties.requestId, undefined);
    assert.strictEqual(requestLog.properties.requestId, "no-storage-123");
    assert.strictEqual(metaLog.level, "warning");
  } finally {
    await cleanup();
  }
});

// ============================================
// Request Property Tests
// ============================================

test("koaLogger(): logs correct method", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();

    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
    for (const method of methods) {
      const ctx = createMockContext({ method });
      await runMiddleware(middleware, ctx);
    }

    assert.strictEqual(logs.length, methods.length);
    for (let i = 0; i < methods.length; i++) {
      assert.strictEqual(logs[i].properties.method, methods[i]);
    }
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs path correctly", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({ path: "/api/v1/users" });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.path, "/api/v1/users");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs status code", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();

    const statusCodes = [200, 201, 301, 400, 404, 500];
    for (const status of statusCodes) {
      const ctx = createMockContext({ status });
      await runMiddleware(middleware, ctx);
    }

    assert.strictEqual(logs.length, statusCodes.length);
    for (let i = 0; i < statusCodes.length; i++) {
      assert.strictEqual(logs[i].properties.status, statusCodes[i]);
    }
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs response time as number", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext();

    await runMiddleware(middleware, ctx, async () => {
      // Add small delay to ensure non-zero response time
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(typeof logs[0].properties.responseTime, "number");
    assert.ok((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs content-length when present", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      response: { length: 1024 },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.contentLength, 1024);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs undefined contentLength when not set", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      response: { length: undefined },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.contentLength, undefined);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs remote address from ctx.ip", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      ip: "10.0.0.1",
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.remoteAddr, "10.0.0.1");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs user agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      get: (field: string) => {
        if (field.toLowerCase() === "user-agent") return "TestClient/1.0";
        return "";
      },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.userAgent, "TestClient/1.0");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): logs referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      get: (field: string) => {
        if (field.toLowerCase() === "referer") {
          return "https://example.com/page";
        }
        if (field.toLowerCase() === "referrer") {
          return "https://example.com/page";
        }
        return "";
      },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.referrer, "https://example.com/page");
  } finally {
    await cleanup();
  }
});

// ============================================
// Multiple Requests Tests
// ============================================

test("koaLogger(): handles multiple sequential requests", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();

    for (let i = 0; i < 5; i++) {
      const ctx = createMockContext({
        path: `/path/${i}`,
        url: `/path/${i}`,
        status: 200 + i,
      });
      await runMiddleware(middleware, ctx);
    }

    assert.strictEqual(logs.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(logs[i].properties.path, `/path/${i}`);
      assert.strictEqual(logs[i].properties.status, 200 + i);
    }
  } finally {
    await cleanup();
  }
});

// ============================================
// Edge Cases
// ============================================

test("koaLogger(): handles missing user-agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      get: () => "",
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.userAgent, undefined);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): handles missing referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      get: (field: string) => {
        if (field.toLowerCase() === "user-agent") return "test-agent";
        return "";
      },
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.referrer, undefined);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): handles query parameters in url", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger();
    const ctx = createMockContext({
      path: "/search",
      url: "/search?q=test&limit=10",
    });

    await runMiddleware(middleware, ctx);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.path, "/search");
    assert.ok((logs[0].properties.url as string).includes("q=test"));
    assert.ok((logs[0].properties.url as string).includes("limit=10"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Completion Level Tests
// ============================================

test("koaLogger(): completionLevel chooses the level from the status", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      completionLevel: (_ctx, { status }) => status >= 500 ? "error" : "info",
    });
    for (const status of [200, 500]) {
      await runMiddleware(middleware, createMockContext({ status }));
    }

    assert.deepStrictEqual(logs.map((log) => log.level), ["info", "error"]);
    assert.deepStrictEqual(logs.map((log) => log.properties.status), [
      200,
      500,
    ]);
    assert.strictEqual(
      logs[1].rawMessage,
      "{method} {url} {status} - {responseTime} ms",
    );
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel receives the request outcome", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const calls: Parameters<CompletionLevelFunction>[] = [];
    const middleware = koaLogger({
      completionLevel: (...args) => {
        calls.push(args);
        return args[1].responseTime > 1000 ? "warning" : "info";
      },
    });
    const ctx = createMockContext();
    let restoreDateNow = useFixedDateNow(10_000);
    try {
      await runMiddleware(middleware, ctx, () => {
        restoreDateNow();
        restoreDateNow = useFixedDateNow(11_500);
        ctx.status = 201;
        return Promise.resolve();
      });
    } finally {
      restoreDateNow();
    }

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], ctx);
    assert.deepStrictEqual(calls[0][1], { status: 201, responseTime: 1500 });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "warning");
    assert.strictEqual(logs[0].properties.responseTime, 1500);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel applies to text formats", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = koaLogger({
      format: "dev",
      completionLevel: () => "error",
    });
    await runMiddleware(middleware, createMockContext({ status: 503 }));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "error");
    assert.ok((logs[0].rawMessage as string).startsWith("GET /test 503 "));
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel is not used for logRequest logs", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let called = false;
    const middleware = koaLogger({
      logRequest: true,
      level: "debug",
      completionLevel: () => {
        called = true;
        return "error";
      },
    });
    await runMiddleware(middleware, createMockContext());

    assert.strictEqual(called, false);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel is not called for skipped requests", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let called = false;
    const middleware = koaLogger({
      skip: () => true,
      completionLevel: () => {
        called = true;
        return "error";
      },
    });
    await runMiddleware(middleware, createMockContext());

    assert.strictEqual(called, false);
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

// Serves a Koa application on an ephemeral port while running `fn`.
async function withKoaServer(
  app: Koa,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer(app.callback());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error == null ? resolve() : reject(error));
      server.closeAllConnections();
    });
  }
}

test("koaLogger(): completionLevel sees statuses set by error handlers", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const completions: unknown[] = [];
    const app = new Koa();
    app.silent = true;
    app.use(koaLogger({
      completionLevel: (_ctx, completion) => {
        completions.push(completion);
        return completion.status >= 500 ? "error" : "info";
      },
    }));
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch {
        ctx.status = 500;
        ctx.body = "handled";
      }
    });
    app.use((ctx) => {
      if (ctx.path === "/fail") throw new Error("handler failure");
      ctx.body = "ok";
    });

    await withKoaServer(app, async (url) => {
      const ok = await fetch(`${url}/ok`);
      assert.strictEqual(await ok.text(), "ok");
      const failed = await fetch(`${url}/fail`);
      assert.strictEqual(failed.status, 500);
      assert.strictEqual(await failed.text(), "handled");
    });

    assert.deepStrictEqual(logs.map((log) => log.level), ["info", "error"]);
    assert.deepStrictEqual(
      completions.map((completion) =>
        (completion as { status: number }).status
      ),
      [200, 500],
    );
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel is not called for thrown errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let called = false;
    const app = new Koa();
    app.silent = true;
    app.use(koaLogger({
      completionLevel: () => {
        called = true;
        return "error";
      },
    }));
    app.use(() => {
      throw new Error("handler failure");
    });

    await withKoaServer(app, async (url) => {
      const res = await fetch(`${url}/fail`);
      assert.strictEqual(res.status, 500);
      await res.text();
    });

    assert.strictEqual(called, false);
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel failures keep Koa responses", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const app = new Koa();
    app.silent = true;
    app.use(koaLogger({
      level: "debug",
      completionLevel: () => {
        throw new Error("level failure");
      },
    }));
    app.use((ctx) => {
      ctx.status = 201;
      ctx.body = "created";
    });

    await withKoaServer(app, async (url) => {
      const res = await fetch(`${url}/`);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(await res.text(), "created");
    });

    assertFallback(
      logs,
      (error) => error instanceof Error && error.message === "level failure",
    );
  } finally {
    await cleanup();
  }
});

// Runs a completed request with the given completion level callback and the
// fallback level "debug".
async function runCompletionLevel(
  completionLevel: () => unknown,
): Promise<void> {
  const middleware = koaLogger({
    level: "debug",
    completionLevel: completionLevel as CompletionLevelFunction,
  });
  await runMiddleware(middleware, createMockContext());
}

// ============================================
// Completion Level Callback Failure Tests
// ============================================

function findMetaErrors(logs: LogRecord[]): LogRecord[] {
  return logs.filter((record) =>
    record.category.length === 2 &&
    record.category[0] === "logtape" &&
    record.category[1] === "meta" &&
    record.level === "error"
  );
}

function findRequestLogs(logs: LogRecord[]): LogRecord[] {
  return logs.filter((record) => record.category[0] !== "logtape");
}

// Runs a function and returns the unhandled rejections reported while it
// runs, waiting long enough for every runtime to report them.
async function collectUnhandledRejections(
  fn: () => Promise<void>,
): Promise<unknown[]> {
  const reasons: unknown[] = [];
  const listener = (reason: unknown): void => {
    reasons.push(reason);
  };
  process.on("unhandledRejection", listener);
  try {
    await fn();
    await delay(20);
    await delay(20);
  } finally {
    process.off("unhandledRejection", listener);
  }
  return reasons;
}

// Asserts that a request was logged once at the fallback level ("debug") and
// that the given errors were reported to the meta logger.
function assertFallback(
  logs: LogRecord[],
  matchesMetaError: (error: unknown) => boolean,
): void {
  const requestLogs = findRequestLogs(logs);
  assert.strictEqual(requestLogs.length, 1);
  assert.strictEqual(requestLogs[0].level, "debug");
  assert.ok(
    findMetaErrors(logs).some((record) =>
      matchesMetaError(record.properties.error)
    ),
    "expected the failure to be reported to the meta logger",
  );
}

test("koaLogger(): completionLevel falls back when the callback throws", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const failure = new Error("level failure");
    await runCompletionLevel(() => {
      throw failure;
    });
    assertFallback(logs, (error) => error === failure);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel falls back on an invalid level", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    await runCompletionLevel(() => "warn");
    assertFallback(
      logs,
      (error) => error instanceof TypeError && error.message.includes('"warn"'),
    );
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel reports rejected promises", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const failure = new Error("async level failure");
    const reasons = await collectUnhandledRejections(() =>
      runCompletionLevel(() => Promise.reject(failure))
    );
    assert.deepStrictEqual(reasons, []);
    assertFallback(logs, (error) => error instanceof TypeError);
    assertFallback(logs, (error) => error === failure);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel bypasses overridden promise then", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    let overriddenThenCalled = false;
    class OverridingPromise<T> extends Promise<T> {
      override then<R1 = T, R2 = never>(
        onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
        onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
      ): Promise<R1 | R2> {
        overriddenThenCalled = true;
        return super.then(onFulfilled, onRejected);
      }
    }
    const failure = new Error("subclass failure");
    const reasons = await collectUnhandledRejections(() =>
      runCompletionLevel(() =>
        new OverridingPromise((_, reject) => reject(failure))
      )
    );
    assert.deepStrictEqual(reasons, []);
    assert.strictEqual(overriddenThenCalled, false);
    assertFallback(logs, (error) => error === failure);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel does not adopt promise results", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const value = {};
    const promise = Promise.resolve(value);
    Object.defineProperty(value, "then", {
      get() {
        throw new Error("late then getter");
      },
    });
    const reasons = await collectUnhandledRejections(() =>
      runCompletionLevel(() => promise)
    );
    assert.deepStrictEqual(reasons, []);
    assertFallback(logs, (error) => error instanceof TypeError);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel falls back on unobservable promises", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const promise = Promise.reject(new Error("handled elsewhere"));
    promise.catch(() => {});
    Object.defineProperty(promise, "constructor", {
      get() {
        throw new Error("constructor getter");
      },
    });
    const reasons = await collectUnhandledRejections(() =>
      runCompletionLevel(() => promise)
    );
    assert.deepStrictEqual(reasons, []);
    assertFallback(logs, (error) => error instanceof TypeError);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel never invokes custom thenables", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    let thenCalled = false;
    const thenable = {
      then(resolve: (value: string) => void): void {
        thenCalled = true;
        setTimeout(() => resolve("info"), 0);
      },
    };
    const reasons = await collectUnhandledRejections(() =>
      runCompletionLevel(() => thenable)
    );
    assert.deepStrictEqual(reasons, []);
    assert.strictEqual(thenCalled, false);
    assertFallback(logs, (error) => error instanceof TypeError);
  } finally {
    await cleanup();
  }
});

test("koaLogger(): completionLevel reports cross-realm rejections", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const reasons = await collectUnhandledRejections(() =>
      runCompletionLevel(() =>
        vm.runInNewContext('Promise.reject(new Error("foreign failure"))')
      )
    );
    assert.deepStrictEqual(reasons, []);
    assertFallback(
      logs,
      (error) =>
        error != null && typeof error === "object" &&
        "message" in error && error.message === "foreign failure",
    );
  } finally {
    await cleanup();
  }
});
