import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConsoleFormatter,
  LogRecord,
  TextFormatter,
} from "@logtape/logtape";
import {
  CREDIT_CARD_NUMBER_PATTERN,
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  KR_RRN_PATTERN,
  redactByPattern,
  type RedactionPattern,
  US_SSN_PATTERN,
} from "./pattern.ts";

test("EMAIL_ADDRESS_PATTERN", () => {
  const { pattern, replacement } = EMAIL_ADDRESS_PATTERN;

  // Test valid email addresses
  const validEmails = [
    "user@example.com",
    "first.last@example.co.uk",
    "user+tag@example.org",
    "user123@sub.domain.com",
    "user-name@example.com",
    "user_name@example.com",
    "user.name@example-domain.co",
    // Ensure international domains work:
    // cSpell: disable
    "用户@例子.世界",
    "пользователь@пример.рф",
    // cSpell: enable
  ];

  for (const email of validEmails) {
    assert.match(email, pattern);
    pattern.lastIndex = 0;
  }

  // Test replacements
  assert.strictEqual(
    "Contact at user@example.com for more info.".replaceAll(
      pattern,
      replacement as string,
    ),
    "Contact at REDACTED@EMAIL.ADDRESS for more info.",
  );
  assert.strictEqual(
    "My email is user@example.com".replaceAll(pattern, replacement as string),
    "My email is REDACTED@EMAIL.ADDRESS",
  );
  assert.strictEqual(
    "Emails: user1@example.com and user2@example.org".replaceAll(
      pattern,
      replacement as string,
    ),
    "Emails: REDACTED@EMAIL.ADDRESS and REDACTED@EMAIL.ADDRESS",
  );

  // Ensure the global flag is set
  assert.ok(
    pattern.global,
    "EMAIL_ADDRESS_PATTERN should have the global flag set",
  );
});

test("CREDIT_CARD_NUMBER_PATTERN", () => {
  const { pattern, replacement } = CREDIT_CARD_NUMBER_PATTERN;

  // Test valid credit card numbers with dashes
  assert.match("1234-5678-9012-3456", pattern); // Regular 16-digit card
  pattern.lastIndex = 0;
  assert.match("1234-5678-901234", pattern); // American Express format
  pattern.lastIndex = 0;

  // Test replacements
  assert.strictEqual(
    "Card: 1234-5678-9012-3456".replaceAll(pattern, replacement as string),
    "Card: XXXX-XXXX-XXXX-XXXX",
  );
  assert.strictEqual(
    "AmEx: 1234-5678-901234".replaceAll(pattern, replacement as string),
    "AmEx: XXXX-XXXX-XXXX-XXXX",
  );
  assert.strictEqual(
    "Cards: 1234-5678-9012-3456 and 1234-5678-901234".replaceAll(
      pattern,
      replacement as string,
    ),
    "Cards: XXXX-XXXX-XXXX-XXXX and XXXX-XXXX-XXXX-XXXX",
  );
});

test("US_SSN_PATTERN", () => {
  const { pattern, replacement } = US_SSN_PATTERN;

  // Test valid US Social Security numbers
  assert.match("123-45-6789", pattern);
  pattern.lastIndex = 0;

  // Test replacements
  assert.strictEqual(
    "SSN: 123-45-6789".replaceAll(pattern, replacement as string),
    "SSN: XXX-XX-XXXX",
  );
  assert.strictEqual(
    "SSNs: 123-45-6789 and 987-65-4321".replaceAll(
      pattern,
      replacement as string,
    ),
    "SSNs: XXX-XX-XXXX and XXX-XX-XXXX",
  );
});

test("KR_RRN_PATTERN", () => {
  const { pattern, replacement } = KR_RRN_PATTERN;

  // Test valid South Korean resident registration numbers
  assert.match("123456-7890123", pattern);
  pattern.lastIndex = 0;

  // Test replacements
  assert.strictEqual(
    "RRN: 123456-7890123".replaceAll(pattern, replacement as string),
    "RRN: XXXXXX-XXXXXXX",
  );
  assert.strictEqual(
    "RRNs: 123456-7890123 and 654321-0987654".replaceAll(
      pattern,
      replacement as string,
    ),
    "RRNs: XXXXXX-XXXXXXX and XXXXXX-XXXXXXX",
  );
});

test("JWT_PATTERN", () => {
  const { pattern, replacement } = JWT_PATTERN;

  // Test valid JWT tokens
  const sampleJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  assert.match(sampleJwt, pattern);
  pattern.lastIndex = 0;

  // Test replacements
  assert.strictEqual(
    `Token: ${sampleJwt}`.replaceAll(pattern, replacement as string),
    "Token: [JWT REDACTED]",
  );
  assert.strictEqual(
    `First: ${sampleJwt}, Second: ${sampleJwt}`.replaceAll(
      pattern,
      replacement as string,
    ),
    "First: [JWT REDACTED], Second: [JWT REDACTED]",
  );
});

test("redactByPattern(TextFormatter)", () => {
  { // redacts sensitive information in text output
    // Create a simple TextFormatter that returns a string
    const formatter: TextFormatter = (record: LogRecord) => {
      return `[${record.level.toUpperCase()}] ${record.message.join(" ")}`;
    };

    // Test data with multiple patterns to redact
    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: [
        "Sensitive info: email = user@example.com, cc = 1234-5678-9012-3456, ssn = 123-45-6789",
      ],
      rawMessage:
        "Sensitive info: email = user@example.com, cc = 1234-5678-9012-3456, ssn = 123-45-6789",
      timestamp: Date.now(),
      properties: {},
    };

    // Apply redaction with multiple patterns
    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
      CREDIT_CARD_NUMBER_PATTERN,
      US_SSN_PATTERN,
    ]);

    const output = redactedFormatter(record);

    // Verify all sensitive data was redacted
    assert.strictEqual(
      output,
      "[INFO] Sensitive info: email = REDACTED@EMAIL.ADDRESS, cc = XXXX-XXXX-XXXX-XXXX, ssn = XXX-XX-XXXX",
    );
  }

  { // handles function-based replacements
    const formatter: TextFormatter = (record: LogRecord) => {
      return record.message.join(" ");
    };

    // Custom pattern with function replacement
    const customPattern: RedactionPattern = {
      pattern: /\b(password|pw)=([^\s,]+)/g,
      replacement: (_match, key) => `${key}=[HIDDEN]`,
    };

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Credentials: password=secret123, pw=another-secret"],
      rawMessage: "Credentials: password=secret123, pw=another-secret",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [customPattern]);
    const output = redactedFormatter(record);

    assert.strictEqual(
      output,
      "Credentials: password=[HIDDEN], pw=[HIDDEN]",
    );
  }

  { // throws error if global flag is not set
    const formatter: TextFormatter = (record: LogRecord) =>
      record.message.join(" ");

    const invalidPattern: RedactionPattern = {
      pattern: /password/, // Missing global flag
      replacement: "****",
    };

    assert.throws(
      () => redactByPattern(formatter, [invalidPattern]),
      TypeError,
    );
  }
});

test("redactByPattern(ConsoleFormatter)", () => {
  { // redacts sensitive information in console formatter arrays
    // Create a simple ConsoleFormatter that returns an array of values
    const formatter: ConsoleFormatter = (record: LogRecord) => {
      return [
        `[${record.level.toUpperCase()}]`,
        ...record.message,
      ];
    };

    // Create test record with sensitive data
    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: [
        "User data:",
        {
          name: "John Doe",
          email: "john@example.com",
          creditCard: "1234-5678-9012-3456",
        },
      ],
      rawMessage: "User data: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    // Apply redaction
    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
      CREDIT_CARD_NUMBER_PATTERN,
    ]);

    const output = redactedFormatter(record);

    // Verify output structure is preserved and data is redacted
    assert.strictEqual(output[0], "[INFO]");
    assert.strictEqual(output[1], "User data:");
    assert.strictEqual(
      (output[2] as { name: string; email: string; creditCard: string }).name,
      "John Doe",
    );
    assert.strictEqual(
      (output[2] as { name: string; email: string; creditCard: string })
        .email,
      "REDACTED@EMAIL.ADDRESS",
    );
    assert.strictEqual(
      (output[2] as { name: string; email: string; creditCard: string })
        .creditCard,
      "XXXX-XXXX-XXXX-XXXX",
    );
  }

  { // handles nested objects and arrays in console output
    const formatter: ConsoleFormatter = (record: LogRecord) => {
      return [record.level, record.message];
    };

    const nestedData = {
      user: {
        contact: {
          email: "user@example.com",
          phone: "123-456-7890",
        },
        payment: {
          cards: [
            "1234-5678-9012-3456",
            "8765-4321-8765-4321",
          ],
        },
        documents: {
          ssn: "123-45-6789",
        },
      },
    };

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Data:", nestedData],
      rawMessage: "Data: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
      CREDIT_CARD_NUMBER_PATTERN,
      US_SSN_PATTERN,
    ]);

    const output = redactedFormatter(record);

    // Verify deep redaction in nested structures
    const resultData =
      (output[1] as unknown[])[1] as unknown as typeof nestedData;
    assert.strictEqual(resultData.user.contact.email, "REDACTED@EMAIL.ADDRESS");
    assert.strictEqual(resultData.user.contact.phone, "123-456-7890"); // Not redacted
    assert.strictEqual(resultData.user.payment.cards[0], "XXXX-XXXX-XXXX-XXXX");
    assert.strictEqual(resultData.user.payment.cards[1], "XXXX-XXXX-XXXX-XXXX");
    assert.strictEqual(resultData.user.documents.ssn, "XXX-XX-XXXX");
  }

  { // handles circular references to prevent stack overflow
    const formatter: ConsoleFormatter = (record: LogRecord) => [record.message];

    const circularObj: Record<string, unknown> = {
      email: "user@example.com",
    };
    circularObj.self = circularObj;

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Circular object:", circularObj],
      rawMessage: "Circular object: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
    ]);
    const output = redactedFormatter(record);

    const resultData = (output[0] as unknown[])[1] as Record<string, unknown>;
    assert.strictEqual(resultData.email, "REDACTED@EMAIL.ADDRESS");
    assert.ok(
      resultData.self === resultData,
      "Circular reference should be preserved",
    );
  }

  { // redacts fields in class instances
    const formatter: ConsoleFormatter = (record: LogRecord) => [record.message];

    class User {
      constructor(public email: string, public name: string) {}
    }

    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["User object:", new User("user@example.com", "Alice")],
      rawMessage: "User object: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
    ]);
    const output = redactedFormatter(record);

    const resultUser = (output[0] as unknown[])[1] as User;
    assert.strictEqual(resultUser.email, "REDACTED@EMAIL.ADDRESS");
    assert.strictEqual(resultUser.name, "Alice");
  }

  { // preserves Error objects without modification
    const formatter: ConsoleFormatter = (record: LogRecord) => [record.message];

    const err = new Error("test error");
    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Error object:", err],
      rawMessage: "Error object: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
    ]);
    const output = redactedFormatter(record);

    const resultErr = (output[0] as unknown[])[1] as Error;
    assert.ok(resultErr instanceof Error);
    assert.strictEqual(resultErr.message, "test error");
    assert.ok(resultErr === err, "Error should be the same instance");
  }

  { // preserves Date objects without modification
    const formatter: ConsoleFormatter = (record: LogRecord) => [record.message];

    const date = new Date("2024-01-01T00:00:00Z");
    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Date object:", date],
      rawMessage: "Date object: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
    ]);
    const output = redactedFormatter(record);

    const resultDate = (output[0] as unknown[])[1] as Date;
    assert.ok(resultDate instanceof Date);
    assert.strictEqual(resultDate.toISOString(), date.toISOString());
    assert.ok(resultDate === date, "Date should be the same instance");
  }

  { // preserves built-in objects in arrays
    const formatter: ConsoleFormatter = (record: LogRecord) => [record.message];

    const err = new Error("array error");
    const date = new Date();
    const record: LogRecord = {
      level: "info",
      category: ["test"],
      message: ["Items:", [err, date, { email: "user@example.com" }]],
      rawMessage: "Items: [object Object]",
      timestamp: Date.now(),
      properties: {},
    };

    const redactedFormatter = redactByPattern(formatter, [
      EMAIL_ADDRESS_PATTERN,
    ]);
    const output = redactedFormatter(record);

    const items = (output[0] as unknown[])[1] as unknown[];
    assert.ok(items[0] instanceof Error);
    assert.ok(items[0] === err, "Error in array should be same instance");
    assert.ok(items[1] instanceof Date);
    assert.ok(items[1] === date, "Date in array should be same instance");
    assert.strictEqual(
      (items[2] as { email: string }).email,
      "REDACTED@EMAIL.ADDRESS",
    );
  }
});
