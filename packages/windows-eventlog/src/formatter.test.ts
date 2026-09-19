import assert from "node:assert/strict";
import test from "node:test";
import type { LogRecord } from "@logtape/logtape";
import { defaultWindowsEventlogFormatter } from "./formatter.ts";

function createRecord(
  message: readonly unknown[],
  properties: Record<string, unknown> = {},
): LogRecord {
  return {
    category: ["test"],
    level: "info",
    message,
    rawMessage: "test",
    timestamp: new Date("2024-01-01T12:00:00.000Z").getTime(),
    properties,
  };
}

test("defaultWindowsEventlogFormatter() renders message arguments", () => {
  const formatted = defaultWindowsEventlogFormatter(
    createRecord(["state: ", { name: "session" }, ""]),
  );

  assert.ok(formatted.includes('state: {"name":"session"}'));
});

test("defaultWindowsEventlogFormatter() renders circular values", () => {
  const cyclic: Record<string, unknown> = { name: "session" };
  cyclic.self = cyclic;

  const formatted = defaultWindowsEventlogFormatter(
    createRecord(["state: ", cyclic, ""], { state: cyclic }),
  );

  assert.ok(
    formatted.includes('state: {"name":"session","self":"[Circular]"}'),
  );
  assert.ok(
    formatted.includes(
      'Properties: {"state":{"name":"session","self":"[Circular]"}}',
    ),
  );
});
