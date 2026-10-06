import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter, once } from "node:events";
import type { AddressInfo } from "node:net";
import process from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import { configure, getLogger, type LogRecord, reset } from "@logtape/logtape";
import express from "express";
import {
  type CompletionLevelFunction,
  expressLogger,
  type ExpressNextFunction,
  type ExpressRequest,
  type ExpressResponse,
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

test(
  "expressLogger(): structured-combined format logs structured properties",
  async () => {
    const { logs, cleanup } = await setupLogtape();
    try {
      const middleware = expressLogger({ format: "structured-combined" });
      const req = createMockRequest();
      const res = createMockResponse({ statusCode: 200 });
      res.setHeader("content-length", "123");
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
  },
);

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

test(
  "expressLogger(): structured-common format excludes referrer and userAgent",
  async () => {
    const { logs, cleanup } = await setupLogtape();
    try {
      const middleware = expressLogger({ format: "structured-common" });
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
  },
);

// ============================================
// Format Tests - Morgan
// ============================================

test("expressLogger(): morgan-combined format returns access log", async () => {
  const { logs, cleanup } = await setupLogtape();
  const restoreDateNow = useFixedDateNow(Date.UTC(2000, 9, 10, 13, 55, 36));
  try {
    const middleware = expressLogger({ format: "morgan-combined" });
    const req = createMockRequest({
      ip: "203.0.113.7",
      originalUrl: "/test?name=alice",
      get: (header: string) => {
        const headers: Record<string, string> = {
          "authorization": "Basic ZnJhbms6c2VjcmV0",
          "user-agent": 'test-agent "quoted"',
          "referrer": "http://example.com/start",
          "referer": "http://example.com/start",
        };
        return headers[header.toLowerCase()];
      },
    });
    const res = createMockResponse({ statusCode: 201 });
    res.setHeader("content-length", "42");
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].rawMessage,
      '203.0.113.7 - frank [10/Oct/2000:13:55:36 +0000] "GET /test?name=alice HTTP/1.1" 201 42 "http://example.com/start" "test-agent \\"quoted\\""',
    );
  } finally {
    restoreDateNow();
    await cleanup();
  }
});

test("expressLogger(): morgan-common format returns access log", async () => {
  const { logs, cleanup } = await setupLogtape();
  const restoreDateNow = useFixedDateNow(Date.UTC(2000, 9, 10, 13, 55, 36));
  try {
    const middleware = expressLogger({ format: "morgan-common" });
    const req = createMockRequest({
      ip: "",
      socket: {},
      get: (header: string) => {
        const headers: Record<string, string> = {
          "user-agent": "test-agent/1.0",
          "referrer": "http://example.com/start",
        };
        return headers[header.toLowerCase()];
      },
    });
    const res = createMockResponse({ statusCode: 204 });
    const next: ExpressNextFunction = () => {};

    middleware(req, res, next);
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].rawMessage,
      '- - - [10/Oct/2000:13:55:36 +0000] "GET /test HTTP/1.1" 204 -',
    );
  } finally {
    restoreDateNow();
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
// Request Context Tests
// ============================================

test("expressLogger(): context true uses incoming request ID", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const appLogger = getLogger(["app"]);
    const middleware = expressLogger({ context: true });
    const req = createMockRequest({
      get: (header: string) => {
        const headers: Record<string, string> = {
          "x-request-id": "request-123",
          "user-agent": "test-agent/1.0",
        };
        return headers[header.toLowerCase()];
      },
    });
    const res = createMockResponse();

    middleware(req, res, () => {
      appLogger.info("Handled request");
    });
    finishResponse(res);

    assert.strictEqual(res.getHeader("x-request-id"), "request-123");
    assert.strictEqual(logs.length, 2);
    assert.deepStrictEqual(logs[0].category, ["app"]);
    assert.strictEqual(logs[0].properties.requestId, "request-123");
    assert.strictEqual(logs[1].properties.requestId, "request-123");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): context true generates missing request ID", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = expressLogger({
      context: { requestId: { generate: () => "generated-123" } },
    });
    const req = createMockRequest();
    const res = createMockResponse();

    middleware(req, res, () => {});
    finishResponse(res);

    assert.strictEqual(res.getHeader("x-request-id"), "generated-123");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.requestId, "generated-123");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): context supports custom options", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = expressLogger({
      context: {
        requestId: {
          property: "correlationId",
          headerNames: ["x-correlation-id", "x-request-id"],
          responseHeader: "x-correlation-id",
          normalize: (value) => value.trim().toUpperCase(),
        },
        include: ["requestId", "method", "path", "httpVersion"],
        enrich: (req) => ({ route: req.path }),
      },
    });
    const req = createMockRequest({
      path: "/test",
      get: (header: string) => {
        const headers: Record<string, string> = {
          "x-correlation-id": " custom-123 ",
        };
        return headers[header.toLowerCase()];
      },
    });
    const res = createMockResponse();

    middleware(req, res, () => {});
    finishResponse(res);

    assert.strictEqual(res.getHeader("x-correlation-id"), "CUSTOM-123");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.correlationId, "CUSTOM-123");
    assert.strictEqual(logs[0].properties.method, "GET");
    assert.strictEqual(logs[0].properties.path, "/test");
    assert.strictEqual(logs[0].properties.httpVersion, "1.1");
    assert.strictEqual(logs[0].properties.route, "/test");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): context enrich allows a callable then field", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = expressLogger({
      context: {
        enrich: () => ({
          route: "/test",
          then: () => "not a promise",
        }),
      },
    });
    const req = createMockRequest();
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });
    await delay(0);
    finishResponse(res);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.route, "/test");
    assert.strictEqual(typeof logs[0].properties.then, "function");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): context keeps implicit context when skipped", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const appLogger = getLogger(["app"]);
    const middleware = expressLogger({
      context: { requestId: { generate: () => "skip-123" } },
      skip: () => true,
    });
    const req = createMockRequest();
    const res = createMockResponse();

    middleware(req, res, () => {
      appLogger.info("Handled skipped request");
    });
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["app"]);
    assert.strictEqual(logs[0].properties.requestId, "skip-123");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): context works with immediate logging", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const middleware = expressLogger({
      context: { requestId: { generate: () => "immediate-123" } },
      immediate: true,
    });
    const req = createMockRequest();
    const res = createMockResponse();

    middleware(req, res, () => {});

    assert.strictEqual(res.getHeader("x-request-id"), "immediate-123");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.requestId, "immediate-123");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): forwards synchronous context enrich errors", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const enrichError = new Error("enrich failed");
    const middleware = expressLogger({
      context: {
        enrich: () => {
          throw enrichError;
        },
      },
    });
    const req = createMockRequest();
    const res = createMockResponse();
    let nextError: unknown;

    assert.doesNotThrow(() => {
      middleware(req, res, (err) => {
        nextError = err;
      });
    });

    assert.strictEqual(nextError, enrichError);
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): forwards errors after async context enrich", async () => {
  const { logs, cleanup } = await setupLogtape({
    contextLocalStorage: true,
  });
  try {
    const formatError = new Error("format failed");
    const middleware = expressLogger({
      context: {
        enrich: async () => {
          await delay(0);
          return { enriched: true };
        },
      },
      format: () => {
        throw formatError;
      },
      immediate: true,
    });
    const req = createMockRequest();
    const res = createMockResponse();
    let nextError: unknown;

    middleware(req, res, (err) => {
      nextError = err;
    });
    await delay(0);

    assert.strictEqual(nextError, formatError);
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): missing context storage still logs request ID", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const appLogger = getLogger(["app"]);
    const middleware = expressLogger({
      context: { requestId: { generate: () => "no-storage-123" } },
    });
    const req = createMockRequest();
    const res = createMockResponse();

    middleware(req, res, () => {
      appLogger.info("Handled request");
    });
    finishResponse(res);

    const appLog = logs.find((record) => record.category[0] === "app");
    const requestLog = logs.find((record) => record.category[0] === "express");
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

// ============================================
// Completion Level Tests
// ============================================

test("expressLogger(): completionLevel chooses the level from the status", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const middleware = expressLogger({
      completionLevel: (_req, _res, { status }) =>
        status >= 500 ? "error" : "info",
    });
    for (const statusCode of [200, 500]) {
      const res = createMockResponse({ statusCode });
      middleware(createMockRequest(), res, () => {});
      finishResponse(res);
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

test("expressLogger(): completionLevel receives the request outcome", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const calls: Parameters<CompletionLevelFunction>[] = [];
    const middleware = expressLogger({
      completionLevel: (...args) => {
        calls.push(args);
        return args[2].responseTime > 1000 ? "warning" : "info";
      },
    });
    const req = createMockRequest();
    const res = createMockResponse();
    let restoreDateNow = useFixedDateNow(10_000);
    try {
      middleware(req, res, () => {});
    } finally {
      restoreDateNow();
    }
    restoreDateNow = useFixedDateNow(11_500);
    try {
      finishResponse(res);
    } finally {
      restoreDateNow();
    }

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], req);
    assert.strictEqual(calls[0][1], res);
    assert.deepStrictEqual(calls[0][2], { status: 200, responseTime: 1500 });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "warning");
    assert.strictEqual(logs[0].properties.responseTime, 1500);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): completionLevel applies to text formats", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let completion: unknown;
    const middleware = expressLogger({
      format: "dev",
      completionLevel: (_req, _res, outcome) => {
        completion = outcome;
        return "error";
      },
    });
    const res = createMockResponse({ statusCode: 503 });
    middleware(createMockRequest(), res, () => {});
    finishResponse(res);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "error");
    assert.ok((logs[0].rawMessage as string).startsWith("GET /test 503 "));
    assert.strictEqual((completion as { status: number }).status, 503);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): completionLevel is not used for immediate logs", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let called = false;
    const middleware = expressLogger({
      immediate: true,
      level: "debug",
      completionLevel: () => {
        called = true;
        return "error";
      },
    });
    const res = createMockResponse();
    middleware(createMockRequest(), res, () => {});
    finishResponse(res);

    assert.strictEqual(called, false);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("expressLogger(): completionLevel is not called for skipped requests", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let called = false;
    const middleware = expressLogger({
      skip: () => true,
      completionLevel: () => {
        called = true;
        return "error";
      },
    });
    const res = createMockResponse();
    middleware(createMockRequest(), res, () => {});
    finishResponse(res);

    assert.strictEqual(called, false);
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("expressLogger(): completionLevel is not called for closed connections", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let called = false;
    const middleware = expressLogger({
      completionLevel: () => {
        called = true;
        return "error";
      },
    });
    const res = createMockResponse();
    middleware(createMockRequest(), res, () => {});
    (res as { _emitter?: EventEmitter })._emitter?.emit("close");

    assert.strictEqual(called, false);
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

// Serves an Express application on an ephemeral port while running `fn`.
async function withExpressServer(
  app: ReturnType<typeof express>,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
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

// Waits for the response's finish event to be logged.
async function waitForLogs(logs: LogRecord[], count: number): Promise<void> {
  for (let i = 0; i < 100 && logs.length < count; i++) await delay(10);
}

test("expressLogger(): completionLevel sees Express error responses", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const completions: unknown[] = [];
    const app = express();
    app.set("env", "test");
    app.use(expressLogger({
      completionLevel: (_req, _res, completion) => {
        completions.push(completion);
        return completion.status >= 500 ? "error" : "info";
      },
    }));
    app.get("/ok", (_req, res) => {
      res.send("ok");
    });
    app.get("/fail", () => {
      throw new Error("handler failure");
    });

    await withExpressServer(app, async (url) => {
      const ok = await fetch(`${url}/ok`);
      assert.strictEqual(await ok.text(), "ok");
      await waitForLogs(logs, 1);
      const failed = await fetch(`${url}/fail`);
      assert.strictEqual(failed.status, 500);
      await failed.text();
      await waitForLogs(logs, 2);
    });

    assert.deepStrictEqual(logs.map((log) => log.level), ["info", "error"]);
    assert.deepStrictEqual(logs.map((log) => log.properties.status), [
      200,
      500,
    ]);
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

test("expressLogger(): completionLevel failures keep Express responses", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const app = express();
    app.set("env", "test");
    app.use(expressLogger({
      level: "debug",
      completionLevel: () => {
        throw new Error("level failure");
      },
    }));
    app.get("/ok", (_req, res) => {
      res.send("ok");
    });

    await withExpressServer(app, async (url) => {
      const res = await fetch(`${url}/ok`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), "ok");
      for (let i = 0; i < 100 && findRequestLogs(logs).length < 1; i++) {
        await delay(10);
      }
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
function runCompletionLevel(completionLevel: () => unknown): Promise<void> {
  const middleware = expressLogger({
    level: "debug",
    completionLevel: completionLevel as CompletionLevelFunction,
  });
  const res = createMockResponse();
  middleware(createMockRequest(), res, () => {});
  finishResponse(res);
  return Promise.resolve();
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

test("expressLogger(): completionLevel falls back when the callback throws", async () => {
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

test("expressLogger(): completionLevel falls back on an invalid level", async () => {
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

test("expressLogger(): completionLevel reports rejected promises", async () => {
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

test("expressLogger(): completionLevel bypasses overridden promise then", async () => {
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

test("expressLogger(): completionLevel does not adopt promise results", async () => {
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

test("expressLogger(): completionLevel falls back on unobservable promises", async () => {
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

test("expressLogger(): completionLevel never invokes custom thenables", async () => {
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

test("expressLogger(): completionLevel reports cross-realm rejections", async () => {
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
