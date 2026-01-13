import assert from "node:assert/strict";
import test from "node:test";
import type { LogRecord, Sink } from "@logtape/logtape";
import {
  type FieldPatterns,
  redactByField,
  redactProperties,
  shouldFieldRedacted,
} from "./field.ts";

test("shouldFieldRedacted()", () => {
  { // matches string pattern
    const fieldPatterns: FieldPatterns = ["password", "secret"];
    assert.strictEqual(shouldFieldRedacted("password", fieldPatterns), true);
    assert.strictEqual(shouldFieldRedacted("secret", fieldPatterns), true);
    assert.strictEqual(shouldFieldRedacted("username", fieldPatterns), false);
  }

  { // matches regex pattern
    const fieldPatterns: FieldPatterns = [/pass/i, /secret/i];
    assert.strictEqual(shouldFieldRedacted("password", fieldPatterns), true);
    assert.strictEqual(shouldFieldRedacted("secretKey", fieldPatterns), true);
    assert.strictEqual(shouldFieldRedacted("myPassword", fieldPatterns), true);
    assert.strictEqual(shouldFieldRedacted("username", fieldPatterns), false);
  }

  { // case sensitivity in regex
    const caseSensitivePatterns: FieldPatterns = [/pass/, /secret/];
    const caseInsensitivePatterns: FieldPatterns = [/pass/i, /secret/i];

    assert.strictEqual(
      shouldFieldRedacted("Password", caseSensitivePatterns),
      false,
    );
    assert.strictEqual(
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

    assert.ok("username" in result);
    assert.ok(!("password" in result));
    assert.ok(!("email" in result));
    assert.ok("message" in result);

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

    assert.ok("username" in result2);
    assert.ok(!("password" in result2));
    assert.ok(!("email" in result2));
    assert.ok("message" in result2);
    assert.ok("nested" in result2);
    assert.ok(typeof result2.nested === "object");
    assert.notStrictEqual(result2.nested, null);
    assert.ok("foo" in (result2.nested as Record<string, unknown>));
    assert.ok("baz" in (result2.nested as Record<string, unknown>));
    assert.ok(!("passphrase" in (result2.nested as Record<string, unknown>)));
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

    assert.strictEqual(result.username, "user123");
    assert.strictEqual(result.password, "REDACTED");
    assert.strictEqual(result.token, "REDACTED");
    assert.strictEqual(result.message, "Hello world");
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

    assert.strictEqual(result.username, "user123");
    assert.deepStrictEqual(result.data, { nested: "value" });
    assert.ok(!("sensitive" in result));
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
    assert.strictEqual(configs.length, 2);
    assert.deepStrictEqual(configs[0], { username: "user1" });
    assert.deepStrictEqual(configs[1], { email: "user2@example.com" });
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
    assert.strictEqual(data.length, 4);
    assert.deepStrictEqual(data[0], {});
    assert.strictEqual(data[1], "plain string");
    assert.strictEqual(data[2], 42);
    assert.deepStrictEqual(data[3], {});
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
    assert.strictEqual(items.length, 1);
    assert.strictEqual(first.config.password, undefined);
    assert.strictEqual(nestedArray.length, 2);
    assert.deepStrictEqual(nestedArray[0], { value: 1 });
    assert.deepStrictEqual(nestedArray[1], { value: 2 });
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
    assert.strictEqual(users.length, 2);
    assert.deepStrictEqual(users[0], {
      password: "[REDACTED]",
      name: "user1",
    });
    assert.deepStrictEqual(users[1], {
      password: "[REDACTED]",
      name: "user2",
    });
  }

  { // handles circular references to prevent stack overflow
    const obj: Record<string, unknown> = {
      a: 1,
      password: "some-password",
    };
    obj.self = obj; // Create circular reference

    const result = redactProperties(obj, {
      fieldPatterns: ["password"],
      action: () => "REDACTED",
    });

    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.password, "REDACTED");
    assert.ok(result.self === result, "Circular reference should be preserved");
  }

  { // redacts fields in class instances
    class User {
      constructor(public name: string, public password: string) {}
    }

    const properties = {
      user: new User("Alice", "alice-secret-password"),
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
      action: () => "REDACTED",
    });

    const redactedUser = result.user as User;
    assert.strictEqual(redactedUser.name, "Alice");
    assert.strictEqual(redactedUser.password, "REDACTED");
  }

  { // preserves Error objects without modification
    const err = new Error("test error");
    const properties = {
      err,
      data: { password: "secret" },
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    assert.ok(result.err instanceof Error);
    assert.strictEqual((result.err as Error).message, "test error");
    assert.ok(result.err === err, "Error should be the same instance");
    assert.strictEqual(
      (result.data as { password: string }).password,
      "[REDACTED]",
    );
  }

  { // preserves Date objects without modification
    const date = new Date("2024-01-01T00:00:00Z");
    const properties = {
      createdAt: date,
      password: "secret",
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    assert.ok(result.createdAt instanceof Date);
    assert.strictEqual(
      (result.createdAt as Date).toISOString(),
      date.toISOString(),
    );
    assert.ok(result.createdAt === date, "Date should be the same instance");
  }

  { // preserves RegExp objects without modification
    const regex = /test/gi;
    const properties = {
      pattern: regex,
      password: "secret",
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    assert.ok(result.pattern instanceof RegExp);
    assert.strictEqual((result.pattern as RegExp).source, "test");
    assert.ok(result.pattern === regex, "RegExp should be the same instance");
  }

  { // preserves built-in objects in arrays
    const err = new Error("array error");
    const date = new Date();
    const properties = {
      items: [err, date, { password: "secret" }],
    };

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    const items = result.items as unknown[];
    assert.ok(items[0] instanceof Error);
    assert.ok(items[0] === err, "Error in array should be same instance");
    assert.ok(items[1] instanceof Date);
    assert.ok(items[1] === date, "Date in array should be same instance");
    assert.strictEqual(
      (items[2] as { password: string }).password,
      "[REDACTED]",
    );
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

    assert.strictEqual(records.length, 1);
    assert.ok("username" in records[0].properties);
    assert.ok(!("password" in records[0].properties));
    assert.ok(!("token" in records[0].properties));
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

    assert.strictEqual(records.length, 1);
    assert.ok("username" in records[0].properties);
    assert.ok(!("password" in records[0].properties));
    assert.ok(!("email" in records[0].properties));
    assert.ok(!("apiKey" in records[0].properties));
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

    assert.ok(Symbol.dispose in wrappedSink);
    wrappedSink[Symbol.dispose]();
    assert.ok(disposed);
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

    assert.ok(Symbol.asyncDispose in wrappedSink);
    await wrappedSink[Symbol.asyncDispose]();
    assert.ok(disposed);
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

    assert.strictEqual(records.length, 1);
    // deno-lint-ignore no-explicit-any
    const configs = records[0].properties.configs as any;
    assert.deepStrictEqual(configs[0], { username: "user" });
  }

  { // redacts values in message array (string template)
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Password is ", "supersecret", ""],
      rawMessage: "Password is {password}",
      timestamp: Date.now(),
      properties: { password: "supersecret" },
    });

    assert.deepStrictEqual(records[0].message, [
      "Password is ",
      "[REDACTED]",
      "",
    ]);
    assert.strictEqual(records[0].properties.password, "[REDACTED]");
  }

  { // redacts multiple sensitive fields in message
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password", "email"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Login: ", "user@example.com", " with ", "secret123", ""],
      rawMessage: "Login: {email} with {password}",
      timestamp: Date.now(),
      properties: { email: "user@example.com", password: "secret123" },
    });

    assert.strictEqual(records[0].message[1], "[REDACTED]");
    assert.strictEqual(records[0].message[3], "[REDACTED]");
  }

  { // redacts nested property path in message
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["User password: ", "secret", ""],
      rawMessage: "User password: {user.password}",
      timestamp: Date.now(),
      properties: { user: { password: "secret" } },
    });

    assert.strictEqual(records[0].message[1], "[REDACTED]");
  }

  { // delete action uses empty string in message
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Password: ", "secret", ""],
      rawMessage: "Password: {password}",
      timestamp: Date.now(),
      properties: { password: "secret" },
    });

    assert.strictEqual(records[0].message[1], "");
    assert.ok(!("password" in records[0].properties));
  }

  { // non-sensitive field in message is not redacted
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Username: ", "johndoe", ""],
      rawMessage: "Username: {username}",
      timestamp: Date.now(),
      properties: { username: "johndoe" },
    });

    assert.strictEqual(records[0].message[1], "johndoe");
  }

  { // wildcard {*} in message uses redacted properties
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    const props = { username: "john", password: "secret" };
    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Props: ", props, ""],
      rawMessage: "Props: {*}",
      timestamp: Date.now(),
      properties: props,
    });

    // The {*} should be replaced with redacted properties
    assert.deepStrictEqual(records[0].message[1], {
      username: "john",
      password: "[REDACTED]",
    });
    assert.strictEqual(records[0].properties.password, "[REDACTED]");
  }

  { // escaped braces are not treated as placeholders
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Value: ", "secret", ""],
      rawMessage: "Value: {{password}} {password}",
      timestamp: Date.now(),
      properties: { password: "secret" },
    });

    // Only the second {password} is a placeholder
    assert.strictEqual(records[0].message[1], "[REDACTED]");
  }

  { // tagged template literal - redacts by comparing values
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    const rawMessage = ["Password: ", ""] as unknown as TemplateStringsArray;
    Object.defineProperty(rawMessage, "raw", { value: rawMessage });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Password: ", "secret", ""],
      rawMessage,
      timestamp: Date.now(),
      properties: { password: "secret" },
    });

    // Message should be redacted by value comparison
    assert.strictEqual(records[0].message[1], "[REDACTED]");
    assert.strictEqual(records[0].properties.password, "[REDACTED]");
  }

  { // array access path in message
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["First user password: ", "secret1", ""],
      rawMessage: "First user password: {users[0].password}",
      timestamp: Date.now(),
      properties: { users: [{ password: "secret1" }] },
    });

    assert.strictEqual(records[0].message[1], "[REDACTED]");
  }

  { // regex pattern matches in message placeholder
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: [/pass/i],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Passphrase: ", "mysecret", ""],
      rawMessage: "Passphrase: {passphrase}",
      timestamp: Date.now(),
      properties: { passphrase: "mysecret" },
    });

    assert.strictEqual(records[0].message[1], "[REDACTED]");
  }

  { // array containing objects with sensitive fields - wildcard {*}
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: [/email/i],
      action: () => "[REDACTED]",
    });

    const props = { args: [{ email: "example@example.com" }] };
    wrappedSink({
      level: "info",
      category: ["app"],
      message: ["", props, ""],
      rawMessage: "{*}",
      timestamp: Date.now(),
      properties: props,
    });

    const messageObj = records[0].message[1] as { args: { email: string }[] };
    assert.strictEqual(messageObj.args[0].email, "[REDACTED]");
    const propsObj = records[0].properties as { args: { email: string }[] };
    assert.strictEqual(propsObj.args[0].email, "[REDACTED]");
  }

  { // array containing objects with sensitive fields - named placeholder
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: [/email/i],
      action: () => "[REDACTED]",
    });

    const args = [{ email: "example@example.com" }];
    wrappedSink({
      level: "info",
      category: ["app"],
      message: ["Testing: ", args, ""],
      rawMessage: "Testing: {args}",
      timestamp: Date.now(),
      properties: { args },
    });

    const propsObj = records[0].properties as { args: { email: string }[] };
    assert.strictEqual(propsObj.args[0].email, "[REDACTED]");
  }

  { // nested arrays with objects
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Data"],
      rawMessage: "Data",
      timestamp: Date.now(),
      properties: {
        users: [
          { name: "Alice", password: "secret1" },
          { name: "Bob", password: "secret2" },
        ],
        nested: [[{ password: "deep" }]],
      },
    });

    const props = records[0].properties as {
      users: { name: string; password: string }[];
      nested: { password: string }[][];
    };
    assert.strictEqual(props.users[0].password, "[REDACTED]");
    assert.strictEqual(props.users[1].password, "[REDACTED]");
    assert.strictEqual(props.nested[0][0].password, "[REDACTED]");
    assert.strictEqual(props.users[0].name, "Alice");
    assert.strictEqual(props.users[1].name, "Bob");
  }

  { // named placeholder with array containing sensitive fields in message
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: [/email/i],
      action: () => "[REDACTED]",
    });

    // This is the case: logger.info('Testing: {args}', { args: [{ email: '...' }] })
    const args = [{ email: "example@example.com", name: "John" }];
    wrappedSink({
      level: "info",
      category: ["app"],
      message: ["Testing: ", args, ""],
      rawMessage: "Testing: {args}",
      timestamp: Date.now(),
      properties: { args },
    });

    // Both properties and message should have redacted values
    const propsArr = records[0].properties.args as { email: string }[];
    assert.strictEqual(propsArr[0].email, "[REDACTED]");

    // The message array should also use redacted values
    const messageArr = records[0].message[1] as {
      email: string;
      name: string;
    }[];
    assert.strictEqual(messageArr[0].email, "[REDACTED]");
    assert.strictEqual(messageArr[0].name, "John");
  }

  { // non-sensitive placeholder still uses redacted properties
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["secret"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Data: ", { public: "visible", secret: "hidden" }, ""],
      rawMessage: "Data: {data}",
      timestamp: Date.now(),
      properties: { data: { public: "visible", secret: "hidden" } },
    });

    // The message should use redacted properties even though {data} itself is not sensitive
    const messageObj = records[0].message[1] as {
      public: string;
      secret: string;
    };
    assert.strictEqual(messageObj.public, "visible");
    assert.strictEqual(messageObj.secret, "[REDACTED]");
  }
});
