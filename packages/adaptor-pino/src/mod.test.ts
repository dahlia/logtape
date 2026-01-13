import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import process from "node:process";
import { pino } from "pino";
import build from "pino-abstract-transport";
import { getPinoSink } from "./mod.ts";

interface PinoLog {
  level: number;
  time: number;
  pid: number;
  hostname: string;
  value: Record<string, unknown>;
  msg: string;
  [key: string]: unknown; // Allow additional properties from LogTape properties
}

test("getPinoSink(): basic scenario", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);
  const sink = getPinoSink(logger);
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
  logger.flush();
  await delay(500);
  assert.deepStrictEqual(buffer, [
    {
      level: 30,
      time: buffer[0]?.time,
      pid: process.pid,
      hostname: os.hostname(),
      value: { foo: 123 },
      msg: 'Test log: [{"foo":123}]',
    },
  ]);
  assert.ok(buffer[0].time >= before);
  assert.ok(buffer[0].time <= after);
});

test("getPinoSink(): log level mappings", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);
  const sink = getPinoSink(logger);

  const logLevels = [
    { logTapeLevel: "info", expectedPinoLevel: 30 },
    { logTapeLevel: "warning", expectedPinoLevel: 40 },
    { logTapeLevel: "error", expectedPinoLevel: 50 },
    { logTapeLevel: "fatal", expectedPinoLevel: 60 },
  ] as const;

  for (const { logTapeLevel } of logLevels) {
    sink({
      category: ["test"],
      level: logTapeLevel,
      message: [`${logTapeLevel} message`],
      properties: {},
      rawMessage: `${logTapeLevel} message`,
      timestamp: Date.now(),
    });
  }

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, 4);
  for (let i = 0; i < logLevels.length; i++) {
    assert.strictEqual(
      buffer[i].level,
      logLevels[i].expectedPinoLevel,
      `Level mapping failed for ${logLevels[i].logTapeLevel}`,
    );
  }
});

test("getPinoSink(): category option - false/undefined", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

  // Test with category: false
  const sinkFalse = getPinoSink(logger, { category: false });
  sinkFalse({
    category: ["test", "category"],
    level: "info",
    message: ["Test message"],
    properties: {},
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  // Test with no options (undefined)
  const sinkUndefined = getPinoSink(logger);
  sinkUndefined({
    category: ["test", "category"],
    level: "info",
    message: ["Test message 2"],
    properties: {},
    rawMessage: "Test message 2",
    timestamp: Date.now(),
  });

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, 2);
  assert.strictEqual(buffer[0].msg, "Test message");
  assert.strictEqual(buffer[1].msg, "Test message 2");
  // Both should NOT include category in the message
});

test("getPinoSink(): category option - true (default formatting)", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

  const sink = getPinoSink(logger, { category: true });
  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test message"],
    properties: {},
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, 1);
  assert.strictEqual(buffer[0].msg, "test·category: Test message");
});

test("getPinoSink(): category decorators", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

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
    const sink = getPinoSink(logger, {
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

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, decorators.length);
  for (let i = 0; i < decorators.length; i++) {
    assert.strictEqual(
      buffer[i].msg,
      decorators[i].expected,
      `Decorator '${decorators[i].decorator}' failed`,
    );
  }
});

test("getPinoSink(): category position (start vs end)", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

  // Test position: "start"
  const sinkStart = getPinoSink(logger, {
    category: { position: "start", decorator: "[]" },
  });
  sinkStart({
    category: ["test"],
    level: "info",
    message: ["Message"],
    properties: {},
    rawMessage: "Message",
    timestamp: Date.now(),
  });

  // Test position: "end"
  const sinkEnd = getPinoSink(logger, {
    category: { position: "end", decorator: "[]" },
  });
  sinkEnd({
    category: ["test"],
    level: "info",
    message: ["Message"],
    properties: {},
    rawMessage: "Message",
    timestamp: Date.now(),
  });

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, 2);
  assert.strictEqual(buffer[0].msg, "[test] Message");
  assert.strictEqual(buffer[1].msg, "Message [test]");
});

test("getPinoSink(): category separator", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

  const separators = [
    { separator: ".", expected: "[app.service.logger] Message" },
    { separator: "/", expected: "[app/service/logger] Message" },
    { separator: "::", expected: "[app::service::logger] Message" },
    { separator: " > ", expected: "[app > service > logger] Message" },
  ];

  for (const { separator } of separators) {
    const sink = getPinoSink(logger, {
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

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, separators.length);
  for (let i = 0; i < separators.length; i++) {
    assert.strictEqual(
      buffer[i].msg,
      separators[i].expected,
      `Separator '${separators[i].separator}' failed`,
    );
  }
});

test("getPinoSink(): empty category handling", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

  const sink = getPinoSink(logger, {
    category: { decorator: "[]", position: "start" },
  });

  // Test with empty category array
  sink({
    category: [],
    level: "info",
    message: ["Message with empty category"],
    properties: {},
    rawMessage: "Message with empty category",
    timestamp: Date.now(),
  });

  // Test with single empty string category
  sink({
    category: [""],
    level: "info",
    message: ["Message with empty string category"],
    properties: {},
    rawMessage: "Message with empty string category",
    timestamp: Date.now(),
  });

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, 2);
  // Empty category array should not include category in message
  assert.strictEqual(buffer[0].msg, "Message with empty category");
  // Single empty string should still show the decorator
  assert.strictEqual(buffer[1].msg, "[] Message with empty string category");
});

test("getPinoSink(): message interpolation", async () => {
  const buffer: PinoLog[] = [];
  const dest = build(async (source) => {
    for await (const obj of source) {
      buffer.push(obj);
    }
  }, {});
  const logger = pino({
    useOnlyCustomLevels: false,
  }, dest);

  const sink = getPinoSink(logger, {
    category: { decorator: ":", position: "start" },
  });

  // Test message with interpolated values
  sink({
    category: ["app", "auth"],
    level: "info",
    message: [
      "User ",
      { userId: 123, username: "johndoe" },
      " logged in",
    ],
    properties: { sessionId: "sess_abc123", source: "web" },
    rawMessage: "User {user} logged in",
    timestamp: Date.now(),
  });

  logger.flush();
  await delay(100);

  assert.strictEqual(buffer.length, 1);

  // Check that the message contains expected parts
  const actualMsg = buffer[0].msg;
  assert.strictEqual(
    actualMsg.includes("app·auth"),
    true,
    "Should contain category",
  );
  assert.strictEqual(actualMsg.includes("User"), true, "Should contain 'User'");
  assert.strictEqual(
    actualMsg.includes("logged in"),
    true,
    "Should contain 'logged in'",
  );

  assert.strictEqual(buffer[0].sessionId, "sess_abc123");
  assert.strictEqual(buffer[0].source, "web");
});
