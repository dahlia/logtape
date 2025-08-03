// TODO: Add substantial tests for OpenTelemetry integration.
// Current tests only verify basic browser compatibility and that the sink
// can be created without errors. Future tests should include:
// - Actual log record processing and OpenTelemetry output verification
// - Integration with real OpenTelemetry collectors
// - Message formatting and attribute handling
// - Error handling scenarios
// - Performance testing

import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert";
import { getOpenTelemetrySink } from "./mod.ts";

const test = suite(import.meta);

test("getOpenTelemetrySink() creates sink without node:process dependency", () => {
  // This test should pass in all environments (Deno, Node.js, browsers)
  // without throwing errors about missing node:process
  const sink = getOpenTelemetrySink();

  assertEquals(typeof sink, "function");
});

test("getOpenTelemetrySink() works with explicit serviceName", () => {
  const sink = getOpenTelemetrySink({
    serviceName: "test-service",
  });

  assertEquals(typeof sink, "function");
});

test("getOpenTelemetrySink() handles missing environment variables gracefully", () => {
  // Should not throw even if OTEL_SERVICE_NAME is not set
  const sink = getOpenTelemetrySink({
    // serviceName not provided, should fall back to env var
  });

  assertEquals(typeof sink, "function");
});

test("getOpenTelemetrySink() with diagnostics enabled", () => {
  const sink = getOpenTelemetrySink({
    diagnostics: true,
  });

  assertEquals(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom messageType", () => {
  const sink = getOpenTelemetrySink({
    messageType: "array",
  });

  assertEquals(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom objectRenderer", () => {
  const sink = getOpenTelemetrySink({
    objectRenderer: "json",
  });

  assertEquals(typeof sink, "function");
});

test("getOpenTelemetrySink() with custom bodyFormatter", () => {
  const sink = getOpenTelemetrySink({
    messageType: (message) => message.join(" "),
  });

  assertEquals(typeof sink, "function");
});
