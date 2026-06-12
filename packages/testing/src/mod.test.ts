import {
  configure,
  getLogger,
  lazy,
  type LogRecord,
  reset,
  type Sink,
} from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createLogRecorder,
  type LogRecordMatch,
  type PropertyMatcher,
} from "./mod.ts";

test("createLogRecorder() stores records in order", () => {
  const recorder = createLogRecorder();
  const first = logRecord({
    level: "info",
    message: ["first"],
    rawMessage: "first",
  });
  const second = logRecord({
    level: "warning",
    message: ["second"],
    rawMessage: "second",
  });

  recorder.sink(first);
  recorder.sink(second);

  assert.deepStrictEqual(recorder.records, [first, second]);
});

test("LogRecorder.clear()", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({ message: ["before clear"] }));

  recorder.clear();

  assert.deepStrictEqual(recorder.records, []);
});

test("LogRecorder.take()", () => {
  const recorder = createLogRecorder();
  const first = logRecord({ message: ["first"] });
  const second = logRecord({ message: ["second"] });
  recorder.sink(first);
  recorder.sink(second);

  const records = recorder.take();

  assert.deepStrictEqual(records, [first, second]);
  assert.deepStrictEqual(recorder.records, []);
});

test("LogRecorder.find() and LogRecorder.filter()", () => {
  const recorder = createLogRecorder();
  const authRecord = logRecord({
    category: ["app", "auth"],
    level: "warning",
    message: ["User ", "u-123", " failed login."],
    rawMessage: "User {userId} failed login.",
    properties: { reason: "password-expired", userId: "u-123" },
  });
  const dbRecord = logRecord({
    category: ["app", "db"],
    level: "error",
    message: ["Query failed."],
    rawMessage: "Query failed.",
    properties: { durationMs: 1200 },
  });
  recorder.sink(authRecord);
  recorder.sink(dbRecord);

  assert.strictEqual(
    recorder.find({
      category: ["app", "auth"],
      level: "warning",
      message: "User u-123 failed login.",
      rawMessage: /userId/,
      properties: { userId: "u-123" },
    }),
    authRecord,
  );
  assert.strictEqual(recorder.find({ category: "app.auth" }), authRecord);
  assert.deepStrictEqual(recorder.filter({ categoryPrefix: ["app"] }), [
    authRecord,
    dbRecord,
  ]);
  assert.deepStrictEqual(recorder.filter({ category: /^app\.d/ }), [dbRecord]);
});

test("LogRecorder supports predicate matchers", () => {
  const recorder = createLogRecorder();
  const record = logRecord({
    level: "info",
    message: ["User ", "u-123", " logged in."],
    rawMessage: "User {userId} logged in.",
    properties: { userId: "u-123", sessionId: "s-456" },
  });
  const properties: PropertyMatcher = (props) =>
    props.userId === "u-123" && typeof props.sessionId === "string";
  const match: LogRecordMatch = {
    message: (candidate) => candidate.rawMessage === "User {userId} logged in.",
    properties,
    predicate: (candidate) => candidate.timestamp === record.timestamp,
  };
  recorder.sink(record);

  assert.strictEqual(recorder.find(match), record);
});

test("LogRecorder.assertLogged()", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({
    category: ["app", "auth"],
    level: "warning",
    message: ["User ", "u-123", " failed login."],
    rawMessage: "User {userId} failed login.",
    properties: { userId: "u-123" },
  }));

  recorder.assertLogged({ level: "warning", properties: { userId: "u-123" } });

  assert.throws(
    () => recorder.assertLogged({ category: ["app", "db"], level: "error" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected a LogTape record matching:/);
      assert.match(error.message, /level: "error"/);
      assert.match(error.message, /category: \["app", "db"\]/);
      assert.match(error.message, /Recorded 1 record:/);
      assert.match(
        error.message,
        /\[warning\] app\.auth: User u-123 failed login\./,
      );
      return true;
    },
  );
});

test("LogRecorder.assertNotLogged()", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({
    category: ["app", "auth"],
    level: "warning",
    message: ["User ", "u-123", " failed login."],
    rawMessage: "User {userId} failed login.",
    properties: { userId: "u-123" },
  }));

  recorder.assertNotLogged({ level: "error" });

  assert.throws(
    () => recorder.assertNotLogged({ level: "warning" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected no LogTape record matching:/);
      assert.match(error.message, /Found 1 matching record:/);
      assert.match(
        error.message,
        /\[warning\] app\.auth: User u-123 failed login\./,
      );
      return true;
    },
  );
});

test("LogRecorder works with configure()", async () => {
  const recorder = createLogRecorder();
  try {
    await configure({
      sinks: { recorder: recorder.sink },
      loggers: [
        { category: ["logtape", "meta"], sinks: [] },
        {
          category: ["my-lib"],
          lowestLevel: "debug",
          sinks: ["recorder"],
        },
      ],
    });

    const logger = getLogger(["my-lib"]);
    logger.info("User {userId} logged in.", { userId: "u-123" });
    logger.info`Tagged ${"value"} record.`;

    recorder.assertLogged({
      category: ["my-lib"],
      level: "info",
      message: "User u-123 logged in.",
      properties: { userId: "u-123" },
    });
    recorder.assertLogged({
      category: ["my-lib"],
      message: "Tagged value record.",
      rawMessage: /Tagged/,
    });
  } finally {
    await reset();
  }
});

test("LogRecorder observes resolved lazy and redacted properties", async () => {
  const recorder = createLogRecorder();
  const sink = redactByField(recorder.sink, {
    action: () => "[redacted]",
    fieldPatterns: ["password"],
  }) as Sink;
  try {
    await configure({
      sinks: { recorder: sink },
      loggers: [
        { category: ["logtape", "meta"], sinks: [] },
        {
          category: ["security"],
          lowestLevel: "debug",
          sinks: ["recorder"],
        },
      ],
    });

    let currentUser = "nobody";
    const logger = getLogger(["security"]).with({
      userId: lazy(() => currentUser),
    });
    currentUser = "alice";
    logger.warning("Login failed for {userId} with {password}.", {
      password: "secret",
    });

    recorder.assertLogged({
      message: "Login failed for alice with [redacted].",
      properties: { password: "[redacted]", userId: "alice" },
    });
    recorder.assertNotLogged({
      properties: (props) => props.password === "secret",
    });
  } finally {
    await reset();
  }
});

// Helpers

function logRecord(record: Partial<LogRecord> = {}): LogRecord {
  return {
    category: ["app"],
    level: "info",
    message: ["message"],
    properties: {},
    rawMessage: "message",
    timestamp: 1700000000000,
    ...record,
  };
}
