import assert from "node:assert/strict";
import test from "node:test";
import { configure, type LogRecord, reset } from "@logtape/logtape";
import {
  expressLogger,
  type ExpressNextFunction,
  type ExpressRequest,
  type ExpressResponse,
} from "./mod.ts";
import { EventEmitter } from "node:events";

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

// Mock Express request
function createMockRequest(
  overrides: Partial<ExpressRequest> = {},
): ExpressRequest {
  return {
    method: "GET",
    url: "/test",
    originalUrl: "/test",
    httpVersion: "1.1",
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get: (header: string) => {
      const headers: Record<string, string> = {
        "user-agent": "test-agent/1.0",
        "referrer": "http://example.com",
        "referer": "http://example.com",
      };
      return headers[header.toLowerCase()];
    },
    ...overrides,
  };
}

// Mock Express response with EventEmitter
function createMockResponse(
  overrides: Partial<
    ExpressResponse & {
      setHeader: (name: string, value: string | number) => void;
    }
  > = {},
): ExpressResponse & {
  setHeader: (name: string, value: string | number) => void;
} {
  const emitter = new EventEmitter();
  const headers: Record<string, string | number> = {};

  return {
    statusCode: 200,
    on: emitter.on.bind(emitter) as ExpressResponse["on"],
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string | number) => {
      headers[name.toLowerCase()] = value;
    },
    _emitter: emitter,
    ...overrides,
  } as ExpressResponse & {
    setHeader: (name: string, value: string | number) => void;
    _emitter?: EventEmitter;
  };
}

// Helper to simulate response finish
function finishResponse(res: ExpressResponse): void {
  // @ts-ignore - accessing internal emitter for testing
  const emitter = (res as { _emitter?: EventEmitter })._emitter;
  if (emitter) {
    emitter.emit("finish");
  }
}

// ============================================
// Basic Middleware Creation Tests
// ============================================

test("expressLogger(): creates a middleware function", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();

    assert.strictEqual(typeof middleware, "function");
    assert.strictEqual(middleware.length, 3); // req, res, next
  } finally {
    await cleanup();
  }
});

test("expressLogger(): calls next() to continue middleware chain", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest();
    const res = createMockResponse();
    let nextCalled = false;
    const next: ExpressNextFunction = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.ok(nextCalled);
  } finally {
    await cleanup();
  }
});

// ============================================
// Category Configuration Tests
// ============================================

test("expressLogger(): uses default category ['express']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["express"]);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): uses custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ category: ["myapp", "http"] });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp", "http"]);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ category: "myapp" });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Log Level Tests
// ============================================

test("expressLogger(): uses default log level 'info'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "info");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): uses custom log level 'debug'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ level: "debug" });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): uses custom log level 'warning'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ level: "warning" });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "warning");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): uses custom log level 'error'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ level: "error" });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "error");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Combined (default)
// ============================================

test("expressLogger(): combined format logs structured properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ format: "combined" });
    const req = createMockRequest();
    const res = createMockResponse({ statusCode: 200 });
    res.setHeader(
      "content-length",
      "123",
    );
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    const props = logs[0].properties;
    assert.strictEqual(props.method, "GET");
    assert.strictEqual(props.url, "/test");
    assert.strictEqual(props.status, 200);
    assert.notStrictEqual(props.responseTime, null);
    assert.strictEqual(props.contentLength, "123");
    assert.strictEqual(props.remoteAddr, "127.0.0.1");
    assert.strictEqual(props.userAgent, "test-agent/1.0");
    assert.strictEqual(props.referrer, "http://example.com");
    assert.strictEqual(props.httpVersion, "1.1");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Common
// ============================================

test("expressLogger(): common format excludes referrer and userAgent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ format: "common" });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    const props = logs[0].properties;
    assert.strictEqual(props.method, "GET");
    assert.strictEqual(props.url, "/test");
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

test("expressLogger(): dev format returns string message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ format: "dev" });
    const req = createMockRequest({
      method: "POST",
      originalUrl: "/api/users",
    });
    const res = createMockResponse({ statusCode: 201 });
    res.setHeader(
      "content-length",
      "456",
    );
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

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

test("expressLogger(): short format includes remote addr", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ format: "short" });
    const req = createMockRequest({ ip: "192.168.1.1" });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("192.168.1.1"));
    assert.ok(msg.includes("GET"));
    assert.ok(msg.includes("/test"));
    assert.ok(msg.includes("HTTP/1.1"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Tiny
// ============================================

test("expressLogger(): tiny format is minimal", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ format: "tiny" });
    const req = createMockRequest();
    const res = createMockResponse({ statusCode: 404 });
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("GET"));
    assert.ok(msg.includes("/test"));
    assert.ok(msg.includes("404"));
    assert.ok(msg.includes("ms"));
    // Should NOT include remote addr in tiny format
    assert.ok(!msg.includes("127.0.0.1"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Custom Format Function Tests
// ============================================

test("expressLogger(): custom format returning string", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({
      format: (req, res, _responseTime) =>
        `Custom: ${req.method} ${res.statusCode}`,
    });
    const req = createMockRequest({ method: "DELETE" });
    const res = createMockResponse({ statusCode: 204 });
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "Custom: DELETE 204");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): custom format returning object", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({
      format: (req, res, responseTime) => ({
        customMethod: req.method,
        customStatus: res.statusCode,
        customDuration: responseTime,
      }),
    });
    const req = createMockRequest({ method: "PATCH" });
    const res = createMockResponse({ statusCode: 202 });
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

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

test("expressLogger(): skip function prevents logging when returns true", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({
      skip: () => true,
    });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): skip function allows logging when returns false", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({
      skip: () => false,
    });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): skip function receives req and res", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({
      skip: (_req, res) => res.statusCode < 400,
    });

    // Request with 200 status - should skip
    const req1 = createMockRequest();
    const res1 = createMockResponse({ statusCode: 200 });
    const next: ExpressNextFunction = () => {};

    middleware(req1, res1, next);
    finishResponse(res1);

    assert.strictEqual(logs.length, 0); // Skipped

    // Request with 500 status - should log
    const req2 = createMockRequest();
    const res2 = createMockResponse({ statusCode: 500 });

    middleware(req2, res2, next);
    finishResponse(res2);

    assert.strictEqual(logs.length, 1); // Logged
    assert.strictEqual(logs[0].properties.status, 500);
  } finally {
    await cleanup();
  }
});

// ============================================
// Immediate Mode Tests
// ============================================

test("expressLogger(): immediate mode logs before response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ immediate: true });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    // Note: Don't call finishResponse - it should already be logged

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.responseTime, 0); // Zero because it's immediate
  } finally {
    await cleanup();
  }
});

test("expressLogger(): non-immediate mode logs after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({ immediate: false });
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);

    assert.strictEqual(logs.length, 0); // Not logged yet

    finishResponse(res);

    assert.strictEqual(logs.length, 1); // Now logged
  } finally {
    await cleanup();
  }
});

// ============================================
// Request Property Tests
// ============================================

test("expressLogger(): logs correct method", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();

    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
    for (const method of methods) {
      const req = createMockRequest({ method });
      const res = createMockResponse();
      const next: ExpressNextFunction = () => {};

      middleware(req, res, next);
      finishResponse(res);
    }

    assert.strictEqual(logs.length, methods.length);
    for (let i = 0; i < methods.length; i++) {
      assert.strictEqual(logs[i].properties.method, methods[i]);
    }
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs originalUrl over url", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({
      url: "/internal",
      originalUrl: "/api/v1/users",
    });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.url, "/api/v1/users");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): falls back to url when originalUrl is undefined", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({
      url: "/fallback",
      originalUrl: undefined as unknown as string,
    });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.url, "/fallback");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs status code", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();

    const statusCodes = [200, 201, 301, 400, 404, 500];
    for (const statusCode of statusCodes) {
      const req = createMockRequest();
      const res = createMockResponse({ statusCode });
      const next: ExpressNextFunction = () => {};

      middleware(req, res, next);
      finishResponse(res);
    }

    assert.strictEqual(logs.length, statusCodes.length);
    for (let i = 0; i < statusCodes.length; i++) {
      assert.strictEqual(logs[i].properties.status, statusCodes[i]);
    }
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs response time as number", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);

    // Add small delay to ensure non-zero response time
    await new Promise((resolve) => setTimeout(resolve, 10));

    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(typeof logs[0].properties.responseTime, "number");
    assert.ok((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs content-length when present", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest();
    const res = createMockResponse();
    res.setHeader(
      "content-length",
      "1024",
    );
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.contentLength, "1024");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs undefined contentLength when not set", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest();
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.contentLength, undefined);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs remote address from req.ip", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({ ip: "10.0.0.1" });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.remoteAddr, "10.0.0.1");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): falls back to socket.remoteAddress", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({
      ip: undefined as unknown as string,
      socket: { remoteAddress: "192.168.0.1" },
    });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.remoteAddr, "192.168.0.1");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): logs HTTP version", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({ httpVersion: "2.0" });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.httpVersion, "2.0");
  } finally {
    await cleanup();
  }
});

// ============================================
// Multiple Requests Tests
// ============================================

test("expressLogger(): handles multiple sequential requests", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();

    for (let i = 0; i < 5; i++) {
      const req = createMockRequest({ originalUrl: `/path/${i}` });
      const res = createMockResponse({ statusCode: 200 + i });
      const next: ExpressNextFunction = () => {};

      middleware(req, res, next);
      finishResponse(res);
    }

    assert.strictEqual(logs.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(logs[i].properties.url, `/path/${i}`);
      assert.strictEqual(logs[i].properties.status, 200 + i);
    }
  } finally {
    await cleanup();
  }
});

// ============================================
// Edge Cases
// ============================================

test("expressLogger(): handles missing user-agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({
      get: () => undefined,
    });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.userAgent, undefined);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): handles missing referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger();
    const req = createMockRequest({
      get: (header: string) => {
        if (header.toLowerCase() === "user-agent") return "test-agent";
        return undefined;
      },
    });
    const res = createMockResponse();
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.referrer, undefined);
  } finally {
    await cleanup();
  }
});
