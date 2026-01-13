import assert from "node:assert/strict";
import test from "node:test";
import { configure, type LogRecord, reset } from "@logtape/logtape";
import { Hono } from "hono";
import { honoLogger } from "./mod.ts";

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

    const res = await app.request("/test");
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

    await app.request("/test");

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

    await app.request("/test");

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

    await app.request("/test");

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

    await app.request("/test");

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

    await app.request("/test");

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

    await app.request("/test");

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

    await app.request("/test", {
      headers: {
        "User-Agent": "test-agent/1.0",
        "Referer": "http://example.com",
      },
    });

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

    await app.request("/test", {
      headers: {
        "User-Agent": "test-agent/1.0",
        "Referer": "http://example.com",
      },
    });

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

    await app.request("/api/users", { method: "POST" });

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

    await app.request("/test");

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

    const res = await app.request("/test");
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

    await app.request("/test", { method: "DELETE" });

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

    await app.request("/test", { method: "PATCH" });

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

    await app.request("/test");

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

    await app.request("/test");

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
    await app.request("/health");
    assert.strictEqual(logs.length, 0);

    // Other endpoints should be logged
    await app.request("/test");
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

    await app.request("/test");

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

    await app.request("/test");

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
      await app.request("/test", { method });
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

    await app.request("/api/v1/users");

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
      await app.request(path);
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

    await app.request("/test");

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

    await app.request("/test", {
      headers: { "User-Agent": "TestClient/1.0" },
    });

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

    await app.request("/test", {
      headers: { "Referer": "https://example.com/page" },
    });

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
      await app.request(`/path/${i}`);
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

    await app.request("/test");

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

    await app.request("/test");

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

    await app.request("/search?q=test&limit=10");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.path, "/search");
    assert.ok((logs[0].properties.url as string).includes("q=test"));
    assert.ok((logs[0].properties.url as string).includes("limit=10"));
  } finally {
    await cleanup();
  }
});
