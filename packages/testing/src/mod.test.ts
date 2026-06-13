import assert from "node:assert/strict";
import test from "node:test";

import {
  configure,
  getLogger,
  getTextFormatter,
  lazy,
  type LogRecord,
  reset,
  type Sink,
} from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";

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
  const rootRecord = logRecord({
    category: [],
    level: "info",
    message: ["Root record."],
    rawMessage: "Root record.",
  });
  recorder.sink(authRecord);
  recorder.sink(dbRecord);
  recorder.sink(rootRecord);

  assert.strictEqual(
    recorder.find({
      category: ["app", "auth"],
      level: "warning",
      message: renderMessageWithCoreFormatter(authRecord),
      rawMessage: /userId/,
      properties: { userId: "u-123" },
    }),
    authRecord,
  );
  assert.strictEqual(recorder.find({ category: "app.auth" }), authRecord);
  assert.strictEqual(recorder.find({ category: "" }), rootRecord);
  assert.deepStrictEqual(recorder.filter({ category: /^$/ }), [rootRecord]);
  assert.deepStrictEqual(recorder.filter({ categoryPrefix: ["app"] }), [
    authRecord,
    dbRecord,
  ]);
  assert.deepStrictEqual(recorder.filter({ categoryPrefix: "" }), [
    authRecord,
    dbRecord,
    rootRecord,
  ]);
  assert.deepStrictEqual(recorder.filter({ category: /^app\.d/ }), [dbRecord]);

  const categoryPattern = /app\.auth/g;
  assert.strictEqual(categoryPattern.test("app.auth"), true);
  assert.strictEqual(recorder.find({ category: categoryPattern }), authRecord);

  const stickyMessagePattern = /User/y;
  stickyMessagePattern.lastIndex = 1;
  assert.strictEqual(
    recorder.find({ message: stickyMessagePattern }),
    authRecord,
  );
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

test("LogRecorder handles nullish record properties", () => {
  const recorder = createLogRecorder();
  const record = {
    ...logRecord({ message: ["nullish properties"] }),
    properties: null,
  } as unknown as LogRecord;
  recorder.sink(record);

  assert.strictEqual(
    recorder.find({ properties: { userId: "u-123" } }),
    undefined,
  );
  assert.strictEqual(
    recorder.find({
      properties: (props) => Object.keys(props).length === 0,
    }),
    record,
  );
  assert.throws(
    () => recorder.assertLogged({ properties: { userId: "u-123" } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected a LogTape record matching:/);
      assert.match(error.message, /\[info\] app: nullish properties/);
      return true;
    },
  );
});

test("LogRecorder matches rendered object message values", () => {
  const recorder = createLogRecorder();
  const payload = { foo: "bar" };
  const values = ["one", "two"];
  const error = new TypeError("Bad input");
  const pattern = /failed login/i;
  const timestamp = new Date("2026-06-09T00:00:00.000Z");
  const record = logRecord({
    message: [
      "Payload ",
      payload,
      " values ",
      values,
      "; pattern ",
      pattern,
      " failed with ",
      error,
      " at ",
      timestamp,
      ".",
    ],
    rawMessage:
      "Payload {payload} values {values}; pattern {pattern} failed with {error} at {timestamp}.",
  });
  recorder.sink(record);

  recorder.assertLogged({
    message: renderMessageWithCoreFormatter(record),
  });
  assert.ok(
    !renderMessageWithCoreFormatter(record).includes(
      JSON.stringify(payload),
    ),
  );
});

test("LogRecorder diagnostics render messages like the core formatter", () => {
  const recorder = createLogRecorder();
  const record = logRecord({
    message: [
      "Payload ",
      { foo: "bar" },
      ".",
    ],
    rawMessage: "Payload {payload}.",
  });
  recorder.sink(record);

  assert.throws(
    () => recorder.assertLogged({ message: "missing" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        new RegExp(escapeRegExp(renderMessageWithCoreFormatter(record))),
      );
      return true;
    },
  );
});

test("LogRecorder matches rendered special object message values", () => {
  const recorder = createLogRecorder();
  const error = new TypeError("Bad input");
  const pattern = /failed login/i;
  const timestamp = new Date("2026-06-09T00:00:00.000Z");
  const record = logRecord({
    message: [
      "Pattern ",
      pattern,
      " failed with ",
      error,
      " at ",
      timestamp,
      ".",
    ],
    rawMessage: "Pattern {pattern} failed with {error} at {timestamp}.",
  });
  recorder.sink(record);

  recorder.assertLogged({
    message: renderMessageWithCoreFormatter(record),
  });
});

test("LogRecorder.assertLogged()", () => {
  const recorder = createLogRecorder();
  const authRecord = logRecord({
    category: ["app", "auth"],
    level: "warning",
    message: ["User ", "u-123", " failed login."],
    rawMessage: "User {userId} failed login.",
    properties: { userId: "u-123" },
  });
  recorder.sink(authRecord);

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
        new RegExp(escapeRegExp(
          `[warning] app.auth: ${renderMessageWithCoreFormatter(authRecord)}`,
        )),
      );
      return true;
    },
  );
});

test("LogRecorder.assertNotLogged()", () => {
  const recorder = createLogRecorder();
  const authRecord = logRecord({
    category: ["app", "auth"],
    level: "warning",
    message: ["User ", "u-123", " failed login."],
    rawMessage: "User {userId} failed login.",
    properties: { userId: "u-123" },
  });
  recorder.sink(authRecord);

  recorder.assertNotLogged({ level: "error" });

  assert.throws(
    () => recorder.assertNotLogged({ level: "warning" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected no LogTape record matching:/);
      assert.match(error.message, /Found 1 matching record:/);
      assert.match(
        error.message,
        new RegExp(escapeRegExp(
          `[warning] app.auth: ${renderMessageWithCoreFormatter(authRecord)}`,
        )),
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
      message: /^User .+ logged in\.$/,
      properties: { userId: "u-123" },
    });
    recorder.assertLogged({
      category: ["my-lib"],
      message: /^Tagged .+ record\.$/,
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
      message: /^Login failed for .+ with .+\.$/,
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

function renderMessageWithCoreFormatter(record: LogRecord): string {
  return getTextFormatter({
    format: ({ message }) => message,
    lineEnding: "lf",
    timestamp: "none",
  })(record).slice(0, -1);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
