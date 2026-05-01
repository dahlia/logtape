import assert from "node:assert/strict";
import os from "node:os";
import process from "node:process";
import test from "node:test";
import bunyan from "bunyan";
import { getLogger, resetSync } from "@logtape/logtape";
import { getBunyanSink, install } from "./mod.ts";

interface BunyanRecord {
  name: string;
  hostname: string;
  pid: number;
  level: number;
  msg: string;
  time: Date;
  v: number;
  [key: string]: unknown;
}

function createLoggerWithBuffer(): {
  logger: bunyan;
  buffer: BunyanRecord[];
} {
  const ring = new bunyan.RingBuffer({ limit: 100 });
  const logger = bunyan.createLogger({
    name: "test",
    level: "trace",
    streams: [{ type: "raw", stream: ring, level: "trace" }],
  });
  return { logger, buffer: ring.records as BunyanRecord[] };
}

test("getBunyanSink(): basic scenario", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sink = getBunyanSink(logger);
  const before = Date.now();
  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test log: ", { foo: 123 }, ""],
    properties: { value: { foo: 123 } },
    rawMessage: "Test log: {value}",
    timestamp: Date.now(),
  });
  const after = Date.now();
  assert.equal(buffer.length, 1);
  const record = buffer[0];
  assert.equal(record.name, "test");
  assert.equal(record.hostname, os.hostname());
  assert.equal(record.pid, process.pid);
  assert.equal(record.level, 30);
  assert.equal(record.msg, "Test log: { foo: 123 }");
  assert.deepEqual(record.value, { foo: 123 });
  const recordTimeMs = record.time.getTime();
  assert.ok(recordTimeMs >= before);
  assert.ok(recordTimeMs <= after);
});

test("getBunyanSink(): category option false/undefined excludes category", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sinkFalse = getBunyanSink(logger, { category: false });
  sinkFalse({
    category: ["test", "category"],
    level: "info",
    message: ["Test message"],
    properties: {},
    rawMessage: "Test message",
    timestamp: Date.now(),
  });
  const sinkUndefined = getBunyanSink(logger);
  sinkUndefined({
    category: ["test", "category"],
    level: "info",
    message: ["Another message"],
    properties: {},
    rawMessage: "Another message",
    timestamp: Date.now(),
  });
  assert.equal(buffer.length, 2);
  assert.equal(buffer[0].msg, "Test message");
  assert.equal(buffer[1].msg, "Another message");
});

test("getBunyanSink(): category true uses defaults", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sink = getBunyanSink(logger, { category: true });
  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test message"],
    properties: {},
    rawMessage: "Test message",
    timestamp: Date.now(),
  });
  assert.equal(buffer.length, 1);
  assert.equal(buffer[0].msg, "test·category: Test message");
});

test("getBunyanSink(): category decorators", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const decorators = [
    { decorator: "[]", expected: "[test] Message" },
    { decorator: "()", expected: "(test) Message" },
    { decorator: "<>", expected: "<test> Message" },
    { decorator: "{}", expected: "{test} Message" },
    { decorator: ":", expected: "test: Message" },
    { decorator: "-", expected: "test - Message" },
    { decorator: "|", expected: "test | Message" },
    { decorator: "/", expected: "test / Message" },
    { decorator: "", expected: "test Message" },
  ] as const;
  for (const { decorator } of decorators) {
    const sink = getBunyanSink(logger, {
      category: { decorator, position: "start" },
    });
    sink({
      category: ["test"],
      level: "info",
      message: ["Message"],
      properties: {},
      rawMessage: "Message",
      timestamp: Date.now(),
    });
  }
  assert.equal(buffer.length, decorators.length);
  for (let i = 0; i < decorators.length; i++) {
    assert.equal(
      buffer[i].msg,
      decorators[i].expected,
      `Decorator '${decorators[i].decorator}' failed`,
    );
  }
});

test("getBunyanSink(): category position end", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const decorators = [
    { decorator: "[]", expected: "Message [test]" },
    { decorator: "()", expected: "Message (test)" },
    { decorator: "<>", expected: "Message <test>" },
    { decorator: "{}", expected: "Message {test}" },
    { decorator: ":", expected: "Message: test" },
    { decorator: "-", expected: "Message - test" },
    { decorator: "|", expected: "Message | test" },
    { decorator: "/", expected: "Message / test" },
    { decorator: "", expected: "Message test" },
  ] as const;
  for (const { decorator } of decorators) {
    const sink = getBunyanSink(logger, {
      category: { decorator, position: "end" },
    });
    sink({
      category: ["test"],
      level: "info",
      message: ["Message"],
      properties: {},
      rawMessage: "Message",
      timestamp: Date.now(),
    });
  }
  assert.equal(buffer.length, decorators.length);
  for (let i = 0; i < decorators.length; i++) {
    assert.equal(
      buffer[i].msg,
      decorators[i].expected,
      `End-position decorator '${decorators[i].decorator}' failed`,
    );
  }
});

test("getBunyanSink(): category separator", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const separators = [
    { separator: ".", expected: "[app.service.logger] Message" },
    { separator: "/", expected: "[app/service/logger] Message" },
    { separator: "::", expected: "[app::service::logger] Message" },
    { separator: " > ", expected: "[app > service > logger] Message" },
  ];
  for (const { separator } of separators) {
    const sink = getBunyanSink(logger, {
      category: { separator, decorator: "[]", position: "start" },
    });
    sink({
      category: ["app", "service", "logger"],
      level: "info",
      message: ["Message"],
      properties: {},
      rawMessage: "Message",
      timestamp: Date.now(),
    });
  }
  assert.equal(buffer.length, separators.length);
  for (let i = 0; i < separators.length; i++) {
    assert.equal(
      buffer[i].msg,
      separators[i].expected,
      `Separator '${separators[i].separator}' failed`,
    );
  }
});

test("install(): routes LogTape logs through bunyan", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  try {
    install(logger);
    getLogger("my-app").info("Hello {who}", { who: "world" });
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].level, 30);
    assert.equal(buffer[0].msg, "Hello 'world'");
    assert.equal(buffer[0].who, "world");
  } finally {
    resetSync();
  }
});

test("install(): forwards options to getBunyanSink", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  try {
    install(logger, { category: { decorator: "[]", position: "start" } });
    getLogger(["app", "auth"]).info("Login");
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].msg, "[app·auth] Login");
  } finally {
    resetSync();
  }
});

test("getBunyanSink(): empty category arrays are skipped", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sink = getBunyanSink(logger, {
    category: { decorator: "[]", position: "start" },
  });
  sink({
    category: [],
    level: "info",
    message: ["No category here"],
    properties: {},
    rawMessage: "No category here",
    timestamp: Date.now(),
  });
  assert.equal(buffer.length, 1);
  assert.equal(buffer[0].msg, "No category here");
});

test("getBunyanSink(): log level mappings", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sink = getBunyanSink(logger);
  const cases = [
    { level: "trace", expected: 10 },
    { level: "debug", expected: 20 },
    { level: "info", expected: 30 },
    { level: "warning", expected: 40 },
    { level: "error", expected: 50 },
    { level: "fatal", expected: 60 },
  ] as const;
  for (const { level } of cases) {
    sink({
      category: ["test"],
      level,
      message: [`${level} message`],
      properties: {},
      rawMessage: `${level} message`,
      timestamp: Date.now(),
    });
  }
  assert.equal(buffer.length, cases.length);
  for (let i = 0; i < cases.length; i++) {
    assert.equal(
      buffer[i].level,
      cases[i].expected,
      `Level mapping failed for ${cases[i].level}`,
    );
    assert.equal(buffer[i].msg, `${cases[i].level} message`);
  }
});
