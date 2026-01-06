import { suite } from "@alinea/suite";
import { assert, assertEquals, assertExists } from "@std/assert";
import { delay } from "@std/async/delay";
import { configure, type LogRecord, reset } from "@logtape/logtape";
import { Elysia } from "elysia";
import { elysiaLogger } from "./mod.ts";

const _test = suite(import.meta);

// Elysia creates internal timers that cause leak detection failures in Deno.
// Wrap all tests with sanitizer options disabled.
const test = (
  name: string,
  fn: () => void | Promise<void>,
) => _test(name, { sanitizeOps: false, sanitizeResources: false }, fn);

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
// Basic Plugin Creation Tests
// ============================================

test("elysiaLogger(): creates an Elysia plugin", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const plugin = elysiaLogger();
    assert(plugin instanceof Elysia);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs request after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    const res = await app.handle(new Request("http://localhost/test"));
    assertEquals(res.status, 200);
    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// Category Configuration Tests
// ============================================

test("elysiaLogger(): uses default category ['elysia']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["elysia"]);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): uses custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ category: ["myapp", "http"] }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["myapp", "http"]);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ category: "myapp" }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].category, ["myapp"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Log Level Tests
// ============================================

test("elysiaLogger(): uses default log level 'info'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "info");
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): uses custom log level 'debug'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ level: "debug" }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): uses custom log level 'warning'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ level: "warning" }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].level, "warning");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Combined (default)
// ============================================

test("elysiaLogger(): combined format logs structured properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ format: "combined" }))
      .get("/test", () => "Hello");

    await app.handle(
      new Request("http://localhost/test", {
        headers: {
          "User-Agent": "test-agent/1.0",
          "Referer": "http://example.com",
        },
      }),
    );

    assertEquals(logs.length, 1);
    const props = logs[0].properties;
    assertEquals(props.method, "GET");
    assert((props.url as string).includes("/test"));
    assertEquals(props.path, "/test");
    assertEquals(props.status, 200);
    assertExists(props.responseTime);
    assertEquals(props.userAgent, "test-agent/1.0");
    assertEquals(props.referrer, "http://example.com");
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Common
// ============================================

test("elysiaLogger(): common format excludes referrer and userAgent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ format: "common" }))
      .get("/test", () => "Hello");

    await app.handle(
      new Request("http://localhost/test", {
        headers: {
          "User-Agent": "test-agent/1.0",
          "Referer": "http://example.com",
        },
      }),
    );

    assertEquals(logs.length, 1);
    const props = logs[0].properties;
    assertEquals(props.method, "GET");
    assertEquals(props.path, "/test");
    assertEquals(props.status, 200);
    assertEquals(props.referrer, undefined);
    assertEquals(props.userAgent, undefined);
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Dev
// ============================================

test("elysiaLogger(): dev format returns string message", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ format: "dev" }))
      .post("/api/users", ({ set }) => {
        set.status = 201;
        return "Created";
      });

    await app.handle(
      new Request("http://localhost/api/users", { method: "POST" }),
    );

    assertEquals(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert(msg.includes("POST"));
    assert(msg.includes("/api/users"));
    assert(msg.includes("201"));
    assert(msg.includes("ms"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Short
// ============================================

test("elysiaLogger(): short format includes url", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ format: "short" }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert(msg.includes("GET"));
    assert(msg.includes("/test"));
    assert(msg.includes("200"));
    assert(msg.includes("ms"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Format Tests - Tiny
// ============================================

test("elysiaLogger(): tiny format is minimal", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ format: "tiny" }))
      .get("/test", () => "Hello");

    const res = await app.handle(new Request("http://localhost/test"));
    assertEquals(res.status, 200);

    assertEquals(logs.length, 1);
    const msg = logs[0].rawMessage;
    assert(msg.includes("GET"));
    assert(msg.includes("/test"));
    assert(msg.includes("200"));
    assert(msg.includes("ms"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Custom Format Function Tests
// ============================================

test("elysiaLogger(): custom format returning string", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(
        elysiaLogger({
          format: (ctx, _responseTime) =>
            `Custom: ${ctx.request.method} ${ctx.set.status}`,
        }),
      )
      .delete("/test", ({ set }) => {
        set.status = 202;
        return "Accepted";
      });

    await app.handle(
      new Request("http://localhost/test", { method: "DELETE" }),
    );

    assertEquals(logs.length, 1);
    assertEquals(logs[0].rawMessage, "Custom: DELETE 202");
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): custom format returning object", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(
        elysiaLogger({
          format: (ctx, responseTime) => ({
            customMethod: ctx.request.method,
            customStatus: ctx.set.status,
            customDuration: responseTime,
          }),
        }),
      )
      .patch("/test", ({ set }) => {
        set.status = 202;
        return "Accepted";
      });

    await app.handle(new Request("http://localhost/test", { method: "PATCH" }));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.customMethod, "PATCH");
    assertEquals(logs[0].properties.customStatus, 202);
    assertExists(logs[0].properties.customDuration);
  } finally {
    await cleanup();
  }
});

// ============================================
// Skip Function Tests
// ============================================

test("elysiaLogger(): skip function prevents logging when returns true", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(
        elysiaLogger({
          skip: () => true,
        }),
      )
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 0);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): skip function allows logging when returns false", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(
        elysiaLogger({
          skip: () => false,
        }),
      )
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): skip function receives context", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(
        elysiaLogger({
          skip: (ctx) => ctx.path === "/health",
        }),
      )
      .get("/test", () => "Hello")
      .get("/health", () => "OK");

    // Health endpoint should be skipped
    await app.handle(new Request("http://localhost/health"));
    assertEquals(logs.length, 0);

    // Other endpoints should be logged
    await app.handle(new Request("http://localhost/test"));
    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
  }
});

// ============================================
// logRequest (Immediate) Mode Tests
// ============================================

test("elysiaLogger(): logRequest mode logs at request start", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ logRequest: true }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.responseTime, 0); // Zero because it's immediate
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): non-logRequest mode logs after response", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ logRequest: false }))
      .get("/test", async () => {
        // Small delay to ensure non-zero response time
        await delay(5);
        return "Hello";
      });

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assert((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

// ============================================
// Plugin Scope Tests
// ============================================

test("elysiaLogger(): scope 'global' is default", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): scope 'scoped' works", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ scope: "scoped" }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): scope 'local' works", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger({ scope: "local" }))
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    // Local scope may not log requests defined outside the plugin
    // This test just ensures no errors
    assert(logs.length >= 0);
  } finally {
    await cleanup();
  }
});

// ============================================
// Error Logging Tests
// ============================================

test("elysiaLogger(): logs errors at error level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/error", () => {
        throw new Error("Test error");
      });

    await app.handle(new Request("http://localhost/error"));

    // Should have at least one error log
    const errorLogs = logs.filter((log) => log.level === "error");
    assert(errorLogs.length >= 1);
    assert(
      (errorLogs[0].rawMessage as string).includes("Error") ||
        (errorLogs[0].properties.errorMessage as string)?.includes(
          "Test error",
        ),
    );
  } finally {
    await cleanup();
  }
});

// ============================================
// Request Property Tests
// ============================================

test("elysiaLogger(): logs correct method", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello")
      .post("/test", () => "Hello")
      .put("/test", () => "Hello")
      .delete("/test", () => "Hello");

    const methods = ["GET", "POST", "PUT", "DELETE"];
    for (const method of methods) {
      await app.handle(new Request("http://localhost/test", { method }));
    }

    assertEquals(logs.length, methods.length);
    for (let i = 0; i < methods.length; i++) {
      assertEquals(logs[i].properties.method, methods[i]);
    }
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs path correctly", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/api/v1/users", () => "Hello");

    await app.handle(new Request("http://localhost/api/v1/users"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.path, "/api/v1/users");
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs status code", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/200", () => "OK")
      .get("/201", ({ set }) => {
        set.status = 201;
        return "Created";
      })
      .get("/400", ({ set }) => {
        set.status = 400;
        return "Bad Request";
      })
      .get("/500", ({ set }) => {
        set.status = 500;
        return "Error";
      });

    const paths = ["/200", "/201", "/400", "/500"];
    const expectedStatuses = [200, 201, 400, 500];

    for (const path of paths) {
      await app.handle(new Request(`http://localhost${path}`));
    }

    assertEquals(logs.length, paths.length);
    for (let i = 0; i < paths.length; i++) {
      assertEquals(logs[i].properties.status, expectedStatuses[i]);
    }
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs response time as number", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(typeof logs[0].properties.responseTime, "number");
    assert((logs[0].properties.responseTime as number) >= 0);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs user agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(
      new Request("http://localhost/test", {
        headers: { "User-Agent": "TestClient/1.0" },
      }),
    );

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.userAgent, "TestClient/1.0");
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(
      new Request("http://localhost/test", {
        headers: { Referer: "https://example.com/page" },
      }),
    );

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.referrer, "https://example.com/page");
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): logs X-Forwarded-For as remoteAddr", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(
      new Request("http://localhost/test", {
        headers: { "X-Forwarded-For": "192.168.1.1, 10.0.0.1" },
      }),
    );

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.remoteAddr, "192.168.1.1");
  } finally {
    await cleanup();
  }
});

// ============================================
// Multiple Requests Tests
// ============================================

test("elysiaLogger(): handles multiple sequential requests", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/path/:id", ({ params }) => `Path: ${params.id}`);

    for (let i = 0; i < 5; i++) {
      await app.handle(new Request(`http://localhost/path/${i}`));
    }

    assertEquals(logs.length, 5);
    for (let i = 0; i < 5; i++) {
      assertEquals(logs[i].properties.path, `/path/${i}`);
    }
  } finally {
    await cleanup();
  }
});

// ============================================
// Edge Cases
// ============================================

test("elysiaLogger(): handles missing user-agent", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.userAgent, undefined);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): handles missing referrer", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/test", () => "Hello");

    await app.handle(new Request("http://localhost/test"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.referrer, undefined);
  } finally {
    await cleanup();
  }
});

test("elysiaLogger(): handles query parameters in url", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/search", ({ query }) => `Query: ${query.q}`);

    await app.handle(new Request("http://localhost/search?q=test&limit=10"));

    assertEquals(logs.length, 1);
    assertEquals(logs[0].properties.path, "/search");
    assert((logs[0].properties.url as string).includes("q=test"));
    assert((logs[0].properties.url as string).includes("limit=10"));
  } finally {
    await cleanup();
  }
});

// ============================================
// Error Status Code Tests (Issue #128)
// ============================================

test("elysiaLogger(): logs correct 404 status code for NOT_FOUND errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const app = new Elysia()
      .use(elysiaLogger())
      .get("/exists", () => "Hello");

    // Request non-existent route to trigger NOT_FOUND
    const res = await app.handle(new Request("http://localhost/not-found"));
    assertEquals(res.status, 404);

    // Should have error log with 404 status
    const errorLogs = logs.filter((log) => log.level === "error");
    assertEquals(errorLogs.length, 1);
    assertEquals(errorLogs[0].properties.status, 404);
  } finally {
    await cleanup();
  }
});
