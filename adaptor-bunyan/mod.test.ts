import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { assertGreaterOrEqual } from "@std/assert/greater-or-equal";
import { assertLessOrEqual } from "@std/assert/less-or-equal";
import { delay } from "@std/async/delay";
import bunyan from "bunyan";
import { getBunyanSink } from "./mod.ts";

const test = suite(import.meta);

test("getBunyanSink(): basic scenario", async () => {
  const logs: any[] = [];
  const bunyanLogger = bunyan.createLogger({
    name: "test",
    streams: [
      {
        type: "raw",
        stream: {
          write: (rec: any) => logs.push(rec),
        },
      },
    ],
  });
  const sink = getBunyanSink(bunyanLogger);
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
  const logs: any[] = [];
  const bunyanLogger = bunyan.createLogger({
    name: "test",
    streams: [
      {
        type: "raw",
        stream: {
          write: (rec: any) => logs.push(rec),
        },
      },
    ],
  });
  const sink = getBunyanSink(bunyanLogger, { childLogger: true });
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
  const logs: any[] = [];
  const bunyanLogger = bunyan.createLogger({
    name: "test",
    streams: [
      {
        type: "raw",
        stream: {
          write: (rec: any) => logs.push(rec),
        },
      },
    ],
  });
  const sink = getBunyanSink(bunyanLogger, {
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
  const logs: any[] = [];
  const sink = getBunyanSink(undefined, {
    serializers: {
      value: (v: any) => (typeof v === "object" ? "[redacted]" : v),
    },
  });
  // Patch the default logger to capture logs
  // @ts-ignore
  sink._logger = {
    info: (props: any, msg: string) => logs.push({ ...props, msg }),
    child: function () { return this; },
  };
  sink({
    category: ["ser"],
    level: "info",
    message: ["Serializer test"],
    properties: { value: { secret: 42 } },
    rawMessage: "Serializer test",
    timestamp: Date.now(),
  });
  await delay(50);
  // The serializer should have been applied
  assertEquals(logs.length, 1);
  assertEquals(logs[0].value, "[redacted]");
});

test("getBunyanSink(): works with default logger (no logger provided)", async () => {
  const sink = getBunyanSink();
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
