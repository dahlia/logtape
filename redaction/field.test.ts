import type { LogRecord, Sink } from "@logtape/logtape";
import { assertEquals } from "@std/assert/assert-equals";
import {
  type FieldPatterns,
  redactByField,
  redactProperties,
  shouldFieldRedacted,
} from "./field.ts";

Deno.test("shouldFieldRedacted()", async (t) => {
  await t.step("matches string pattern", () => {
    const fieldPatterns: FieldPatterns = ["password", "secret"];
    assertEquals(shouldFieldRedacted("password", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("secret", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("username", fieldPatterns), false);
  });

  await t.step("matches regex pattern", () => {
    const fieldPatterns: FieldPatterns = [/pass/i, /secret/i];
    assertEquals(shouldFieldRedacted("password", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("secretKey", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("myPassword", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("username", fieldPatterns), false);
  });

  await t.step("case sensitivity in regex", () => {
    const caseSensitivePatterns: FieldPatterns = [/pass/, /secret/];
    const caseInsensitivePatterns: FieldPatterns = [/pass/i, /secret/i];

    assertEquals(shouldFieldRedacted("Password", caseSensitivePatterns), false);
    assertEquals(
      shouldFieldRedacted("Password", caseInsensitivePatterns),
      true,
    );
  });
});
Deno.test("redactProperties()", async (t) => {
  await t.step("delete action (default)", () => {
    const properties = {
      username: "user123",
      password: "secret123",
      email: "user@example.com",
      message: "Hello world",
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password", "email"],
    });

    assertEquals("username" in result, true);
    assertEquals("password" in result, false);
    assertEquals("email" in result, false);
    assertEquals("message" in result, true);
  });

  await t.step("custom action function", () => {
    const properties = {
      username: "user123",
      password: "secret123",
      token: "abc123",
      message: "Hello world",
    };

    const result = redactProperties(properties, {
      fieldPatterns: [/password/i, /token/i],
      action: () => "REDACTED",
    });

    assertEquals(result.username, "user123");
    assertEquals(result.password, "REDACTED");
    assertEquals(result.token, "REDACTED");
    assertEquals(result.message, "Hello world");
  });

  await t.step("preserves other properties", () => {
    const properties = {
      username: "user123",
      data: { nested: "value" },
      sensitive: "hidden",
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["sensitive"],
    });

    assertEquals(result.username, "user123");
    assertEquals(result.data, { nested: "value" });
    assertEquals("sensitive" in result, false);
  });
});

Deno.test("redactByField()", async (t) => {
  await t.step("wraps sink and redacts properties", () => {
    const records: LogRecord[] = [];
    const originalSink: Sink = (record) => records.push(record);

    const wrappedSink = redactByField(originalSink, {
      fieldPatterns: ["password", "token"],
    });

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Test message"],
      rawMessage: "Test message",
      timestamp: Date.now(),
      properties: {
        username: "user123",
        password: "secret123",
        token: "abc123",
      },
    };

    wrappedSink(record);

    assertEquals(records.length, 1);
    assertEquals("username" in records[0].properties, true);
    assertEquals("password" in records[0].properties, false);
    assertEquals("token" in records[0].properties, false);
  });

  await t.step("uses default field patterns when not specified", () => {
    const records: LogRecord[] = [];
    const originalSink: Sink = (record) => records.push(record);

    const wrappedSink = redactByField(originalSink);

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Test message"],
      rawMessage: "Test message",
      timestamp: Date.now(),
      properties: {
        username: "user123",
        password: "secret123",
        email: "user@example.com",
        apiKey: "xyz789",
      },
    };

    wrappedSink(record);

    assertEquals(records.length, 1);
    assertEquals("username" in records[0].properties, true);
    assertEquals("password" in records[0].properties, false);
    assertEquals("email" in records[0].properties, false);
    assertEquals("apiKey" in records[0].properties, false);
  });

  await t.step("preserves Disposable behavior", () => {
    let disposed = false;
    const originalSink: Sink & Disposable = Object.assign(
      (_record: LogRecord) => {},
      {
        [Symbol.dispose]: () => {
          disposed = true;
        },
      },
    );

    const wrappedSink = redactByField(originalSink) as Sink & Disposable;

    assertEquals(Symbol.dispose in wrappedSink, true);
    wrappedSink[Symbol.dispose]();
    assertEquals(disposed, true);
  });

  await t.step("preserves AsyncDisposable behavior", async () => {
    let disposed = false;
    const originalSink: Sink & AsyncDisposable = Object.assign(
      (_record: LogRecord) => {},
      {
        [Symbol.asyncDispose]: () => {
          disposed = true;
          return Promise.resolve();
        },
      },
    );

    const wrappedSink = redactByField(originalSink) as Sink & AsyncDisposable;

    assertEquals(Symbol.asyncDispose in wrappedSink, true);
    await wrappedSink[Symbol.asyncDispose]();
    assertEquals(disposed, true);
  });
});
