import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { assertGreaterOrEqual } from "@std/assert/greater-or-equal";
import { assertLessOrEqual } from "@std/assert/less-or-equal";
import { delay } from "@std/async/delay";
import bunyan from "bunyan";
import { getBunyanSink } from "./mod.ts";

const test = suite(import.meta);

type BunyanLogRecord = Record<string, unknown>;

test("getBunyanSink(): basic scenario", async () => {
  const logs: BunyanLogRecord[] = [];
  const bunyanLogger = bunyan.createLogger({
    name: "test",
    streams: [
      {
        type: "raw",
        stream: {
          write: (rec: unknown) => logs.push(rec as BunyanLogRecord),
        },
      },
    ],
  });
  const sink = await getBunyanSink(bunyanLogger);
  const before = Date.now();
  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test log: ", { foo: 123 }, ""],
    properties: { value: { foo: 123 } },
    rawMessage: "Test log: {value}",
    timestamp: Date.now(),
  });
  await delay(100);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].msg, "Test log: [object Object]");
  assertEquals(logs[0].value, { foo: 123 });
  assertGreaterOrEqual(logs[0].time, before);
  assertLessOrEqual(logs[0].time, Date.now());
});

test("getBunyanSink(): childLogger true uses category as context", async () => {
  const logs: BunyanLogRecord[] = [];
  const bunyanLogger = bunyan.createLogger({
    name: "test",
    streams: [
      {
        type: "raw",
        stream: {
          write: (rec: unknown) => logs.push(rec as BunyanLogRecord),
        },
      },
    ],
  });
  const sink = await getBunyanSink(bunyanLogger, { childLogger: true });
  sink({
    category: ["foo", "bar"],
    level: "info",
    message: ["Child logger test"],
    properties: {},
    rawMessage: "Child logger test",
    timestamp: Date.now(),
  });
  await delay(50);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].category, "foo.bar");
});

test("getBunyanSink(): childLogger function provides custom context", async () => {
  const logs: BunyanLogRecord[] = [];
  const bunyanLogger = bunyan.createLogger({
    name: "test",
    streams: [
      {
        type: "raw",
        stream: {
          write: (rec: unknown) => logs.push(rec as BunyanLogRecord),
        },
      },
    ],
  });
  const sink = await getBunyanSink(bunyanLogger, {
    childLogger: (record) => ({ custom: record.category.join("/") }),
  });
  sink({
    category: ["x", "y"],
    level: "info",
    message: ["Custom child context"],
    properties: {},
    rawMessage: "Custom child context",
    timestamp: Date.now(),
  });
  await delay(50);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].custom, "x/y");
});

test("getBunyanSink(): serializers option is used for default logger", async () => {
  const logs: BunyanLogRecord[] = [];
  const originalCreateLogger = bunyan.createLogger;
  bunyan.createLogger = function (options: bunyan.LoggerOptions) {
    options.streams = [{
      type: "raw",
      stream: {
        write: (rec: unknown) => logs.push(rec as BunyanLogRecord),
      },
    }];
    return originalCreateLogger.call(this, options);
  };
  const sink = await getBunyanSink(undefined, {
    serializers: {
      value: (v: unknown) => (typeof v === "object" ? "[redacted]" : v),
    },
  });
  sink({
    category: ["ser"],
    level: "info",
    message: ["Serializer test"],
    properties: { value: { secret: 42 } },
    rawMessage: "Serializer test",
    timestamp: Date.now(),
  });
  await delay(50);
  // Restore original createLogger
  bunyan.createLogger = originalCreateLogger;
  assertEquals(logs.length, 1);
  assertEquals(logs[0].value, "[redacted]");
});

test("getBunyanSink(): works with default logger (no logger provided)", async () => {
  const sink = await getBunyanSink();
  // Should not throw and should be callable
  sink({
    category: ["default"],
    level: "info",
    message: ["Default logger test"],
    properties: {},
    rawMessage: "Default logger test",
    timestamp: Date.now(),
  });
});
