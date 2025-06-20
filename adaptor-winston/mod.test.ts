import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import winston from "winston";
import WinstonTransport from "winston-transport";
import { getWinstonSink, type Logger } from "./mod.ts";

const test = suite(import.meta);

interface LogEvent extends Record<string, unknown> {
  level: keyof Logger;
  message: string;
}

class BufferTransport extends WinstonTransport {
  readonly logs: LogEvent[];

  // deno-lint-ignore no-explicit-any
  constructor(ops?: any) {
    super(ops);
    this.logs = [];
  }

  override log(info: LogEvent, callback: () => void) {
    this.logs.push(info);
    if (callback) callback();
  }
}

test("getWinstonSink(): basic scenario", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    level: "silly",
    transports: [buffer],
  });
  const sink = getWinstonSink(logger);
  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test log: ", { foo: 123 }, ""],
    properties: { value: { foo: 123 } },
    rawMessage: "Test log: {value}",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  const log = buffer.logs[0];
  assertEquals(log.level, "info");
  assertEquals(log.message, "Test log: { foo: 123 }");
  assertEquals(log.value, { foo: 123 });
});

test("getWinstonSink(): default level mapping", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    level: "silly",
    transports: [buffer],
  });
  const sink = getWinstonSink(logger);

  const testCases = [
    { logTapeLevel: "trace", expectedWinstonLevel: "silly" },
    { logTapeLevel: "debug", expectedWinstonLevel: "debug" },
    { logTapeLevel: "info", expectedWinstonLevel: "info" },
    { logTapeLevel: "warning", expectedWinstonLevel: "warn" },
    { logTapeLevel: "error", expectedWinstonLevel: "error" },
    { logTapeLevel: "fatal", expectedWinstonLevel: "error" },
  ] as const;

  for (const { logTapeLevel, expectedWinstonLevel } of testCases) {
    buffer.logs.length = 0; // Clear buffer
    sink({
      category: [],
      level: logTapeLevel,
      message: [`${logTapeLevel} message`],
      properties: {},
      rawMessage: `${logTapeLevel} message`,
      timestamp: Date.now(),
    });
    assertEquals(buffer.logs.length, 1);
    assertEquals(buffer.logs[0].level, expectedWinstonLevel);
  }
});

test("getWinstonSink(): custom level mapping", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    level: "silly",
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    levelsMap: {
      "trace": "debug",
      "debug": "debug",
      "info": "info",
      "warning": "warn",
      "error": "error",
      "fatal": "error",
    },
  });

  sink({
    category: [],
    level: "trace",
    message: ["trace message"],
    properties: {},
    rawMessage: "trace message",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].level, "debug");
});

test("getWinstonSink(): category disabled", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: false,
  });

  sink({
    category: ["app", "database"],
    level: "info",
    message: ["Database connected"],
    properties: {},
    rawMessage: "Database connected",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, "Database connected");
});

test("getWinstonSink(): category with default formatting", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: true,
  });

  sink({
    category: ["app", "database"],
    level: "info",
    message: ["Database connected"],
    properties: {},
    rawMessage: "Database connected",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, "app·database: Database connected");
});

test("getWinstonSink(): category with custom separator", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: {
      separator: ".",
    },
  });

  sink({
    category: ["app", "database", "connection"],
    level: "info",
    message: ["Database connected"],
    properties: {},
    rawMessage: "Database connected",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(
    buffer.logs[0].message,
    "app.database.connection: Database connected",
  );
});

test("getWinstonSink(): category with different decorators", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });

  const decorators = [
    { decorator: "[]", expected: "[app·db] Message" },
    { decorator: "()", expected: "(app·db) Message" },
    { decorator: "<>", expected: "<app·db> Message" },
    { decorator: "{}", expected: "{app·db} Message" },
    { decorator: ":", expected: "app·db: Message" },
    { decorator: "-", expected: "app·db - Message" },
    { decorator: "|", expected: "app·db | Message" },
    { decorator: "/", expected: "app·db / Message" },
    { decorator: "", expected: "app·db Message" },
  ] as const;

  for (const { decorator, expected } of decorators) {
    buffer.logs.length = 0; // Clear buffer
    const sink = getWinstonSink(logger, {
      category: { decorator },
    });

    sink({
      category: ["app", "db"],
      level: "info",
      message: ["Message"],
      properties: {},
      rawMessage: "Message",
      timestamp: Date.now(),
    });
    assertEquals(buffer.logs.length, 1);
    assertEquals(buffer.logs[0].message, expected);
  }
});

test("getWinstonSink(): category at end position", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: {
      position: "end",
    },
  });

  sink({
    category: ["app", "db"],
    level: "info",
    message: ["Database connected"],
    properties: {},
    rawMessage: "Database connected",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, "Database connected: app·db");
});

test("getWinstonSink(): category at end with different decorators", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });

  const decorators = [
    { decorator: "[]", expected: "Message [app·db]" },
    { decorator: "()", expected: "Message (app·db)" },
    { decorator: "<>", expected: "Message <app·db>" },
    { decorator: "{}", expected: "Message {app·db}" },
    { decorator: ":", expected: "Message: app·db" },
    { decorator: "-", expected: "Message - app·db" },
    { decorator: "|", expected: "Message | app·db" },
    { decorator: "/", expected: "Message / app·db" },
    { decorator: "", expected: "Message app·db" },
  ] as const;

  for (const { decorator, expected } of decorators) {
    buffer.logs.length = 0; // Clear buffer
    const sink = getWinstonSink(logger, {
      category: {
        position: "end",
        decorator,
      },
    });

    sink({
      category: ["app", "db"],
      level: "info",
      message: ["Message"],
      properties: {},
      rawMessage: "Message",
      timestamp: Date.now(),
    });
    assertEquals(buffer.logs.length, 1);
    assertEquals(buffer.logs[0].message, expected);
  }
});

test("getWinstonSink(): empty category", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: true,
  });

  sink({
    category: [],
    level: "info",
    message: ["Message without category"],
    properties: {},
    rawMessage: "Message without category",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, "Message without category");
});

test("getWinstonSink(): custom value formatter", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    valueFormatter: (value) => `CUSTOM:${JSON.stringify(value)}`,
  });

  sink({
    category: [],
    level: "info",
    message: ["User: ", { name: "John", age: 30 }, ""],
    properties: { user: { name: "John", age: 30 } },
    rawMessage: "User: {user}",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, 'User: CUSTOM:{"name":"John","age":30}');
});

test("getWinstonSink(): message interpolation", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger);

  sink({
    category: [],
    level: "info",
    message: ["Hello ", "world", ", count: ", 42, "!"],
    properties: { name: "world", count: 42 },
    rawMessage: "Hello {name}, count: {count}!",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, "Hello 'world', count: 42!");
});

test("getWinstonSink(): properties are passed to winston", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger);

  const properties = {
    userId: 123,
    requestId: "abc-def-ghi",
    metadata: { version: "1.0.0" },
  };

  sink({
    category: [],
    level: "info",
    message: ["User action performed"],
    properties,
    rawMessage: "User action performed",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].userId, 123);
  assertEquals(buffer.logs[0].requestId, "abc-def-ghi");
  assertEquals(buffer.logs[0].metadata, { version: "1.0.0" });
});

test("getWinstonSink(): single category", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: true,
  });

  sink({
    category: ["app"],
    level: "info",
    message: ["Single category message"],
    properties: {},
    rawMessage: "Single category message",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(buffer.logs[0].message, "app: Single category message");
});

test("getWinstonSink(): complex category with custom options", () => {
  const buffer = new BufferTransport({});
  const logger = winston.createLogger({
    transports: [buffer],
  });
  const sink = getWinstonSink(logger, {
    category: {
      separator: "/",
      position: "end",
      decorator: "[]",
    },
  });

  sink({
    category: ["myapp", "api", "auth", "login"],
    level: "info",
    message: ["User logged in successfully"],
    properties: {},
    rawMessage: "User logged in successfully",
    timestamp: Date.now(),
  });
  assertEquals(buffer.logs.length, 1);
  assertEquals(
    buffer.logs[0].message,
    "User logged in successfully [myapp/api/auth/login]",
  );
});
