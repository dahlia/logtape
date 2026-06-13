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

test("LogRecorder.records returns snapshots", () => {
  const recorder = createLogRecorder();
  const record = logRecord({ message: ["snapshot"] });
  recorder.sink(record);

  const snapshot = recorder.records;
  (recorder.records as LogRecord[]).pop();

  assert.deepStrictEqual(recorder.records, [record]);

  recorder.clear();

  assert.deepStrictEqual(snapshot, [record]);
  assert.deepStrictEqual(recorder.records, []);
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

test("LogRecorder matches Date property values by time", () => {
  const recorder = createLogRecorder();
  const occurredAt = new Date("2026-06-09T00:00:00.000Z");
  const record = logRecord({
    properties: { occurredAt },
  });
  recorder.sink(record);

  assert.strictEqual(
    recorder.find({
      properties: {
        occurredAt: new Date("2026-06-09T00:00:00.000Z"),
      },
    }),
    record,
  );
  assert.strictEqual(
    recorder.find({
      properties: {
        occurredAt: new Date("2026-06-10T00:00:00.000Z"),
      },
    }),
    undefined,
  );
});

test("LogRecorder matches properties without Object.hasOwn", () => {
  const recorder = createLogRecorder();
  const record = logRecord({
    properties: { userId: "u-123" },
  });
  recorder.sink(record);
  const hasOwnDescriptor = Object.getOwnPropertyDescriptor(Object, "hasOwn");
  try {
    Object.defineProperty(Object, "hasOwn", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    assert.strictEqual(
      recorder.find({ properties: { userId: "u-123" } }),
      record,
    );
  } finally {
    if (hasOwnDescriptor == null) {
      delete (Object as { hasOwn?: typeof Object.hasOwn }).hasOwn;
    } else {
      Object.defineProperty(Object, "hasOwn", hasOwnDescriptor);
    }
  }
});

test("LogRecorder matches string property values with regular expressions", () => {
  const recorder = createLogRecorder();
  const record = logRecord({
    properties: { status: "completed", userId: "user-123" },
  });
  recorder.sink(record);

  const userPattern = /^user-\d+$/g;
  assert.strictEqual(userPattern.test("user-123"), true);
  assert.strictEqual(
    recorder.find({
      properties: { userId: userPattern },
    }),
    record,
  );
  assert.strictEqual(userPattern.lastIndex, "user-123".length);
  assert.strictEqual(
    recorder.find({
      properties: { status: /^failed$/ },
    }),
    undefined,
  );
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

test("LogRecorder diagnostics handle null-prototype circular values", () => {
  const recorder = createLogRecorder();
  const recordedValue = circularNullPrototypeObject();
  const matcherValue = circularNullPrototypeObject();
  recorder.sink(logRecord({
    message: ["circular diagnostic value"],
    properties: { recordedValue },
  }));

  assert.throws(
    () => recorder.assertLogged({ properties: { matcherValue } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected a LogTape record matching:/);
      assert.match(
        error.message,
        /properties\.matcherValue: {"self":"\[Circular\]"}/,
      );
      assert.match(error.message, /recordedValue: {"self":"\[Circular\]"}/);
      return true;
    },
  );
});

test("LogRecorder diagnostics render nested BigInt and circular values", () => {
  const recorder = createLogRecorder();
  const circularValue: Record<string, unknown> = { id: "payload" };
  circularValue.self = circularValue;
  recorder.sink(logRecord({
    message: ["nested diagnostic value"],
    properties: {
      payload: { attempts: 3n, pattern: /retry/g, self: circularValue },
      statusById: new Map<unknown, unknown>([
        ["job-1", { attempts: 2n }],
      ]),
      flags: new Set<unknown>([1n, /ready/i]),
    },
  }));

  assert.throws(
    () => recorder.assertLogged({ properties: { expected: { count: 1n } } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /properties\.expected: {"count":"1n"}/,
      );
      assert.match(
        error.message,
        /payload: {"attempts":"3n","pattern":"\/retry\/g","self":{"id":"payload","self":"\[Circular\]"}}/,
      );
      assert.match(
        error.message,
        /statusById: Map\(1\) {"job-1":{"attempts":"2n"}}/,
      );
      assert.match(error.message, /flags: Set\(2\) \["1n","\/ready\/i"\]/);
      assert.doesNotMatch(error.message, /payload: \[object Object\]/);
      assert.doesNotMatch(error.message, /statusById: Map\(1\)(?! )/);
      assert.doesNotMatch(error.message, /flags: Set\(2\)(?! )/);
      return true;
    },
  );
});

test("LogRecorder diagnostics preserve repeated non-circular references", () => {
  const recorder = createLogRecorder();
  const sharedValue = { id: "user-123" };
  recorder.sink(logRecord({
    message: ["shared reference diagnostics"],
    properties: {
      payload: {
        before: sharedValue,
        after: sharedValue,
      },
    },
  }));

  assert.throws(
    () => recorder.assertLogged({ properties: { missing: true } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /payload: {"before":{"id":"user-123"},"after":{"id":"user-123"}}/,
      );
      assert.doesNotMatch(error.message, /"after":"\[Circular\]"/);
      return true;
    },
  );
});

test("LogRecorder diagnostics render nested Error values", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({
    message: ["nested error diagnostic value"],
    properties: {
      payload: { error: new TypeError("Bad input") },
      failuresById: new Map<unknown, unknown>([
        ["job-1", new Error("Boom")],
      ]),
      failures: new Set<unknown>([new RangeError("Too high")]),
    },
  }));

  assert.throws(
    () => recorder.assertLogged({ properties: { missing: true } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /payload: {"error":"TypeError: Bad input"}/,
      );
      assert.match(
        error.message,
        /failuresById: Map\(1\) {"job-1":"Error: Boom"}/,
      );
      assert.match(
        error.message,
        /failures: Set\(1\) \["RangeError: Too high"\]/,
      );
      assert.doesNotMatch(error.message, /payload: {"error":{}}/);
      return true;
    },
  );
});

test("LogRecorder diagnostics handle throwing property getters", () => {
  const recorder = createLogRecorder();
  const properties: Record<string, unknown> = {};
  Object.defineProperty(properties, "unstable", {
    enumerable: true,
    get() {
      throw new Error("getter failed");
    },
  });
  recorder.sink(logRecord({
    message: ["throwing getter diagnostic value"],
    properties,
  }));

  assert.throws(
    () => recorder.assertLogged({ properties: { missing: true } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected a LogTape record matching:/);
      assert.match(error.message, /unstable: <error: getter failed>/);
      return true;
    },
  );
});

test("LogRecorder diagnostics render Map and Set values", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({
    message: ["collection diagnostics"],
    properties: {
      roles: new Set(["admin", "operator"]),
      tags: new Map<string, unknown>([
        ["environment", "production"],
        ["retries", 3],
      ]),
    },
  }));

  assert.throws(
    () =>
      recorder.assertLogged({
        properties: {
          expectedRoles: new Set(["admin"]),
          expectedTags: new Map([["environment", "staging"]]),
        },
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /properties\.expectedRoles: Set\(1\) \["admin"\]/,
      );
      assert.match(
        error.message,
        /properties\.expectedTags: Map\(1\) {"environment":"staging"}/,
      );
      assert.match(
        error.message,
        /roles: Set\(2\) \["admin","operator"\]/,
      );
      assert.match(
        error.message,
        /tags: Map\(2\) {"environment":"production","retries":3}/,
      );
      assert.doesNotMatch(error.message, /roles: {}/);
      assert.doesNotMatch(error.message, /tags: {}/);
      return true;
    },
  );
});

test("LogRecorder diagnostics preserve Map entries with object keys", () => {
  const recorder = createLogRecorder();
  const nullPrototypeKey = Object.create(null) as Record<string, unknown>;
  nullPrototypeKey.id = "primary";
  const firstObjectKey = { id: "first" };
  const secondObjectKey = { id: "second" };
  recorder.sink(logRecord({
    message: ["object key diagnostics"],
    properties: {
      distinctKeyMap: new Map<unknown, string>([
        [nullPrototypeKey, "visible"],
      ]),
      collidingKeyMap: new Map<unknown, string>([
        [firstObjectKey, "first"],
        [secondObjectKey, "second"],
      ]),
    },
  }));

  assert.throws(
    () => recorder.assertLogged({ properties: { missing: true } }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /distinctKeyMap: Map\(1\) {"\[object Object\]":"visible"}/,
      );
      assert.match(
        error.message,
        /collidingKeyMap: Map\(2\) \[\["\[object Object\]","first"\],\["\[object Object\]","second"\]\]/,
      );
      assert.doesNotMatch(error.message, /distinctKeyMap: Map\(1\)(?! )/);
      assert.doesNotMatch(
        error.message,
        /collidingKeyMap: Map\(2\) {"\[object Object\]":"second"}/,
      );
      return true;
    },
  );
});

test("LogRecorder diagnostics preserve non-finite numbers", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({
    message: ["non-finite numbers"],
    properties: { value: -Infinity },
  }));

  assert.throws(
    () =>
      recorder.assertLogged({
        properties: { actual: NaN, expected: Infinity },
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /properties\.actual: NaN/);
      assert.match(error.message, /properties\.expected: Infinity/);
      assert.match(error.message, /value: -Infinity/);
      assert.doesNotMatch(error.message, /properties\.actual: null/);
      assert.doesNotMatch(error.message, /properties\.expected: null/);
      assert.doesNotMatch(error.message, /value: null/);
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

test("LogRecorder message predicates do not render messages", () => {
  const recorder = createLogRecorder();
  const value = throwingInspectValue();
  const record = logRecord({
    message: ["Value ", value, "."],
    rawMessage: "Value {value}.",
  });
  recorder.sink(record);

  let seenRecord: LogRecord | undefined;
  assert.strictEqual(
    recorder.find({
      message: (candidate) => {
        seenRecord = candidate;
        return candidate.message[1] === value;
      },
    }),
    record,
  );
  assert.strictEqual(seenRecord, record);
});

test("LogRecorder diagnostics guard message rendering errors", () => {
  const recorder = createLogRecorder();
  recorder.sink(logRecord({
    message: ["Value ", throwingInspectValue(), "."],
    rawMessage: "Value {value}.",
  }));

  assert.throws(
    () => recorder.assertLogged({ level: "error" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Expected a LogTape record matching:/);
      assert.match(error.message, /level: "error"/);
      assert.match(error.message, /<error: inspect failed>/);
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

test("LogRecorder snapshots lazy callback messages in the sink", async () => {
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

    let userId = "alice";
    let evaluations = 0;
    getLogger(["my-lib"]).info((log) => {
      evaluations++;
      return log`User ${userId} logged in.`;
    });
    userId = "bob";

    assert.strictEqual(evaluations, 1);
    assert.deepStrictEqual(recorder.records[0]?.message, [
      "User ",
      "alice",
      " logged in.",
    ]);
    assert.strictEqual(
      renderRawMessage(recorder.records[0]?.rawMessage),
      "User  logged in.",
    );
  } finally {
    await reset();
  }
});

test("LogRecorder preserves extra fields when snapshotting lazy messages", () => {
  const recorder = createLogRecorder();
  const contextKey = Symbol("context");
  let userId = "alice";
  let traceId = "trace-123";
  let spanId = "span-123";
  const record = {
    ...logRecord({
      properties: { userId },
      rawMessage: "User {userId} logged in.",
    }),
    requestId: "req-123",
    get traceId(): string {
      return traceId;
    },
    get [contextKey](): { readonly spanId: string } {
      return { spanId };
    },
    get message(): readonly unknown[] {
      return ["User ", userId, " logged in."];
    },
  } as LogRecord & {
    readonly requestId: string;
    readonly traceId: string;
    readonly [contextKey]: { readonly spanId: string };
  };

  recorder.sink(record);
  userId = "bob";
  traceId = "trace-456";
  spanId = "span-456";

  const snapshot = recorder.records[0] as LogRecord & {
    readonly requestId?: string;
    readonly traceId?: string;
    readonly [contextKey]?: { readonly spanId: string };
  };
  assert.notStrictEqual(snapshot, record);
  assert.deepStrictEqual(snapshot.message, [
    "User ",
    "alice",
    " logged in.",
  ]);
  assert.strictEqual(snapshot.requestId, "req-123");
  assert.strictEqual(snapshot.traceId, "trace-123");
  assert.deepStrictEqual(snapshot[contextKey], { spanId: "span-123" });
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

function renderRawMessage(rawMessage: LogRecord["rawMessage"]): string {
  return typeof rawMessage === "string" ? rawMessage : rawMessage.join("");
}

function circularNullPrototypeObject(): Record<string, unknown> {
  const value = Object.create(null) as Record<string, unknown>;
  value.self = value;
  return value;
}

function throwingInspectValue(): unknown {
  return {
    [Symbol.for("Deno.customInspect")](): string {
      throw new Error("inspect failed");
    },
    [Symbol.for("nodejs.util.inspect.custom")](): string {
      throw new Error("inspect failed");
    },
  };
}
