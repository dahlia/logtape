import { suite } from "@alinea/suite";
import type { LogRecord, Sink } from "@logtape/logtape";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertExists } from "@std/assert/exists";
import { assertFalse } from "@std/assert/false";
import {
  type FieldPatterns,
  redactByField,
  redactProperties,
  shouldFieldRedacted,
} from "./field.ts";

const test = suite(import.meta);

test("shouldFieldRedacted()", () => {
  { // matches string pattern
    const fieldPatterns: FieldPatterns = ["password", "secret"];
    assertEquals(shouldFieldRedacted("password", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("secret", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("username", fieldPatterns), false);
  }

  { // matches regex pattern
    const fieldPatterns: FieldPatterns = [/pass/i, /secret/i];
    assertEquals(shouldFieldRedacted("password", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("secretKey", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("myPassword", fieldPatterns), true);
    assertEquals(shouldFieldRedacted("username", fieldPatterns), false);
  }

  { // case sensitivity in regex
    const caseSensitivePatterns: FieldPatterns = [/pass/, /secret/];
    const caseInsensitivePatterns: FieldPatterns = [/pass/i, /secret/i];

    assertEquals(shouldFieldRedacted("Password", caseSensitivePatterns), false);
    assertEquals(
      shouldFieldRedacted("Password", caseInsensitivePatterns),
      true,
    );
  }
});

test("redactProperties()", () => {
  { // delete action (default)
    const properties = {
      username: "user123",
      password: "secret123",
      email: "user@example.com",
      message: "Hello world",
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password", "email"],
    });

    assert("username" in result);
    assertFalse("password" in result);
    assertFalse("email" in result);
    assert("message" in result);

    const nestedObject = {
      ...properties,
      nested: {
        foo: "bar",
        baz: "qux",
        passphrase: "asdf",
      },
    };
    const result2 = redactProperties(nestedObject, {
      fieldPatterns: ["password", "email", "passphrase"],
    });

    assert("username" in result2);
    assertFalse("password" in result2);
    assertFalse("email" in result2);
    assert("message" in result2);
    assert("nested" in result2);
    assert(typeof result2.nested === "object");
    assertExists(result2.nested);
    assert("foo" in result2.nested);
    assert("baz" in result2.nested);
    assertFalse("passphrase" in result2.nested);
  }

  { // custom action function
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
  }

  { // preserves other properties
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
    assertFalse("sensitive" in result);
  }

  { // redacts fields in objects within arrays
    const properties = {
      configs: [
        { password: "secret", username: "user1" },
        { token: "abc", email: "user2@example.com" },
      ],
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password", "token"],
    });

    // deno-lint-ignore no-explicit-any
    const configs = result.configs as any;
    assertEquals(configs.length, 2);
    assertEquals(configs[0], { username: "user1" });
    assertEquals(configs[1], { email: "user2@example.com" });
  }

  { // preserves non-object items in arrays
    const properties = {
      data: [
        { password: "secret" },
        "plain string",
        42,
        { token: "abc" },
      ],
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password", "token"],
    });

    // deno-lint-ignore no-explicit-any
    const data = result.data as any;
    assertEquals(data.length, 4);
    assertEquals(data[0], {});
    assertEquals(data[1], "plain string");
    assertEquals(data[2], 42);
    assertEquals(data[3], {});
  }

  { // redacts nested arrays within objects in arrays
    const properties = {
      items: [
        {
          config: {
            password: "secret",
            nestedArray: [
              { token: "abc", value: 1 },
              { key: "xyz", value: 2 },
            ],
          },
        },
      ],
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password", "token", "key"],
    });

    // deno-lint-ignore no-explicit-any
    const items = result.items as any;
    // deno-lint-ignore no-explicit-any
    const first = items[0] as any;
    // deno-lint-ignore no-explicit-any
    const nestedArray = first.config.nestedArray as any;
    assertEquals(items.length, 1);
    assertEquals(first.config.password, undefined);
    assertEquals(nestedArray.length, 2);
    assertEquals(nestedArray[0], { value: 1 });
    assertEquals(nestedArray[1], { value: 2 });
  }

  { // uses custom action in arrays
    const properties = {
      users: [
        { password: "secret1", name: "user1" },
        { password: "secret2", name: "user2" },
      ],
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    // deno-lint-ignore no-explicit-any
    const users = result.users as any;
    assertEquals(users.length, 2);
    assertEquals(users[0], {
      password: "[REDACTED]",
      name: "user1",
    });
    assertEquals(users[1], {
      password: "[REDACTED]",
      name: "user2",
    });
  }
});

test("redactByField()", async () => {
  { // wraps sink and redacts properties
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
    assert("username" in records[0].properties);
    assertFalse("password" in records[0].properties);
    assertFalse("token" in records[0].properties);
  }

  { // uses default field patterns when not specified
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
    assert("username" in records[0].properties);
    assertFalse("password" in records[0].properties);
    assertFalse("email" in records[0].properties);
    assertFalse("apiKey" in records[0].properties);
  }

  { // preserves Disposable behavior
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

    assert(Symbol.dispose in wrappedSink);
    wrappedSink[Symbol.dispose]();
    assert(disposed);
  }

  { // preserves AsyncDisposable behavior
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

    assert(Symbol.asyncDispose in wrappedSink);
    await wrappedSink[Symbol.asyncDispose]();
    assert(disposed);
  }

  { // redacts fields in arrays from issue #94
    const records: LogRecord[] = [];
    const originalSink: Sink = (record) => records.push(record);

    const wrappedSink = redactByField(originalSink, {
      fieldPatterns: ["password"],
    });

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Loaded config"],
      rawMessage: "Loaded config",
      timestamp: Date.now(),
      properties: {
        configs: [{ password: "secret", username: "user" }],
      },
    };

    wrappedSink(record);

    assertEquals(records.length, 1);
    // deno-lint-ignore no-explicit-any
    const configs = records[0].properties.configs as any;
    assertEquals(configs[0], { username: "user" });
  }
});
