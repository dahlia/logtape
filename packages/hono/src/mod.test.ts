import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  configure,
  type LogRecord,
  reset,
  withContext,
} from "@logtape/logtape";
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { honoLogger } from "./mod.ts";

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
async function setupLogtape(
  options: { includeMeta?: boolean; contextLocalStorage?: boolean } = {},
): Promise<{
  logs: LogRecord[];
  cleanup: () => Promise<void>;
}> {
  const { sink, logs } = createTestSink(options);
  await configure({
    sinks: { test: sink },
    loggers: [{ category: [], sinks: ["test"] }],
    contextLocalStorage: options.contextLocalStorage
      ? new AsyncLocalStorage()
      : undefined,
  });
  return { logs, cleanup: () => reset() };
}

// Drains a response body so deferred request logging has completed.  The
// middleware logs streamed responses only once their body is consumed.
async function drain(
  response: Response | Promise<Response>,
): Promise<Response> {
  const result = await response;
  await result.arrayBuffer();
  return result;
}

// ============================================
// Basic Middleware Creation Tests
// ============================================

test("honoLogger(): creates a middleware function", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const middleware = honoLogger();
    assert.strictEqual(typeof middleware, "function");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs request after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    const res = await drain(app.request("/test"));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// Category Configuration Tests
// ============================================

test("honoLogger(): uses default category ['hono']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["hono"]);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): uses custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ category: ["myapp", "http"] }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp", "http"]);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ category: "myapp" }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Log Level Tests
// ============================================

test("honoLogger(): uses default log level 'info'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "info");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): uses custom log level 'debug'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ level: "debug" }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): uses custom log level 'warning'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ level: "warning" }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "warning");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Combined (default)
// ============================================

test("honoLogger(): combined format logs structured properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ format: "combined" }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test", {
      headers: {
        "User-Agent": "test-agent/1.0",
        "Referer": "http://example.com",
      },
    }));

    assert.strictEqual(logs.length, 1);
    const props = logs[0].properties;
    assert.strictEqual(props.method, "GET");
    assert.ok((props.url as string).includes("/test"));
    assert.strictEqual(props.path, "/test");
    assert.strictEqual(props.status, 200);
    assert.notStrictEqual(props.responseTime, null);
    assert.strictEqual(props.userAgent, "test-agent/1.0");
    assert.strictEqual(props.referrer, "http://example.com");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Common
// ============================================

test("honoLogger(): common format excludes referrer and userAgent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ format: "common" }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test", {
      headers: {
        "User-Agent": "test-agent/1.0",
        "Referer": "http://example.com",
      },
    }));

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

test("honoLogger(): dev format returns string message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ format: "dev" }));
    app.post("/api/users", (c) => {
      c.status(201);
      return c.text("Created");
    });

    await drain(app.request("/api/users", { method: "POST" }));

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("POST"));
    assert.ok(msg.includes("/api/users"));
    assert.ok(msg.includes("201"));
    assert.ok(msg.includes("ms"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Short
// ============================================

test("honoLogger(): short format includes url", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ format: "short" }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("GET"));
    assert.ok(msg.includes("/test"));
    assert.ok(msg.includes("200"));
    assert.ok(msg.includes("ms"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Tiny
// ============================================

test("honoLogger(): tiny format is minimal", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ format: "tiny" }));
    app.get("/test", (c) => c.text("Hello"));

    const res = await drain(app.request("/test"));
    assert.strictEqual(res.status, 200);

    assert.strictEqual(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert.ok(msg.includes("GET"));
    assert.ok(msg.includes("/test"));
    assert.ok(msg.includes("200"));
    assert.ok(msg.includes("ms"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Custom Format Function Tests
// ============================================

test("honoLogger(): custom format returning string", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({
      format: (c, _responseTime) => `Custom: ${c.req.method} ${c.res.status}`,
    }));
    app.delete("/test", (c) => {
      c.status(204);
      return c.body(null);
    });

    await drain(app.request("/test", { method: "DELETE" }));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "Custom: DELETE 204");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): custom format returning object", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({
      format: (c, responseTime) => ({
        customMethod: c.req.method,
        customStatus: c.res.status,
        customDuration: responseTime,
      }),
    }));
    app.patch("/test", (c) => {
      c.status(202);
      return c.text("Accepted");
    });

    await drain(app.request("/test", { method: "PATCH" }));

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

test("honoLogger(): skip function prevents logging when returns true", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({
      skip: () => true,
    }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): skip function allows logging when returns false", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({
      skip: () => false,
    }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): skip function receives context", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({
      skip: (c) => c.req.path === "/health",
    }));
    app.get("/test", (c) => c.text("Hello"));
    app.get("/health", (c) => c.text("OK"));

    // Health endpoint should be skipped
    await drain(app.request("/health"));
    assert.strictEqual(logs.length, 0);

    // Other endpoints should be logged
    await drain(app.request("/test"));
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// logRequest (Immediate) Mode Tests
// ============================================

test("honoLogger(): logRequest mode logs at request start", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ logRequest: true }));
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.responseTime, 0); // Zero because it's immediate
  } finally {
    await cleanup();
  }
});

test("honoLogger(): non-logRequest mode logs after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ logRequest: false }));
    app.get("/test", async (c) => {
      // Small delay to ensure non-zero response time
      await new Promise((resolve) => setTimeout(resolve, 5));
      return c.text("Hello");
    });

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.ok((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

// ============================================
// Request Property Tests
// ============================================

test("honoLogger(): logs correct method", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));
    app.post("/test", (c) => c.text("Hello"));
    app.put("/test", (c) => c.text("Hello"));
    app.delete("/test", (c) => c.text("Hello"));

    const methods = ["GET", "POST", "PUT", "DELETE"];
    for (const method of methods) {
      await drain(app.request("/test", { method }));
    }

    assert.strictEqual(logs.length, methods.length);
    for (let i = 0; i < methods.length; i++) {
      assert.strictEqual(logs[i].properties.method, methods[i]);
    }
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs path correctly", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/api/v1/users", (c) => c.text("Hello"));

    await drain(app.request("/api/v1/users"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.path, "/api/v1/users");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs status code", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());

    app.get("/200", (c) => c.text("OK"));
    app.get("/201", (c) => {
      c.status(201);
      return c.text("Created");
    });
    app.get("/400", (c) => {
      c.status(400);
      return c.text("Bad Request");
    });
    app.get("/500", (c) => {
      c.status(500);
      return c.text("Error");
    });

    const paths = ["/200", "/201", "/400", "/500"];
    const expectedStatuses = [200, 201, 400, 500];

    for (const path of paths) {
      await drain(app.request(path));
    }

    assert.strictEqual(logs.length, paths.length);
    for (let i = 0; i < paths.length; i++) {
      assert.strictEqual(logs[i].properties.status, expectedStatuses[i]);
    }
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs response time as number", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(typeof logs[0].properties.responseTime, "number");
    assert.ok((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs user agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test", {
      headers: { "User-Agent": "TestClient/1.0" },
    }));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.userAgent, "TestClient/1.0");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test", {
      headers: { "Referer": "https://example.com/page" },
    }));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.referrer, "https://example.com/page");
  } finally {
    await cleanup();
  }
});

// ============================================
// Multiple Requests Tests
// ============================================

test("honoLogger(): handles multiple sequential requests", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/path/:id", (c) => c.text(`Path: ${c.req.param("id")}`));

    for (let i = 0; i < 5; i++) {
      await drain(app.request(`/path/${i}`));
    }

    assert.strictEqual(logs.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(logs[i].properties.path, `/path/${i}`);
    }
  } finally {
    await cleanup();
  }
});

// ============================================
// Edge Cases
// ============================================

test("honoLogger(): handles missing user-agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.userAgent, undefined);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): handles missing referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.referrer, undefined);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): handles query parameters in url", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/search", (c) => c.text(`Query: ${c.req.query("q")}`));

    await drain(app.request("/search?q=test&limit=10"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.path, "/search");
    assert.ok((logs[0].properties.url as string).includes("q=test"));
    assert.ok((logs[0].properties.url as string).includes("limit=10"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Streaming Response Tests
// ============================================

test("honoLogger(): defers logging until a streamed body is consumed", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const encoder = new TextEncoder();
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode("first\n"));
            await gate;
            controller.enqueue(encoder.encode("last\n"));
            controller.close();
          },
        }),
      ));

    const res = await app.request("/stream");
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.strictEqual(new TextDecoder().decode(first.value), "first\n");
    assert.strictEqual(logs.length, 0);

    await delay(30);
    release();

    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    assert.strictEqual(
      new TextDecoder().decode(
        new Uint8Array(chunks.flatMap((chunk) => [...chunk])),
      ),
      "last\n",
    );
    assert.strictEqual(logs.length, 1);
    assert.ok((logs[0].properties.responseTime as number) >= 25);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): streamText response reports full transfer time", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", (c) =>
      streamText(c, async (stream) => {
        await stream.writeln("first");
        await stream.sleep(30);
        await stream.writeln("last");
      }));

    const res = await app.request("/stream");
    assert.strictEqual(logs.length, 0);

    const body = await res.text();
    assert.ok(body.includes("last"));
    assert.strictEqual(logs.length, 1);
    assert.ok((logs[0].properties.responseTime as number) >= 25);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): preserves implicit context for deferred logging", async () => {
  const { logs, cleanup } = await setupLogtape({ contextLocalStorage: true });
  try {
    const app = new Hono();
    app.use(async (_c, next) => {
      await withContext({ requestId: "req-123" }, () => next());
    });
    app.use(honoLogger());
    app.get("/stream", (c) =>
      streamText(c, async (stream) => {
        await stream.writeln("first");
        await stream.sleep(10);
        await stream.writeln("last");
      }));

    const res = await app.request("/stream");
    assert.strictEqual(logs.length, 0);

    await res.text();

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.requestId, "req-123");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): formatter properties win over implicit context", async () => {
  const { logs, cleanup } = await setupLogtape({ contextLocalStorage: true });
  try {
    const app = new Hono();
    app.use(async (_c, next) => {
      await withContext({ status: 999, method: "FAKE" }, () => next());
    });
    app.use(honoLogger());
    app.get("/test", (c) => c.text("Hello"));

    await drain(app.request("/test"));

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.status, 200);
    assert.strictEqual(logs[0].properties.method, "GET");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): preserves byte-stream (BYOB) responses", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const payload = new TextEncoder().encode("byte-stream-body");
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          type: "bytes",
          start(controller) {
            controller.enqueue(payload);
            controller.close();
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader({ mode: "byob" });
    const first = await reader.read(new Uint8Array(64));
    assert.strictEqual(first.done, false);
    assert.strictEqual(
      new TextDecoder().decode(first.value),
      "byte-stream-body",
    );
    const second = await reader.read(new Uint8Array(64));
    assert.strictEqual(second.done, true);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// A byte-stream response whose source only produces data in response to BYOB
// requests, as a pull-based zero-copy producer does.
function pullBasedByobResponse(payload: string): Response {
  const bytes = new TextEncoder().encode(payload);
  let sent = false;
  return new Response(
    new ReadableStream({
      type: "bytes",
      pull(controller: ReadableByteStreamController) {
        const request = controller.byobRequest;
        const view = request?.view;
        if (request == null || view == null) return;
        if (sent) {
          controller.close();
          request.respond(0);
          return;
        }
        sent = true;
        new Uint8Array(view.buffer, view.byteOffset, bytes.byteLength).set(
          bytes,
        );
        request.respond(bytes.byteLength);
      },
    }),
  );
}

test("honoLogger(): reads a pull-based BYOB body with a BYOB reader", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () => pullBasedByobResponse("byob-pull"));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader({ mode: "byob" });
    const first = await reader.read(new Uint8Array(64));
    assert.strictEqual(first.done, false);
    assert.strictEqual(new TextDecoder().decode(first.value), "byob-pull");
    const second = await reader.read(new Uint8Array(64));
    assert.strictEqual(second.done, true);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// A byte-stream source using autoAllocateChunkSize that closes at EOF without
// responding to the outstanding BYOB request, which default readers tolerate.
function closingAutoAllocResponse(payload: string): Response {
  const bytes = new TextEncoder().encode(payload);
  let sent = false;
  return new Response(
    new ReadableStream({
      type: "bytes",
      autoAllocateChunkSize: 16,
      pull(controller: ReadableByteStreamController) {
        const request = controller.byobRequest;
        const view = request?.view;
        if (request == null || view == null) return;
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        new Uint8Array(view.buffer, view.byteOffset, bytes.byteLength).set(
          bytes,
        );
        request.respond(bytes.byteLength);
      },
    }),
  );
}

test("honoLogger(): resolves reader.closed once the source drains", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("only"));
            controller.close();
          },
        }),
      ));

    const res = await app.request("/stream");
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.strictEqual(new TextDecoder().decode(first.value), "only");
    await Promise.race([
      reader.closed,
      delay(500).then(() => {
        throw new Error("reader.closed did not resolve");
      }),
    ]);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): resolves byte-stream reader.closed once drained", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          start(controller: ReadableByteStreamController) {
            controller.enqueue(new TextEncoder().encode("only"));
            controller.close();
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.strictEqual(new TextDecoder().decode(first.value), "only");
    await Promise.race([
      reader.closed,
      delay(500).then(() => {
        throw new Error("reader.closed did not resolve");
      }),
    ]);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): propagates byte-stream errors on the first read", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("early byte failure");
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          async start(controller: ReadableByteStreamController) {
            await delay(10);
            controller.error(failure);
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader();
    await assert.rejects(
      Promise.race([
        reader.read(),
        delay(500).then(() => {
          throw new Error("read did not settle");
        }),
      ]),
      (error) => error === failure,
    );
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): resolves byte reader.closed for an empty source", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          async start(controller: ReadableByteStreamController) {
            await delay(10);
            controller.close();
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader();
    await Promise.race([
      reader.closed,
      delay(500).then(() => {
        throw new Error("reader.closed did not resolve");
      }),
    ]);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): rejects reader.closed when the source errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("idle failure");
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            source = controller;
          },
        }),
      ));

    const res = await app.request("/stream");
    const reader = res.body!.getReader();
    source.error(failure);
    await assert.rejects(
      Promise.race([
        reader.closed,
        delay(500).then(() => {
          throw new Error("reader.closed did not settle");
        }),
      ]),
      (error) => error === failure,
    );
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): rejects byte reader.closed when the source errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("idle byte failure");
    let source!: ReadableByteStreamController;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          start(controller: ReadableByteStreamController) {
            source = controller;
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader();
    source.error(failure);
    await assert.rejects(
      Promise.race([
        reader.closed,
        delay(500).then(() => {
          throw new Error("reader.closed did not settle");
        }),
      ]),
      (error) => error === failure,
    );
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): reads a byte stream that closes during a read", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () => closingAutoAllocResponse("closing-stream"));

    const res = await app.request("/bytes");
    assert.strictEqual(await res.text(), "closing-stream");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): reconciles the reader when the consumer switches modes", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () => closingAutoAllocResponse("switch-mode"));

    const res = await app.request("/bytes");
    const byob = res.body!.getReader({ mode: "byob" });
    const first = await byob.read(new Uint8Array(64));
    assert.strictEqual(first.done, false);
    assert.strictEqual(new TextDecoder().decode(first.value), "switch-mode");
    byob.releaseLock();

    const reader = res.body!.getReader();
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    assert.strictEqual(rest, "");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): preserves default-stream chunk semantics", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const encoder = new TextEncoder();
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () => {
      const shared = encoder.encode("hello");
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(0));
            controller.enqueue(shared.subarray(0, 2));
            controller.enqueue(shared.subarray(2));
            controller.close();
          },
        }),
      );
    });

    const res = await app.request("/stream");
    assert.strictEqual(await res.text(), "hello");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs null-body responses immediately", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/no-content", (c) => c.body(null, 204));
    app.get("/not-modified", (c) => c.body(null, 304));

    const noContent = await app.request("/no-content");
    assert.strictEqual(noContent.status, 204);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.status, 204);

    await app.request("/not-modified");
    assert.strictEqual(logs.length, 2);
    assert.strictEqual(logs[1].properties.status, 304);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs HEAD requests without consuming the body", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
      ));

    // No drain: the log must appear immediately because Hono discards the
    // body of a HEAD response after the middleware chain completes.
    const res = await app.request("/stream", { method: "HEAD" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body, null);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.method, "HEAD");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs when a stream is cancelled before reading", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let sourceCancelReason: unknown;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => {});
          },
          cancel(reason) {
            sourceCancelReason = reason;
          },
        }),
      ));

    const res = await app.request("/stream");
    await res.body!.cancel("client-gone");

    assert.strictEqual(sourceCancelReason, "client-gone");
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.status, 200);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): logs when a stream is cancelled during a read", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let sourceCancelReason: unknown;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => {});
          },
          cancel(reason) {
            sourceCancelReason = reason;
          },
        }),
      ));

    const res = await app.request("/stream");
    const reader = res.body!.getReader();
    const pending = reader.read();
    await delay(10);
    await reader.cancel("client-gone");
    const result = await pending;

    assert.strictEqual(result.done, true);
    assert.strictEqual(sourceCancelReason, "client-gone");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): preserves source read errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("source failure");
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(failure);
          },
        }),
      ));

    const res = await app.request("/stream");
    await assert.rejects(res.text(), (error) => error === failure);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): forwards chunks before a later source error", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("later failure");
    let sent = false;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent) {
              controller.error(failure);
              return;
            }
            sent = true;
            controller.enqueue(new TextEncoder().encode("chunk"));
          },
        }),
      ));

    const res = await app.request("/stream");
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.strictEqual(new TextDecoder().decode(first.value), "chunk");
    await assert.rejects(reader.read(), (error) => error === failure);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): forwards byte chunks before a later source error", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("later byte failure");
    const payload = new TextEncoder().encode("chunk");
    let sent = false;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          autoAllocateChunkSize: 16,
          pull(controller: ReadableByteStreamController) {
            const request = controller.byobRequest;
            const view = request?.view;
            if (request == null || view == null) return;
            if (sent) {
              controller.error(failure);
              return;
            }
            sent = true;
            new Uint8Array(view.buffer, view.byteOffset, payload.byteLength)
              .set(payload);
            request.respond(payload.byteLength);
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.strictEqual(new TextDecoder().decode(first.value), "chunk");
    await assert.rejects(reader.read(), (error) => error === failure);
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): preserves byte-stream source read errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const failure = new Error("byte source failure");
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          pull(controller: ReadableByteStreamController) {
            controller.error(failure);
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader({ mode: "byob" });
    await assert.rejects(
      reader.read(new Uint8Array(16)),
      (error) => error === failure,
    );
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): cancels a byte stream before it is read", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let sourceCancelReason: unknown;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          pull() {
            return new Promise<void>(() => {});
          },
          cancel(reason) {
            sourceCancelReason = reason;
          },
        }),
      ));

    const res = await app.request("/bytes");
    await res.body!.cancel("byte-gone");

    assert.strictEqual(sourceCancelReason, "byte-gone");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): cancels a byte stream during a BYOB read", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let sourceCancelReason: unknown;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/bytes", () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          pull() {
            return new Promise<void>(() => {});
          },
          cancel(reason) {
            sourceCancelReason = reason;
          },
        }),
      ));

    const res = await app.request("/bytes");
    const reader = res.body!.getReader({ mode: "byob" });
    const pending = reader.read(new Uint8Array(16));
    await delay(10);
    await reader.cancel("byte-gone");
    const result = await pending;

    assert.strictEqual(result.done, true);
    assert.strictEqual(sourceCancelReason, "byte-gone");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// Response Preservation Tests
// ============================================

test("honoLogger(): preserves response status, headers, and cookies", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger());
    app.get("/created", () => {
      const headers = new Headers();
      headers.set("content-type", "text/plain; charset=UTF-8");
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return new Response("created", {
        status: 201,
        statusText: "Created",
        headers,
      });
    });
    app.get("/redirect", (c) => c.redirect("/target"));

    const created = await drain(app.request("/created"));
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.statusText, "Created");
    assert.strictEqual(
      created.headers.get("content-type"),
      "text/plain; charset=UTF-8",
    );
    const setCookie = created.headers.get("set-cookie") ?? "";
    assert.ok(setCookie.includes("a=1"));
    assert.ok(setCookie.includes("b=2"));

    const redirect = await drain(app.request("/redirect"));
    assert.strictEqual(redirect.status, 302);
    assert.strictEqual(redirect.headers.get("location"), "/target");
  } finally {
    await cleanup();
  }
});

test("honoLogger(): preserves fetched response metadata", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    let upstream!: Response;
    const app = new Hono();
    app.use(honoLogger());
    app.get("/proxy", async () => {
      upstream = await fetch("data:text/plain,hello");
      return upstream;
    });

    const res = await app.request("/proxy");
    assert.strictEqual(res.url, upstream.url);
    assert.strictEqual(res.type, upstream.type);
    assert.strictEqual(res.redirected, upstream.redirected);
    assert.strictEqual(await res.text(), "hello");
    assert.strictEqual(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("honoLogger(): skip does not wrap or lock the response body", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Hono();
    app.use(honoLogger({ skip: () => true }));
    app.get("/test", (c) => c.text("Hello"));

    const res = await app.request("/test");
    assert.strictEqual(res.body?.locked, false);
    assert.strictEqual(await res.text(), "Hello");
    assert.strictEqual(logs.length, 0);
  } finally {
    await cleanup();
  }
});

// ============================================
// Logging Failure Tests
// ============================================

function findMetaError(logs: LogRecord[]): LogRecord | undefined {
  return logs.find((record) =>
    record.category.length === 2 &&
    record.category[0] === "logtape" &&
    record.category[1] === "meta" &&
    record.level === "error"
  );
}

test("honoLogger(): reports formatter errors to the meta logger", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const app = new Hono();
    app.use(honoLogger({
      format: () => {
        throw new Error("format boom");
      },
    }));
    app.get("/test", (c) => c.text("Hello"));

    const res = await drain(app.request("/test"));
    assert.strictEqual(res.status, 200);

    const metaError = findMetaError(logs);
    assert.ok(metaError);
    assert.strictEqual(
      (metaError.properties.error as Error).message,
      "format boom",
    );
  } finally {
    await cleanup();
  }
});

test("honoLogger(): reports formatter errors on cancellation", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const app = new Hono();
    app.use(honoLogger({
      format: () => {
        throw new Error("format boom");
      },
    }));
    app.get("/stream", () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => {});
          },
        }),
      ));

    const res = await app.request("/stream");
    await res.body!.cancel("client-gone");

    assert.ok(findMetaError(logs));
  } finally {
    await cleanup();
  }
});

test("honoLogger(): reports formatter errors on null-body responses", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const app = new Hono();
    app.use(honoLogger({
      format: () => {
        throw new Error("format boom");
      },
    }));
    app.get("/no-content", (c) => c.body(null, 204));

    const res = await app.request("/no-content");
    assert.strictEqual(res.status, 204);

    assert.ok(findMetaError(logs));
  } finally {
    await cleanup();
  }
});

test("honoLogger(): reports formatter errors in logRequest mode", async () => {
  const { logs, cleanup } = await setupLogtape({ includeMeta: true });
  try {
    const app = new Hono();
    app.use(honoLogger({
      logRequest: true,
      format: () => {
        throw new Error("format boom");
      },
    }));
    app.get("/test", (c) => c.text("Hello"));

    const res = await drain(app.request("/test"));
    assert.strictEqual(res.status, 200);

    assert.ok(findMetaError(logs));
  } finally {
    await cleanup();
  }
});
