import assert from "node:assert/strict";
import test from "node:test";
import { configure, type LogRecord, reset } from "@logtape/logtape";
import { type KoaContext, koaLogger, type KoaMiddleware } from "./mod.ts";

// Test fixture: Collect log records, filtering out internal LogTape meta logs
function createTestSink(): {
  sink: (record: LogRecord) => void;
  logs: LogRecord[];
} {
  const logs: LogRecord[] = [];
  return {
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

// Mock Koa context
function createMockContext(overrides: Partial<KoaContext> = {}): KoaContext {
  return {
    method: "GET",
    url: "/test",
    path: "/test",
    status: 200,
    ip: "127.0.0.1",
    response: {
      length: undefined,
    },
    get: (field: string) => {
      const headers: Record<string, string> = {
        "user-agent": "test-agent/1.0",
        "referer": "http://example.com",
        "referrer": "http://example.com",
      };
      return headers[field.toLowerCase()] ?? "";
    },
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
