import assert from "node:assert/strict";
import test from "node:test";
import { configure, type LogRecord, reset } from "@logtape/logtape";
import { DrizzleLogger, getLogger, serialize, stringLiteral } from "./mod.ts";

// Test fixture: Collect log records, filtering out internal LogTape meta logs
function createTestSink(): {
  sink: (record: LogRecord) => void;
  logs: LogRecord[];
} {
  const logs: LogRecord[] = [];
  return {
    // Filter out logtape meta logs automatically
    sink: (record: LogRecord) => {
      if (record.category[0] !== "logtape") {
        logs.push(record);
      }
    },
    logs,
  };
}

// Setup helper
async function setupLogtape(): Promise<{
  logs: LogRecord[];
  cleanup: () => Promise<void>;
}> {
  const { sink, logs } = createTestSink();
  await configure({
    sinks: { test: sink },
    loggers: [{ category: [], sinks: ["test"] }],
  });
  return { logs, cleanup: () => reset() };
}

// ============================================
// Basic Logger Creation Tests
// ============================================

test("getLogger(): creates a Drizzle ORM-compatible logger", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogger();

    assert.strictEqual(typeof logger.logQuery, "function");
    assert.strictEqual(logger instanceof DrizzleLogger, true);
  } finally {
    await cleanup();
  }
});

test("getLogger(): uses default category ['drizzle-orm']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["drizzle-orm"]);
  } finally {
    await cleanup();
  }
});

test("getLogger(): uses custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger({ category: ["myapp", "database"] });
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp", "database"]);
  } finally {
    await cleanup();
  }
});

test("getLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger({ category: "database" });
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["database"]);
  } finally {
    await cleanup();
  }
});

// ============================================
// Log Level Tests
// ============================================

test("getLogger(): uses default level 'debug'", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("getLogger(): uses custom level", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger({ level: "info" });
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "info");
  } finally {
    await cleanup();
  }
});

test("getLogger(): supports all log levels", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const levels = [
      "trace",
      "debug",
      "info",
      "warning",
      "error",
      "fatal",
    ] as const;

    for (const level of levels) {
      logs.length = 0; // Clear logs
      const logger = getLogger({ level });
      logger.logQuery("SELECT 1", []);

      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].level, level);
    }
  } finally {
    await cleanup();
  }
});

// ============================================
// Query Logging Tests
// ============================================

test("logQuery(): logs query with structured data", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT * FROM users WHERE id = $1", ["123"]);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.query,
      "SELECT * FROM users WHERE id = $1",
    );
    assert.deepStrictEqual(logs[0].properties.params, ["123"]);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM users WHERE id = '123'",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): formats query with multiple parameters", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "SELECT * FROM users WHERE name = $1 AND age > $2",
      ["Alice", 25],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM users WHERE name = 'Alice' AND age > 25",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles empty parameters", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT * FROM users", []);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM users",
    );
    assert.deepStrictEqual(logs[0].properties.params, []);
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles unmatched placeholders", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT * FROM users WHERE id = $1 AND name = $2", ["123"]);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM users WHERE id = '123' AND name = $2",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): log message contains formatted query", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "Query: {formattedQuery}");
  } finally {
    await cleanup();
  }
});

// ============================================
// Parameter Serialization Tests
// ============================================

test("serialize(): handles null", () => {
  assert.strictEqual(serialize(null), "NULL");
});

test("serialize(): handles undefined", () => {
  assert.strictEqual(serialize(undefined), "NULL");
});

test("serialize(): handles strings", () => {
  assert.strictEqual(serialize("hello"), "'hello'");
});

test("serialize(): handles strings with special characters", () => {
  assert.strictEqual(serialize("hello\nworld"), "E'hello\\nworld'");
  assert.strictEqual(serialize("it's"), "E'it\\'s'");
  assert.strictEqual(serialize("back\\slash"), "E'back\\\\slash'");
  assert.strictEqual(serialize("tab\there"), "E'tab\\there'");
  assert.strictEqual(serialize("carriage\rreturn"), "E'carriage\\rreturn'");
});

test("serialize(): handles numbers", () => {
  assert.strictEqual(serialize(42), "42");
  assert.strictEqual(serialize(3.14), "3.14");
  assert.strictEqual(serialize(-10), "-10");
  assert.strictEqual(serialize(0), "0");
});

test("serialize(): handles bigints", () => {
  assert.strictEqual(serialize(BigInt(9007199254740991)), "9007199254740991");
});

test("serialize(): handles booleans", () => {
  assert.strictEqual(serialize(true), "'t'");
  assert.strictEqual(serialize(false), "'f'");
});

test("serialize(): handles Date objects", () => {
  const date = new Date("2024-01-15T10:30:00.000Z");
  assert.strictEqual(serialize(date), "'2024-01-15T10:30:00.000Z'");
});

test("serialize(): handles arrays", () => {
  assert.strictEqual(serialize([1, 2, 3]), "ARRAY[1, 2, 3]");
  assert.strictEqual(serialize(["a", "b"]), "ARRAY['a', 'b']");
  assert.strictEqual(serialize([]), "ARRAY[]");
});

test("serialize(): handles nested arrays", () => {
  assert.strictEqual(
    serialize([[1, 2], [3, 4]]),
    "ARRAY[ARRAY[1, 2], ARRAY[3, 4]]",
  );
});

test("serialize(): handles objects as JSON", () => {
  assert.strictEqual(serialize({ key: "value" }), '\'{"key":"value"}\'');
  assert.strictEqual(serialize({ nested: { a: 1 } }), '\'{"nested":{"a":1}}\'');
});

test("serialize(): handles mixed arrays", () => {
  assert.strictEqual(serialize([1, "two", true]), "ARRAY[1, 'two', 't']");
});

// ============================================
// String Literal Tests
// ============================================

test("stringLiteral(): wraps simple strings", () => {
  assert.strictEqual(stringLiteral("hello"), "'hello'");
  assert.strictEqual(stringLiteral("world"), "'world'");
});

test("stringLiteral(): escapes single quotes", () => {
  assert.strictEqual(stringLiteral("it's"), "E'it\\'s'");
  assert.strictEqual(stringLiteral("don't"), "E'don\\'t'");
});

test("stringLiteral(): escapes backslashes", () => {
  assert.strictEqual(stringLiteral("back\\slash"), "E'back\\\\slash'");
});

test("stringLiteral(): escapes newlines", () => {
  assert.strictEqual(stringLiteral("line1\nline2"), "E'line1\\nline2'");
});

test("stringLiteral(): escapes carriage returns", () => {
  assert.strictEqual(stringLiteral("line1\rline2"), "E'line1\\rline2'");
});

test("stringLiteral(): escapes tabs", () => {
  assert.strictEqual(stringLiteral("col1\tcol2"), "E'col1\\tcol2'");
});

test("stringLiteral(): escapes multiple special characters", () => {
  assert.strictEqual(
    stringLiteral("it's\na\ttest\\"),
    "E'it\\'s\\na\\ttest\\\\'",
  );
});

test("stringLiteral(): handles empty string", () => {
  assert.strictEqual(stringLiteral(""), "''");
});

// ============================================
// DrizzleLogger Class Tests
// ============================================

test("DrizzleLogger: can be instantiated directly", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const { getLogger: getLogtapeLogger } = await import("@logtape/logtape");
    const logtapeLogger = getLogtapeLogger(["custom"]);
    const drizzleLogger = new DrizzleLogger(logtapeLogger, "info");

    drizzleLogger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["custom"]);
    assert.strictEqual(logs[0].level, "info");
  } finally {
    await cleanup();
  }
});

// ============================================
// Complex Query Tests
// ============================================

test("logQuery(): handles INSERT with multiple values", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "INSERT INTO users (name, email, age) VALUES ($1, $2, $3)",
      ["John Doe", "john@example.com", 30],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "INSERT INTO users (name, email, age) VALUES ('John Doe', 'john@example.com', 30)",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles UPDATE with JSON data", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "UPDATE users SET metadata = $1 WHERE id = $2",
      [{ role: "admin", permissions: ["read", "write"] }, 1],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      'UPDATE users SET metadata = \'{"role":"admin","permissions":["read","write"]}\' WHERE id = 1',
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles DELETE query", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "DELETE FROM sessions WHERE expires_at < $1",
      [new Date("2024-01-01T00:00:00.000Z")],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "DELETE FROM sessions WHERE expires_at < '2024-01-01T00:00:00.000Z'",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles array parameter for IN clause", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "SELECT * FROM users WHERE id = ANY($1)",
      [[1, 2, 3]],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM users WHERE id = ANY(ARRAY[1, 2, 3])",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles null parameter", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "UPDATE users SET deleted_at = $1 WHERE id = $2",
      [null, 1],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "UPDATE users SET deleted_at = NULL WHERE id = 1",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles boolean parameters", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery(
      "SELECT * FROM users WHERE active = $1 AND verified = $2",
      [true, false],
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM users WHERE active = 't' AND verified = 'f'",
    );
  } finally {
    await cleanup();
  }
});

// ============================================
// Edge Cases
// ============================================

test("logQuery(): handles empty string parameter", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("INSERT INTO users (name) VALUES ($1)", [""]);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "INSERT INTO users (name) VALUES ('')",
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles very long query", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    const longValue = "x".repeat(10000);
    logger.logQuery("SELECT * FROM users WHERE data = $1", [longValue]);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].properties.params, [longValue]);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      `SELECT * FROM users WHERE data = '${longValue}'`,
    );
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles multiple consecutive calls", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    logger.logQuery("SELECT 1", []);
    logger.logQuery("SELECT 2", []);
    logger.logQuery("SELECT 3", []);

    assert.strictEqual(logs.length, 3);
    assert.strictEqual(logs[0].properties.formattedQuery, "SELECT 1");
    assert.strictEqual(logs[1].properties.formattedQuery, "SELECT 2");
    assert.strictEqual(logs[2].properties.formattedQuery, "SELECT 3");
  } finally {
    await cleanup();
  }
});

test("logQuery(): handles high placeholder numbers", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    // Build an array of 100 items: index 0="a", index 9="j", index 99="hundred"
    const params = Array(100).fill("x");
    params[0] = "a"; // $1
    params[9] = "j"; // $10
    params[99] = "hundred"; // $100
    logger.logQuery(
      "SELECT * FROM t WHERE a=$1 AND b=$10 AND c=$100",
      params,
    );

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(
      logs[0].properties.formattedQuery,
      "SELECT * FROM t WHERE a='a' AND b='j' AND c='hundred'",
    );
  } finally {
    await cleanup();
  }
});

test("serialize(): handles special number values", () => {
  assert.strictEqual(serialize(Infinity), "Infinity");
  assert.strictEqual(serialize(-Infinity), "-Infinity");
  assert.strictEqual(serialize(NaN), "NaN");
});

test("serialize(): handles negative bigint", () => {
  assert.strictEqual(serialize(BigInt(-9007199254740991)), "-9007199254740991");
});

test("serialize(): handles deeply nested objects", () => {
  const nested = { a: { b: { c: { d: 1 } } } };
  assert.strictEqual(serialize(nested), '\'{"a":{"b":{"c":{"d":1}}}}\'');
});

test("serialize(): handles array with null and undefined", () => {
  assert.strictEqual(
    serialize([1, null, undefined, 2]),
    "ARRAY[1, NULL, NULL, 2]",
  );
});

test("stringLiteral(): handles backspace and form feed", () => {
  assert.strictEqual(stringLiteral("a\bb"), "E'a\\bb'");
  assert.strictEqual(stringLiteral("a\fb"), "E'a\\fb'");
});

// ============================================
// Type Compatibility Tests
// ============================================

test("getLogger(): returns Drizzle Logger interface compatible object", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogger();

    // Drizzle's Logger interface only requires logQuery method
    // Verify it matches the expected signature
    const drizzleLogger: { logQuery(query: string, params: unknown[]): void } =
      logger;

    assert.strictEqual(typeof drizzleLogger.logQuery, "function");

    // Verify it can be called with the expected arguments
    drizzleLogger.logQuery("SELECT 1", []);
    drizzleLogger.logQuery("SELECT $1", ["test"]);
    drizzleLogger.logQuery("SELECT $1, $2", [1, "two"]);
  } finally {
    await cleanup();
  }
});

test("Logger interface: logQuery returns void", async () => {
  const { cleanup } = await setupLogtape();
  try {
    const logger = getLogger();
    const result = logger.logQuery("SELECT 1", []);

    assert.strictEqual(result, undefined);
  } finally {
    await cleanup();
  }
});

// ============================================
// Readonly Category Tests
// ============================================

test("getLogger(): handles readonly string array category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const category = ["app", "db"] as const;
    const logger = getLogger({ category });
    logger.logQuery("SELECT 1", []);

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["app", "db"]);
  } finally {
    await cleanup();
  }
});
