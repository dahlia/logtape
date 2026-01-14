import assert from "node:assert/strict";
import test from "node:test";
import log4js from "log4js";
import { getLog4jsSink } from "./mod.ts";

interface MockLogger {
  logs: Array<{
    level: string;
    message: string;
    args: unknown[];
    context: Record<string, unknown>;
  }>;
  trace: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  fatal: (message: string, ...args: unknown[]) => void;
  addContext: (key: string, value: unknown) => void;
  removeContext: (key: string) => void;
  clearContext: () => void;
  _context: Record<string, unknown>;
}

function createMockLogger(): MockLogger {
  const logger = {
    logs: [],
    _context: {},
    trace(message: string, ...args: unknown[]) {
      this.logs.push({
        level: "trace",
        message,
        args,
        context: { ...this._context },
      });
    },
    debug(message: string, ...args: unknown[]) {
      this.logs.push({
        level: "debug",
        message,
        args,
        context: { ...this._context },
      });
    },
    info(message: string, ...args: unknown[]) {
      this.logs.push({
        level: "info",
        message,
        args,
        context: { ...this._context },
      });
    },
    warn(message: string, ...args: unknown[]) {
      this.logs.push({
        level: "warn",
        message,
        args,
        context: { ...this._context },
      });
    },
    error(message: string, ...args: unknown[]) {
      this.logs.push({
        level: "error",
        message,
        args,
        context: { ...this._context },
      });
    },
    fatal(message: string, ...args: unknown[]) {
      this.logs.push({
        level: "fatal",
        message,
        args,
        context: { ...this._context },
      });
    },
    addContext(key: string, value: unknown) {
      this._context[key] = value;
    },
    removeContext(key: string) {
      delete this._context[key];
    },
    clearContext() {
      this._context = {};
    },
  } as MockLogger;
  return logger;
}

test("getLog4jsSink(): basic scenario with fixed logger", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger);

  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test log: ", { foo: 123 }, ""],
    properties: { value: { foo: 123 } },
    rawMessage: "Test log: {value}",
    timestamp: Date.now(),
  });

  assert.strictEqual(mockLogger.logs.length, 1);
  assert.strictEqual(mockLogger.logs[0].level, "info");
  assert.ok(mockLogger.logs[0].message.includes("Test log:"));
  assert.ok(mockLogger.logs[0].message.includes("foo"));
  // With MDC strategy (default) and preserve mode, properties are added then removed
  // So context during the log should have the property
  assert.deepStrictEqual(mockLogger.logs[0].context, { value: { foo: 123 } });
});

test("getLog4jsSink(): log level mappings", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger);

  const logLevels = [
    { logTapeLevel: "trace", expectedLog4jsLevel: "trace" },
    { logTapeLevel: "debug", expectedLog4jsLevel: "debug" },
    { logTapeLevel: "info", expectedLog4jsLevel: "info" },
    { logTapeLevel: "warning", expectedLog4jsLevel: "warn" },
    { logTapeLevel: "error", expectedLog4jsLevel: "error" },
    { logTapeLevel: "fatal", expectedLog4jsLevel: "fatal" },
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

  assert.strictEqual(mockLogger.logs.length, 6);
  for (let i = 0; i < logLevels.length; i++) {
    assert.strictEqual(
      mockLogger.logs[i].level,
      logLevels[i].expectedLog4jsLevel,
      `Level mapping failed for ${logLevels[i].logTapeLevel}`,
    );
  }
});

test("getLog4jsSink(): custom level mapping", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger, {
    levelsMap: {
      trace: "debug",
      debug: "debug",
      info: "info",
      warning: "warn",
      error: "error",
      fatal: "error",
    },
  });

  sink({
    category: ["test"],
    level: "trace",
    message: ["trace message"],
    properties: {},
    rawMessage: "trace message",
    timestamp: Date.now(),
  });

  sink({
    category: ["test"],
    level: "fatal",
    message: ["fatal message"],
    properties: {},
    rawMessage: "fatal message",
    timestamp: Date.now(),
  });

  assert.strictEqual(mockLogger.logs.length, 2);
  assert.strictEqual(mockLogger.logs[0].level, "debug");
  assert.strictEqual(mockLogger.logs[1].level, "error");
});

test("getLog4jsSink(): category mapper with dynamic logger creation", () => {
  const loggers = new Map<string, MockLogger>();
  const mockLog4js = {
    getLogger(category?: string) {
      const key = category || "default";
      if (!loggers.has(key)) {
        loggers.set(key, createMockLogger());
      }
      return loggers.get(key)!;
    },
  };

  // deno-lint-ignore no-explicit-any
  const sink = getLog4jsSink(mockLog4js as any, undefined, {
    categoryMapper: (cat) => cat.join("::"),
  });

  sink({
    category: ["app", "database"],
    level: "info",
    message: ["Database query"],
    properties: {},
    rawMessage: "Database query",
    timestamp: Date.now(),
  });

  sink({
    category: ["app", "server"],
    level: "info",
    message: ["Server started"],
    properties: {},
    rawMessage: "Server started",
    timestamp: Date.now(),
  });

  // Should create two separate loggers
  assert.ok(loggers.has("app::database"));
  assert.ok(loggers.has("app::server"));
  assert.strictEqual(loggers.get("app::database")!.logs.length, 1);
  assert.strictEqual(loggers.get("app::server")!.logs.length, 1);
});

test("getLog4jsSink(): contextStrategy - mdc with preserve (default)", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger, {
    contextStrategy: "mdc",
    contextPreservation: "preserve",
  });

  // Add some existing context
  mockLogger.addContext("existing", "value");

  sink({
    category: ["test"],
    level: "info",
    message: ["Test message"],
    properties: { user: "alice", requestId: "123" },
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  // During log call, context should have had both existing and new properties
  assert.strictEqual(mockLogger.logs.length, 1);
  assert.deepStrictEqual(mockLogger.logs[0].context, {
    existing: "value",
    user: "alice",
    requestId: "123",
  });

  // After logging, LogTape properties should be removed (preserve strategy)
  // but existing context should remain
  assert.deepStrictEqual(mockLogger._context, { existing: "value" });
});

test("getLog4jsSink(): contextStrategy - mdc with merge", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger, {
    contextStrategy: "mdc",
    contextPreservation: "merge",
  });

  // Add some existing context
  mockLogger.addContext("existing", "value");

  sink({
    category: ["test"],
    level: "info",
    message: ["Test message"],
    properties: { user: "alice" },
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  // With merge strategy, properties are left in context
  assert.deepStrictEqual(mockLogger._context, {
    existing: "value",
    user: "alice",
  });
});

test("getLog4jsSink(): contextStrategy - mdc with replace", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger, {
    contextStrategy: "mdc",
    contextPreservation: "replace",
  });

  // Add some existing context
  mockLogger.addContext("existing", "value");

  sink({
    category: ["test"],
    level: "info",
    message: ["Test message"],
    properties: { user: "alice" },
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  // With replace strategy, existing context is cleared
  // and only new properties remain
  assert.deepStrictEqual(mockLogger._context, { user: "alice" });
});

test("getLog4jsSink(): contextStrategy - args", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger, {
    contextStrategy: "args",
  });

  sink({
    category: ["test"],
    level: "info",
    message: ["Test message"],
    properties: { user: "alice", requestId: "123" },
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  // With args strategy, properties should be passed as arguments
  assert.strictEqual(mockLogger.logs.length, 1);
  assert.strictEqual(mockLogger.logs[0].args.length, 1);
  assert.deepStrictEqual(mockLogger.logs[0].args[0], {
    user: "alice",
    requestId: "123",
  });
  // Context should be empty
  assert.deepStrictEqual(mockLogger.logs[0].context, {});
});

test("getLog4jsSink(): custom value formatter", () => {
  const mockLogger = createMockLogger();
  const sink = getLog4jsSink(undefined, mockLogger, {
    valueFormatter: (value) => `[${JSON.stringify(value)}]`,
  });

  sink({
    category: ["test"],
    level: "info",
    message: ["Value: ", { foo: "bar" }, ""],
    properties: {},
    rawMessage: "Value: {value}",
    timestamp: Date.now(),
  });

  assert.strictEqual(mockLogger.logs.length, 1);
  assert.ok(mockLogger.logs[0].message.includes('[{"foo":"bar"}]'));
});

test("getLog4jsSink(): empty category", () => {
  const loggers = new Map<string, MockLogger>();
  const mockLog4js = {
    getLogger(category?: string) {
      const key = category || "default";
      if (!loggers.has(key)) {
        loggers.set(key, createMockLogger());
      }
      return loggers.get(key)!;
    },
  };

  // deno-lint-ignore no-explicit-any
  const sink = getLog4jsSink(mockLog4js as any);

  sink({
    category: [],
    level: "info",
    message: ["Test message"],
    properties: {},
    rawMessage: "Test message",
    timestamp: Date.now(),
  });

  // Should use default logger
  assert.ok(loggers.has("default"));
  assert.strictEqual(loggers.get("default")!.logs.length, 1);
});

test("getLog4jsSink(): logger caching", () => {
  const loggers = new Map<string, MockLogger>();
  let getLoggerCallCount = 0;

  const mockLog4js = {
    getLogger(category?: string) {
      getLoggerCallCount++;
      const key = category || "default";
      if (!loggers.has(key)) {
        loggers.set(key, createMockLogger());
      }
      return loggers.get(key)!;
    },
  };

  // deno-lint-ignore no-explicit-any
  const sink = getLog4jsSink(mockLog4js as any);

  // Log to the same category multiple times
  for (let i = 0; i < 5; i++) {
    sink({
      category: ["app", "test"],
      level: "info",
      message: [`Message ${i}`],
      properties: {},
      rawMessage: `Message ${i}`,
      timestamp: Date.now(),
    });
  }

  // getLogger should only be called once for the same category
  assert.strictEqual(getLoggerCallCount, 1);
  assert.strictEqual(loggers.get("app.test")!.logs.length, 5);
});

// Note: install() tests are omitted because they would call LogTape's configure()
// which throws an error when called multiple times. The install() function is
// simple wrapper around getLog4jsSink() and configure(), both of which are
// thoroughly tested separately. Integration of install() is tested in the
// install.ts module itself.

// Integration tests with real log4js
// These tests use actual log4js functionality to verify the adapter works correctly

interface CapturedLog {
  categoryName: string;
  level: { levelStr: string };
  data: unknown[];
  context: Record<string, unknown>;
}

function createCapturingAppender(buffer: CapturedLog[]) {
  return {
    configure: () =>
    (loggingEvent: {
      categoryName: string;
      level: { levelStr: string };
      data: unknown[];
      context: Record<string, unknown>;
    }) => {
      buffer.push({
        categoryName: loggingEvent.categoryName,
        level: loggingEvent.level,
        data: loggingEvent.data,
        context: loggingEvent.context,
      });
    },
  };
}

test("integration: real log4js basic logging", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js);

  sink({
    category: ["app", "database"],
    level: "info",
    message: ["Database query executed"],
    properties: {},
    rawMessage: "Database query executed",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  assert.strictEqual(buffer[0].categoryName, "app.database");
  assert.strictEqual(buffer[0].level.levelStr, "INFO");
  assert.strictEqual(buffer[0].data[0], "Database query executed");

  log4js.shutdown(() => {});
});

test("integration: all log levels", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js);

  const levels = [
    { logtape: "trace", log4js: "TRACE" },
    { logtape: "debug", log4js: "DEBUG" },
    { logtape: "info", log4js: "INFO" },
    { logtape: "warning", log4js: "WARN" },
    { logtape: "error", log4js: "ERROR" },
    { logtape: "fatal", log4js: "FATAL" },
  ] as const;

  for (const { logtape } of levels) {
    sink({
      category: ["test"],
      level: logtape,
      message: [`${logtape} message`],
      properties: {},
      rawMessage: `${logtape} message`,
      timestamp: Date.now(),
    });
  }

  assert.strictEqual(buffer.length, 6);
  for (let i = 0; i < levels.length; i++) {
    assert.strictEqual(
      buffer[i].level.levelStr,
      levels[i].log4js,
      `Level ${levels[i].logtape} should map to ${levels[i].log4js}`,
    );
  }

  log4js.shutdown(() => {});
});

test("integration: category-based loggers", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js);

  sink({
    category: ["app", "auth"],
    level: "info",
    message: ["User logged in"],
    properties: {},
    rawMessage: "User logged in",
    timestamp: Date.now(),
  });

  sink({
    category: ["app", "database"],
    level: "debug",
    message: ["Query executed"],
    properties: {},
    rawMessage: "Query executed",
    timestamp: Date.now(),
  });

  sink({
    category: ["system", "monitor"],
    level: "warning",
    message: ["High CPU usage"],
    properties: {},
    rawMessage: "High CPU usage",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 3);
  assert.strictEqual(buffer[0].categoryName, "app.auth");
  assert.strictEqual(buffer[1].categoryName, "app.database");
  assert.strictEqual(buffer[2].categoryName, "system.monitor");

  log4js.shutdown(() => {});
});

test("integration: custom category mapper", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js, undefined, {
    categoryMapper: (cat) => cat.join("::"),
  });

  sink({
    category: ["app", "service", "api"],
    level: "info",
    message: ["API call"],
    properties: {},
    rawMessage: "API call",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  assert.strictEqual(buffer[0].categoryName, "app::service::api");

  log4js.shutdown(() => {});
});

test("integration: MDC context with preserve strategy", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js, undefined, {
    contextStrategy: "mdc",
    contextPreservation: "preserve",
  });

  sink({
    category: ["test"],
    level: "info",
    message: ["Test with context"],
    properties: { userId: "user123", requestId: "req456" },
    rawMessage: "Test with context",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  // Context should have the properties from this log
  assert.deepStrictEqual(buffer[0].context, {
    userId: "user123",
    requestId: "req456",
  });

  // After logging, LogTape properties should be removed (preserve strategy)
  // Next log should only have its own properties
  sink({
    category: ["test"],
    level: "info",
    message: ["Second log"],
    properties: { newProp: "newValue" },
    rawMessage: "Second log",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[1].context, {
    newProp: "newValue",
  });

  log4js.shutdown(() => {});
});

test("integration: MDC context with merge strategy", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js, undefined, {
    contextStrategy: "mdc",
    contextPreservation: "merge",
  });

  sink({
    category: ["test"],
    level: "info",
    message: ["First log"],
    properties: { prop1: "a" },
    rawMessage: "First log",
    timestamp: Date.now(),
  });

  // With merge strategy, properties accumulate
  sink({
    category: ["test"],
    level: "info",
    message: ["Second log"],
    properties: { prop2: "b" },
    rawMessage: "Second log",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[0].context, {
    prop1: "a",
  });
  assert.deepStrictEqual(buffer[1].context, {
    prop1: "a",
    prop2: "b",
  });

  const logger = log4js.getLogger("test");
  logger.clearContext();
  log4js.shutdown(() => {});
});

test("integration: MDC context with replace strategy", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js, undefined, {
    contextStrategy: "mdc",
    contextPreservation: "replace",
  });

  const logger = log4js.getLogger("test");
  logger.addContext("existing", "value1");

  sink({
    category: ["test"],
    level: "info",
    message: ["First log"],
    properties: { prop1: "a", prop2: "b" },
    rawMessage: "First log",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  // With replace strategy, existing context is cleared
  assert.deepStrictEqual(buffer[0].context, {
    prop1: "a",
    prop2: "b",
  });

  // Second log should only have its own properties (no prop1/prop2)
  sink({
    category: ["test"],
    level: "info",
    message: ["Second log"],
    properties: { prop3: "c" },
    rawMessage: "Second log",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 2);
  assert.deepStrictEqual(buffer[1].context, {
    prop3: "c",
  });

  logger.clearContext();
  log4js.shutdown(() => {});
});

test("integration: args context strategy", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js, undefined, {
    contextStrategy: "args",
  });

  sink({
    category: ["test"],
    level: "info",
    message: ["User action"],
    properties: { userId: "user123", action: "login" },
    rawMessage: "User action",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  assert.strictEqual(buffer[0].data.length, 2);
  assert.strictEqual(buffer[0].data[0], "User action");
  assert.deepStrictEqual(buffer[0].data[1], {
    userId: "user123",
    action: "login",
  });

  log4js.shutdown(() => {});
});

test("integration: message with interpolated values", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js);

  sink({
    category: ["app"],
    level: "info",
    message: ["User ", { id: 123, name: "Alice" }, " logged in"],
    properties: { timestamp: "2024-01-01" },
    rawMessage: "User {user} logged in",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  const logMessage = buffer[0].data[0] as string;
  assert.ok(logMessage.includes("User"));
  assert.ok(logMessage.includes("logged in"));
  assert.ok(logMessage.includes("123") || logMessage.includes("Alice"));

  log4js.shutdown(() => {});
});

test("integration: custom value formatter", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js, undefined, {
    valueFormatter: (value) => `<${JSON.stringify(value)}>`,
  });

  sink({
    category: ["test"],
    level: "info",
    message: ["Data: ", { x: 1, y: 2 }, ""],
    properties: {},
    rawMessage: "Data: {data}",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  const logMessage = buffer[0].data[0] as string;
  assert.ok(logMessage.includes('<{"x":1,"y":2}>'));

  log4js.shutdown(() => {});
});

test("integration: empty category uses default logger", () => {
  const buffer: CapturedLog[] = [];

  log4js.configure({
    appenders: {
      memory: { type: createCapturingAppender(buffer) },
    },
    categories: {
      default: { appenders: ["memory"], level: "trace" },
    },
  });

  const sink = getLog4jsSink(log4js);

  sink({
    category: [],
    level: "info",
    message: ["Message without category"],
    properties: {},
    rawMessage: "Message without category",
    timestamp: Date.now(),
  });

  assert.strictEqual(buffer.length, 1);
  assert.strictEqual(buffer[0].categoryName, "default");
  assert.strictEqual(buffer[0].data[0], "Message without category");

  log4js.shutdown(() => {});
});
