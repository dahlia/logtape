import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import fc from "fast-check";
import { configure, type LogRecord, reset, type Sink } from "@logtape/logtape";
import {
  createHmacPseudonymizer,
  type FieldPatterns,
  redactByField,
  redactByFieldAsync,
  redactProperties,
  redactPropertiesAsync,
  shouldFieldRedacted,
} from "./field.ts";

const fieldNameArb: fc.Arbitrary<string> = fc.stringMatching(
  /^[A-Za-z0-9_]*$/,
).map((name) => `field${name}`);
const publicFieldNameArb: fc.Arbitrary<string> = fc.stringMatching(
  /^[A-Za-z0-9_]*$/,
).map((name) => `public${name}`);

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

  { // immutable RegExp
    const pattern = /password/;
    Object.freeze(pattern);
    assert.strictEqual(shouldFieldRedacted("password", [pattern]), true);
  }

  { // immutable stateful RegExp
    const pattern = /password/g;
    Object.freeze(pattern);
    assert.strictEqual(shouldFieldRedacted("password", [pattern]), true);
  }
});

test("shouldFieldRedacted() is repeatable for generated stateful regexes", () => {
  fc.assert(
    fc.property(fieldNameArb, fc.constantFrom("g", "y"), (field, flag) => {
      const pattern = new RegExp(escapeRegExp(field), flag);

      assert.strictEqual(shouldFieldRedacted(field, [pattern]), true);
      assert.strictEqual(shouldFieldRedacted(field, [pattern]), true);
      assert.strictEqual(pattern.lastIndex, 0);
    }),
  );
});

test("shouldFieldRedacted() does not mutate generated regex state", () => {
  fc.assert(
    fc.property(
      fieldNameArb,
      fc.constantFrom("g", "y"),
      fc.integer({ min: 1, max: 100 }),
      (field, flag, lastIndex) => {
        const pattern = new RegExp(escapeRegExp(field), flag);
        pattern.lastIndex = lastIndex;

        assert.strictEqual(shouldFieldRedacted(field, [pattern]), true);
        assert.strictEqual(pattern.lastIndex, lastIndex);
      },
    ),
  );
});

test("shouldFieldRedacted() matches generated exact field names", () => {
  fc.assert(
    fc.property(fieldNameArb, publicFieldNameArb, (field, otherField) => {
      assert.strictEqual(shouldFieldRedacted(field, [field]), true);
      assert.strictEqual(shouldFieldRedacted(otherField, [field]), false);
    }),
  );
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

  { // handles circular arrays to prevent stack overflow
    const array: unknown[] = [{ password: "some-password" }];
    array.push(array);

    const result = redactProperties({ array }, {
      fieldPatterns: ["password"],
      action: () => "REDACTED",
    });

    const redactedArray = result.array as unknown[];
    assert.deepStrictEqual(redactedArray[0], { password: "REDACTED" });
    assert.strictEqual(redactedArray[1], redactedArray);
  }

  { // preserves holes in sparse arrays
    const array: unknown[] = [];
    array.length = 3;
    array[1] = { password: "some-password" };

    const result = redactProperties({ array }, {
      fieldPatterns: ["password"],
      action: () => "REDACTED",
    });

    const redactedArray = result.array as unknown[];
    assert.strictEqual(redactedArray.length, 3);
    assert.ok(!Object.hasOwn(redactedArray, 0));
    assert.deepStrictEqual(redactedArray[1], { password: "REDACTED" });
    assert.ok(!Object.hasOwn(redactedArray, 2));
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

  { // preserves __proto__ as an own property
    const properties = Object.create(null) as Record<string, unknown>;
    properties["__proto__"] = "public";
    properties["password"] = "secret";

    const result = redactProperties(properties, {
      fieldPatterns: ["password"],
    });

    assert.ok(Object.hasOwn(result, "__proto__"));
    assert.strictEqual(result["__proto__"], "public");
    assert.strictEqual(
      Object.getPrototypeOf(result),
      Object.prototype,
    );
  }
});

test("redactProperties() deletes generated matching fields", () => {
  fc.assert(
    fc.property(
      fieldNameArb,
      publicFieldNameArb,
      fc.jsonValue(),
      fc.jsonValue(),
      (sensitiveField, publicField, sensitiveValue, publicValue) => {
        const properties = {
          [sensitiveField]: sensitiveValue,
          [publicField]: publicValue,
        };

        const result = redactProperties(properties, {
          fieldPatterns: [sensitiveField],
        });

        assert.ok(!(sensitiveField in result));
        assert.deepStrictEqual(result[publicField], publicValue);
      },
    ),
  );
});

test("redactProperties() applies generated replacement actions", () => {
  fc.assert(
    fc.property(fieldNameArb, fc.jsonValue(), fc.string(), (
      sensitiveField,
      sensitiveValue,
      replacement,
    ) => {
      const result = redactProperties(
        { [sensitiveField]: sensitiveValue },
        {
          fieldPatterns: [sensitiveField],
          action: () => replacement,
        },
      );

      assert.deepStrictEqual(result, { [sensitiveField]: replacement });
    }),
  );
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

  { // preserves non-sensitive nested message placeholders
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["User ", "Alice", ""],
      rawMessage: "User {user.name}",
      timestamp: Date.now(),
      properties: {
        user: { name: "Alice", password: "secret" },
      },
    });

    assert.strictEqual(records[0].message[1], "Alice");
    assert.deepStrictEqual(records[0].properties.user, {
      name: "Alice",
      password: "[REDACTED]",
    });
  }

  { // quoted path placeholders use redacted properties
    const records: LogRecord[] = [];
    const wrappedSink = redactByField((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => "[REDACTED]",
    });
    const profile = { name: "Alice", password: "secret" };

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Profile: ", profile, ""],
      rawMessage: 'Profile: {user["profile"]}',
      timestamp: Date.now(),
      properties: { user: { profile } },
    });

    assert.deepStrictEqual(records[0].message[1], {
      name: "Alice",
      password: "[REDACTED]",
    });
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

test("createHmacPseudonymizer()", async () => {
  { // uses HMAC-SHA-256 and base64url output by default
    const pseudonymize = await createHmacPseudonymizer({ key: "secret" });

    const result = await pseudonymize("user@example.com");

    assert.strictEqual(
      result,
      "hmac-sha256:_rymVrH6IjQINijRdPJQ3YVyglkBeJCRbLb_wHEjQN4",
    );
  }

  { // supports hex output and custom prefix
    const pseudonymize = await createHmacPseudonymizer({
      key: "secret",
      encoding: "hex",
      prefix: "user:",
    });

    const result = await pseudonymize("user@example.com");

    assert.strictEqual(
      result,
      "user:febca656b1fa2234083628d174f250dd85728259017890916cb6ffc0712340de",
    );
  }

  { // allows disabling the prefix
    const pseudonymize = await createHmacPseudonymizer({
      key: "secret",
      prefix: "",
    });

    const result = await pseudonymize("user@example.com");

    assert.strictEqual(
      result,
      "_rymVrH6IjQINijRdPJQ3YVyglkBeJCRbLb_wHEjQN4",
    );
  }

  { // encodes non-string values using String(value)
    const pseudonymize = await createHmacPseudonymizer({ key: "secret" });

    assert.strictEqual(
      await pseudonymize(123),
      await pseudonymize("123"),
    );
  }

  { // is deterministic but distinguishes different values
    const pseudonymize = await createHmacPseudonymizer({ key: "secret" });

    const first = await pseudonymize("alice@example.com");
    const second = await pseudonymize("alice@example.com");
    const third = await pseudonymize("bob@example.com");

    assert.strictEqual(first, second);
    assert.notStrictEqual(first, third);
    assert.strictEqual(typeof first, "string");
    assert.ok(!first.includes("alice@example.com"));
  }

  { // reports a clear error when the Web Crypto API is unavailable
    const originalCrypto = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    try {
      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        configurable: true,
      });

      await assert.rejects(
        createHmacPseudonymizer({ key: "secret" }),
        new TypeError("The Web Crypto API is not available."),
      );
    } finally {
      if (originalCrypto == null) {
        delete (globalThis as { crypto?: Crypto }).crypto;
      } else {
        Object.defineProperty(globalThis, "crypto", originalCrypto);
      }
    }
  }

  { // derives the default prefix from a supplied CryptoKey
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("secret"),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const pseudonymize = await createHmacPseudonymizer({ key });

    const result = await pseudonymize("user@example.com");

    assert.match(result, /^hmac-sha512:/u);
  }

  { // recognizes CryptoKey values across constructor boundaries
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("secret"),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const originalCryptoKey = Object.getOwnPropertyDescriptor(
      globalThis,
      "CryptoKey",
    );
    try {
      Object.defineProperty(globalThis, "CryptoKey", {
        value: class CryptoKey {},
        configurable: true,
      });

      const pseudonymize = await createHmacPseudonymizer({ key });
      const result = await pseudonymize("user@example.com");

      assert.match(result, /^hmac-sha512:/u);
    } finally {
      if (originalCryptoKey == null) {
        delete (globalThis as { CryptoKey?: typeof CryptoKey }).CryptoKey;
      } else {
        Object.defineProperty(globalThis, "CryptoKey", originalCryptoKey);
      }
    }
  }

  { // rejects a CryptoKey whose HMAC hash does not match the option
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("secret"),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );

    await assert.rejects(
      createHmacPseudonymizer({ key, hash: "SHA-256" }),
      new TypeError(
        'The HMAC CryptoKey uses SHA-512, but the "hash" option is SHA-256.',
      ),
    );
  }
});

test("redactByFieldAsync()", async () => {
  { // starts async property redactions concurrently
    const started: string[] = [];
    let releaseFirst = () => {};
    const firstRedaction = new Promise<string>((resolve) => {
      releaseFirst = () => resolve("p:first");
    });

    const redaction = redactPropertiesAsync(
      { first: "first", second: "second" },
      {
        fieldPatterns: ["first", "second"],
        action: (value) => {
          started.push(String(value));
          if (value === "first") return firstRedaction;
          return Promise.resolve("p:second");
        },
      },
    );
    await Promise.resolve();

    assert.deepStrictEqual(started, ["first", "second"]);
    releaseFirst();
    assert.deepStrictEqual(await redaction, {
      first: "p:first",
      second: "p:second",
    });
  }

  { // only own properties are redacted
    const properties = Object.create({ password: "inherited" }) as Record<
      string,
      unknown
    >;
    properties.name = "Alice";

    const result = await redactPropertiesAsync(properties, {
      fieldPatterns: ["password"],
      action: (value) => Promise.resolve(`p:${value}`),
    });

    assert.deepStrictEqual(result, { name: "Alice" });
  }

  { // applies async action to properties and string-template messages
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["email"],
      action: (value) => Promise.resolve(`p:${value}`),
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Email: ", "user@example.com", ""],
      rawMessage: "Email: {email}",
      timestamp: Date.now(),
      properties: { email: "user@example.com" },
    });
    await wrappedSink[Symbol.asyncDispose]();

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].properties.email, "p:user@example.com");
    assert.strictEqual(records[0].message[1], "p:user@example.com");
    assert.strictEqual(typeof records[0].message[1], "string");
  }

  { // starts string-template message redactions concurrently
    const records: LogRecord[] = [];
    const started: string[] = [];
    let releaseFirstMessage = () => {};
    const firstMessageRedaction = new Promise<string>((resolve) => {
      releaseFirstMessage = () => resolve("p:msg:first");
    });
    let firstMessageStarted = () => {};
    const firstMessageStartedPromise = new Promise<void>((resolve) => {
      firstMessageStarted = resolve;
    });
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["first", "second"],
      action: (value) => {
        started.push(String(value));
        if (value === "msg:first") {
          firstMessageStarted();
          return firstMessageRedaction;
        }
        return Promise.resolve(`p:${value}`);
      },
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["", "msg:first", " ", "msg:second", ""],
      rawMessage: "{first} {second}",
      timestamp: Date.now(),
      properties: { first: "prop:first", second: "prop:second" },
    });
    await firstMessageStartedPromise;
    await Promise.resolve();

    assert.ok(started.includes("msg:second"));
    releaseFirstMessage();
    await wrappedSink[Symbol.asyncDispose]();

    assert.deepStrictEqual(records[0].message, [
      "",
      "p:msg:first",
      " ",
      "p:msg:second",
      "",
    ]);
  }

  { // redacts nested values and wildcard placeholders
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: [/email/i],
      action: () => Promise.resolve("[PSEUDONYMIZED]"),
    });

    const properties = { args: [{ email: "user@example.com" }] };
    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["", properties, ""],
      rawMessage: "{*}",
      timestamp: Date.now(),
      properties,
    });
    await wrappedSink[Symbol.asyncDispose]();

    assert.deepStrictEqual(records[0].properties, {
      args: [{ email: "[PSEUDONYMIZED]" }],
    });
    assert.deepStrictEqual(records[0].message[1], {
      args: [{ email: "[PSEUDONYMIZED]" }],
    });
  }

  { // preserves non-sensitive nested message placeholders
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => Promise.resolve("[REDACTED]"),
    });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["User ", "Alice", ""],
      rawMessage: "User {user.name}",
      timestamp: Date.now(),
      properties: {
        user: { name: "Alice", password: "secret" },
      },
    });
    await wrappedSink[Symbol.asyncDispose]();

    assert.strictEqual(records[0].message[1], "Alice");
    assert.deepStrictEqual(records[0].properties.user, {
      name: "Alice",
      password: "[REDACTED]",
    });
  }

  { // quoted path placeholders use redacted properties
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => Promise.resolve("[REDACTED]"),
    });
    const profile = { name: "Alice", password: "secret" };

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Profile: ", profile, ""],
      rawMessage: 'Profile: {user["profile"]}',
      timestamp: Date.now(),
      properties: { user: { profile } },
    });
    await wrappedSink[Symbol.asyncDispose]();

    assert.deepStrictEqual(records[0].message[1], {
      name: "Alice",
      password: "[REDACTED]",
    });
  }

  { // preserves circular arrays instead of dropping the record
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => Promise.resolve("REDACTED"),
    });
    const array: unknown[] = [{ password: "some-password" }];
    array.push(array);

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["", array, ""],
      rawMessage: "{array}",
      timestamp: Date.now(),
      properties: { array },
    });
    await wrappedSink[Symbol.asyncDispose]();

    assert.strictEqual(records.length, 1);
    const redactedArray = records[0].properties.array as unknown[];
    assert.deepStrictEqual(redactedArray[0], { password: "REDACTED" });
    assert.strictEqual(redactedArray[1], redactedArray);
    assert.strictEqual(records[0].message[1], redactedArray);
  }

  { // preserves sparse arrays
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["password"],
      action: () => Promise.resolve("REDACTED"),
    });
    const array: unknown[] = [];
    array.length = 3;
    array[1] = { password: "some-password" };

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["", array, ""],
      rawMessage: "{array}",
      timestamp: Date.now(),
      properties: { array },
    });
    await wrappedSink[Symbol.asyncDispose]();

    const redactedArray = records[0].properties.array as unknown[];
    assert.strictEqual(redactedArray.length, 3);
    assert.ok(!Object.hasOwn(redactedArray, 0));
    assert.deepStrictEqual(redactedArray[1], { password: "REDACTED" });
    assert.ok(!Object.hasOwn(redactedArray, 2));
    assert.strictEqual(records[0].message[1], redactedArray);
  }

  { // redacts tagged-template message values by comparison
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["email"],
      action: () => Promise.resolve("[PSEUDONYMIZED]"),
    });
    const rawMessage = ["Email: ", ""] as unknown as TemplateStringsArray;
    Object.defineProperty(rawMessage, "raw", { value: rawMessage });

    wrappedSink({
      level: "info",
      category: ["test"],
      message: ["Email: ", "user@example.com", ""],
      rawMessage,
      timestamp: Date.now(),
      properties: { email: "user@example.com" },
    });
    await wrappedSink[Symbol.asyncDispose]();

    assert.strictEqual(records[0].message[1], "[PSEUDONYMIZED]");
    assert.strictEqual(records[0].properties.email, "[PSEUDONYMIZED]");
  }

  { // starts redaction for later records before earlier records are emitted
    const records: LogRecord[] = [];
    const started: string[] = [];
    let releaseFirst = () => {};
    const firstRedaction = new Promise<string>((resolve) => {
      releaseFirst = () => resolve("p:first");
    });
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["id"],
      action: (value) => {
        started.push(String(value));
        if (value === "first") return firstRedaction;
        return Promise.resolve(`p:${value}`);
      },
    });

    wrappedSink(recordWithId("first"));
    wrappedSink(recordWithId("second"));
    await Promise.resolve();

    assert.deepStrictEqual(started, ["first", "second"]);
    releaseFirst();
    await wrappedSink[Symbol.asyncDispose]();

    assert.deepStrictEqual(
      records.map((record) => record.properties.id),
      ["p:first", "p:second"],
    );
  }

  { // preserves record order even when actions resolve out of order
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["id"],
      action: async (value) => {
        if (value === "first") await delay(10);
        return `p:${value}`;
      },
    });

    wrappedSink(recordWithId("first"));
    wrappedSink(recordWithId("second"));
    await wrappedSink[Symbol.asyncDispose]();

    assert.deepStrictEqual(
      records.map((record) => record.properties.id),
      ["p:first", "p:second"],
    );
  }

  { // disposes the wrapped sink after pending redaction work
    const records: LogRecord[] = [];
    let disposedAfterRecords = false;
    const sink: Sink & AsyncDisposable = (record) => records.push(record);
    sink[Symbol.asyncDispose] = () => {
      disposedAfterRecords = records.length === 1;
      return Promise.resolve();
    };
    const wrappedSink = redactByFieldAsync(sink, {
      fieldPatterns: ["id"],
      action: (value) => Promise.resolve(`p:${value}`),
    });

    wrappedSink(recordWithId("first"));
    await wrappedSink[Symbol.asyncDispose]();

    assert.strictEqual(disposedAfterRecords, true);
  }

  { // ignores records queued after async disposal starts
    const records: string[] = [];
    let disposed = false;
    let releaseFirst = () => {};
    const firstRedaction = new Promise<string>((resolve) => {
      releaseFirst = () => resolve("p:first");
    });
    const sink: Sink & AsyncDisposable = (record) => {
      if (disposed) throw new Error("sink already disposed");
      records.push(String(record.properties.id));
    };
    sink[Symbol.asyncDispose] = () => {
      disposed = true;
      return Promise.resolve();
    };
    const wrappedSink = redactByFieldAsync(sink, {
      fieldPatterns: ["id"],
      action: (value) => {
        if (value === "first") return firstRedaction;
        return Promise.resolve(`p:${value}`);
      },
    });

    wrappedSink(recordWithId("first"));
    const disposal = wrappedSink[Symbol.asyncDispose]();
    wrappedSink(recordWithId("during"));
    releaseFirst();
    await disposal;

    assert.deepStrictEqual(records, ["p:first"]);
    assert.strictEqual(disposed, true);
  }

  { // surfaces wrapped sink failures during disposal
    const records: LogRecord[] = [];
    const sinkError = new Error("sink failed");
    const sink: Sink = (record) => {
      if (record.properties.id === "p:bad") throw sinkError;
      records.push(record);
    };
    const wrappedSink = redactByFieldAsync(sink, {
      fieldPatterns: ["id"],
      action: (value) => Promise.resolve(`p:${value}`),
    });

    wrappedSink(recordWithId("bad"));
    wrappedSink(recordWithId("good"));

    await assert.rejects(
      async () => await wrappedSink[Symbol.asyncDispose](),
      sinkError,
    );
    assert.deepStrictEqual(
      records.map((record) => record.properties.id),
      ["p:good"],
    );
  }

  { // surfaces wrapped async sink rejections during disposal
    const records: LogRecord[] = [];
    const sinkError = new Error("async sink failed");
    const sink = ((record: LogRecord) => {
      if (record.properties.id === "p:bad") {
        return Promise.reject(sinkError);
      }
      records.push(record);
      return Promise.resolve();
    }) as Sink;
    const wrappedSink = redactByFieldAsync(sink, {
      fieldPatterns: ["id"],
      action: (value) => Promise.resolve(`p:${value}`),
    });

    wrappedSink(recordWithId("bad"));
    wrappedSink(recordWithId("good"));

    await assert.rejects(
      async () => await wrappedSink[Symbol.asyncDispose](),
      sinkError,
    );
    assert.deepStrictEqual(
      records.map((record) => record.properties.id),
      ["p:good"],
    );
  }

  { // rejected actions drop only the failed record
    const records: LogRecord[] = [];
    const wrappedSink = redactByFieldAsync((r) => records.push(r), {
      fieldPatterns: ["id"],
      action: (value) => {
        if (value === "bad") return Promise.reject(new Error("boom"));
        return Promise.resolve(`p:${value}`);
      },
    });

    wrappedSink(recordWithId("bad"));
    wrappedSink(recordWithId("good"));
    await wrappedSink[Symbol.asyncDispose]();

    assert.deepStrictEqual(
      records.map((record) => record.properties.id),
      ["p:good"],
    );
  }

  { // reports redaction failures to the meta logger
    const records: LogRecord[] = [];
    const metaRecords: LogRecord[] = [];
    const redactionError = new Error("redaction failed");
    await configure({
      sinks: { meta: (record) => metaRecords.push(record) },
      loggers: [
        {
          category: ["logtape", "meta"],
          lowestLevel: "warning",
          sinks: ["meta"],
        },
      ],
    });
    try {
      const wrappedSink = redactByFieldAsync((r) => records.push(r), {
        fieldPatterns: ["id"],
        action: (value) => {
          if (value === "bad") return Promise.reject(redactionError);
          return Promise.resolve(`p:${value}`);
        },
      });

      wrappedSink(recordWithId("bad"));
      await wrappedSink[Symbol.asyncDispose]();

      assert.deepStrictEqual(records, []);
      assert.strictEqual(metaRecords.length, 1);
      assert.strictEqual(metaRecords[0].category[0], "logtape");
      assert.strictEqual(metaRecords[0].category[1], "meta");
      assert.strictEqual(metaRecords[0].level, "warning");
      assert.strictEqual(metaRecords[0].properties.error, redactionError);
    } finally {
      await reset();
    }
  }
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function recordWithId(id: string): LogRecord {
  return {
    level: "info",
    category: ["test"],
    message: ["ID: ", id, ""],
    rawMessage: "ID: {id}",
    timestamp: Date.now(),
    properties: { id },
  };
}
