import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import {
  type Filter,
  getLevelFilter,
  getThrottlingFilter,
  toFilter,
} from "./filter.ts";
import { debug, error, fatal, info, trace, warning } from "./fixtures.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";
import { getLogger, LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";

const logLevelArb: fc.Arbitrary<LogLevel> = fc.constantFrom<LogLevel>(
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
);

test("getLevelFilter()", () => {
  const noneFilter = getLevelFilter(null);
  assert.ok(!noneFilter(fatal));
  assert.ok(!noneFilter(error));
  assert.ok(!noneFilter(warning));
  assert.ok(!noneFilter(info));
  assert.ok(!noneFilter(debug));
  assert.ok(!noneFilter(trace));

  const fatalFilter = getLevelFilter("fatal");
  assert.ok(fatalFilter(fatal));
  assert.ok(!fatalFilter(error));
  assert.ok(!fatalFilter(warning));
  assert.ok(!fatalFilter(info));
  assert.ok(!fatalFilter(debug));
  assert.ok(!fatalFilter(trace));

  const errorFilter = getLevelFilter("error");
  assert.ok(errorFilter(fatal));
  assert.ok(errorFilter(error));
  assert.ok(!errorFilter(warning));
  assert.ok(!errorFilter(info));
  assert.ok(!errorFilter(debug));
  assert.ok(!errorFilter(trace));

  const warningFilter = getLevelFilter("warning");
  assert.ok(warningFilter(fatal));
  assert.ok(warningFilter(error));
  assert.ok(warningFilter(warning));
  assert.ok(!warningFilter(info));
  assert.ok(!warningFilter(debug));
  assert.ok(!warningFilter(trace));

  const infoFilter = getLevelFilter("info");
  assert.ok(infoFilter(fatal));
  assert.ok(infoFilter(error));
  assert.ok(infoFilter(warning));
  assert.ok(infoFilter(info));
  assert.ok(!infoFilter(debug));
  assert.ok(!infoFilter(trace));

  const debugFilter = getLevelFilter("debug");
  assert.ok(debugFilter(fatal));
  assert.ok(debugFilter(error));
  assert.ok(debugFilter(warning));
  assert.ok(debugFilter(info));
  assert.ok(debugFilter(debug));
  assert.ok(!debugFilter(trace));

  const traceFilter = getLevelFilter("trace");
  assert.ok(traceFilter(fatal));
  assert.ok(traceFilter(error));
  assert.ok(traceFilter(warning));
  assert.ok(traceFilter(info));
  assert.ok(traceFilter(debug));
  assert.ok(traceFilter(trace));

  assert.throws(
    () => getLevelFilter("invalid" as LogLevel),
    TypeError,
    "Invalid log level: invalid.",
  );
});

test("getLevelFilter() accepts records at or above the minimum level", () => {
  fc.assert(
    fc.property(logLevelArb, logLevelArb, (minimum, level) => {
      const filter = getLevelFilter(minimum);

      assert.strictEqual(
        filter(recordWithLevel(level)),
        compareLogLevel(level, minimum) >= 0,
      );
    }),
  );
});

test("getLevelFilter() rejects every record when level is null", () => {
  fc.assert(
    fc.property(logLevelArb, (level) => {
      const filter = getLevelFilter(null);

      assert.strictEqual(filter(recordWithLevel(level)), false);
    }),
  );
});

test("toFilter()", () => {
  const hasJunk: Filter = (record) => record.category.includes("junk");
  assert.strictEqual(toFilter(hasJunk), hasJunk);

  const infoFilter = toFilter("info");
  assert.ok(!infoFilter(debug));
  assert.ok(infoFilter(info));
  assert.ok(infoFilter(warning));
});

test("toFilter() accepts records at or above a minimum level", () => {
  fc.assert(
    fc.property(logLevelArb, logLevelArb, (minimum, level) => {
      const filter = toFilter(minimum);

      assert.strictEqual(
        filter(recordWithLevel(level)),
        compareLogLevel(level, minimum) >= 0,
      );
    }),
  );
});

test("getThrottlingFilter() limits records in fixed windows", () => {
  let now = 1000;
  const filter = getThrottlingFilter({
    limit: 2,
    windowMs: 100,
    clock: () => now,
  });
  const record = recordWithRawMessage("Database failed for {tenant}");

  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);

  now = 1099;
  assert.strictEqual(filter(record), false);

  now = 1100;
  assert.strictEqual(filter(record), true);
});

test("getThrottlingFilter() uses a sliding window when configured", () => {
  let now = 0;
  const filter = getThrottlingFilter({
    limit: 2,
    windowMs: 100,
    mode: "sliding",
    clock: () => now,
  });
  const record = recordWithRawMessage("Database failed for {tenant}");

  assert.strictEqual(filter(record), true);
  now = 90;
  assert.strictEqual(filter(record), true);
  now = 99;
  assert.strictEqual(filter(record), false);
  now = 100;
  assert.strictEqual(filter(record), true);
  now = 189;
  assert.strictEqual(filter(record), false);
  now = 190;
  assert.strictEqual(filter(record), true);
});

test("getThrottlingFilter() does not shift sliding-window timestamps", () => {
  const filter = getThrottlingFilter({
    limit: 2,
    windowMs: 100,
    mode: "sliding",
    timeSource: "record",
  });
  const originalShift = Array.prototype.shift;
  let shiftCalled = false;

  Array.prototype.shift = function shift(
    this: unknown[],
  ): unknown | undefined {
    shiftCalled = true;
    return originalShift.call(this);
  };
  try {
    assert.strictEqual(filter(recordWithTimestamp(0)), true);
    assert.strictEqual(filter(recordWithTimestamp(10)), true);
    assert.strictEqual(filter(recordWithTimestamp(99)), false);
    assert.strictEqual(filter(recordWithTimestamp(100)), true);
  } finally {
    Array.prototype.shift = originalShift;
  }

  assert.strictEqual(shiftCalled, false);
});

test("getThrottlingFilter() does not splice sliding-window timestamps", () => {
  const filter = getThrottlingFilter({
    limit: 2,
    windowMs: 100,
    mode: "sliding",
    timeSource: "record",
  });
  const originalSplice = Array.prototype.splice;
  let spliceCalled = false;

  Array.prototype.splice = function splice(
    this: unknown[],
    start: number,
    deleteCount?: number,
    ...items: unknown[]
  ): unknown[] {
    spliceCalled = true;
    return originalSplice.call(this, start, deleteCount ?? 0, ...items);
  };
  try {
    assert.strictEqual(filter(recordWithTimestamp(0)), true);
    assert.strictEqual(filter(recordWithTimestamp(10)), true);
    assert.strictEqual(filter(recordWithTimestamp(100)), true);
    assert.strictEqual(filter(recordWithTimestamp(110)), true);
  } finally {
    Array.prototype.splice = originalSplice;
  }

  assert.strictEqual(spliceCalled, false);
});

test("getThrottlingFilter() can use record timestamps", () => {
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    timeSource: "record",
  });

  assert.strictEqual(filter(recordWithTimestamp(0)), true);
  assert.strictEqual(filter(recordWithTimestamp(99)), false);
  assert.strictEqual(filter(recordWithTimestamp(100)), true);
});

test("getThrottlingFilter() groups records by category, level, and template", () => {
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => 0,
  });

  assert.strictEqual(
    filter(recordWithRawMessage("Failed for {tenant}", {
      message: ["Failed for ", "alpha"],
    })),
    true,
  );
  assert.strictEqual(
    filter(recordWithRawMessage("Failed for {tenant}", {
      message: ["Failed for ", "beta"],
    })),
    false,
  );
  assert.strictEqual(
    filter(recordWithRawMessage("Failed for {tenant}", {
      category: ["other"],
    })),
    true,
  );
  assert.strictEqual(
    filter(recordWithRawMessage("Failed for {tenant}", { level: "error" })),
    true,
  );
  assert.strictEqual(filter(recordWithRawMessage("Other failure")), true);
});

test("getThrottlingFilter() default keys preserve category and template boundaries", () => {
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => 0,
  });
  const originalStringify = JSON.stringify;
  let stringifyCalled = false;

  JSON.stringify = (function stringify(
    value: unknown,
    replacer?:
      | ((this: unknown, key: string, value: unknown) => unknown)
      | (string | number)[]
      | null,
    space?: string | number,
  ): string | undefined {
    stringifyCalled = true;
    return originalStringify(
      value,
      replacer as (string | number)[] | null | undefined,
      space,
    );
  }) as typeof JSON.stringify;
  try {
    assert.strictEqual(
      filter(
        recordWithRawMessage(["bc", "d"] as unknown as TemplateStringsArray, {
          category: ["a"],
        }),
      ),
      true,
    );
    assert.strictEqual(
      filter(recordWithRawMessage(["d"] as unknown as TemplateStringsArray, {
        category: ["a", "bc"],
      })),
      true,
    );
    assert.strictEqual(filter(recordWithRawMessage("a\u0000b")), true);
    assert.strictEqual(filter(recordWithRawMessage("a\u0000b")), false);
  } finally {
    JSON.stringify = originalStringify;
  }

  assert.strictEqual(stringifyCalled, false);
});

test("getThrottlingFilter() supports custom keys", () => {
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    key: (record) => String(record.properties.tenant),
    clock: () => 0,
  });

  assert.strictEqual(
    filter(recordWithRawMessage("Failed", { properties: { tenant: "a" } })),
    true,
  );
  assert.strictEqual(
    filter(
      recordWithRawMessage("Failed again", { properties: { tenant: "a" } }),
    ),
    false,
  );
  assert.strictEqual(
    filter(recordWithRawMessage("Failed", { properties: { tenant: "b" } })),
    true,
  );
});

test("getThrottlingFilter() validates numeric options", () => {
  assert.throws(
    () => getThrottlingFilter({ limit: 0, windowMs: 100 }),
    RangeError,
  );
  assert.throws(
    () => getThrottlingFilter({ limit: 1, windowMs: 0 }),
    RangeError,
  );
  assert.throws(
    () => getThrottlingFilter({ limit: 1, windowMs: 100, maxKeys: 0 }),
    RangeError,
  );
});

test("getThrottlingFilter() evicts least recently used keys", () => {
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    maxKeys: 2,
    clock: () => 0,
  });
  const a = recordWithRawMessage("a");
  const b = recordWithRawMessage("b");
  const c = recordWithRawMessage("c");

  assert.strictEqual(filter(a), true);
  assert.strictEqual(filter(b), true);
  assert.strictEqual(filter(a), false);
  assert.strictEqual(filter(c), true);
  assert.strictEqual(filter(b), true);
});

test("getThrottlingFilter() emits summaries when suppression ends", () => {
  let now = 0;
  const summaries: LogRecord[] = [];
  const logger = {
    warning(message: string, properties: Record<string, unknown>) {
      summaries.push(recordWithRawMessage(message, { properties }));
    },
  };
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: { logger },
  });
  const firstRecord = recordWithRawMessage("Database failed for {tenant}", {
    message: ["Database failed for ", "alpha"],
  });
  const suppressedRecord1 = recordWithRawMessage(
    "Database failed for {tenant}",
    {
      message: ["Database failed for ", "beta"],
    },
  );
  const suppressedRecord2 = recordWithRawMessage(
    "Database failed for {tenant}",
    {
      message: ["Database failed for ", "gamma"],
    },
  );
  const nextRecord = recordWithRawMessage("Database failed for {tenant}", {
    message: ["Database failed for ", "delta"],
  });

  assert.strictEqual(filter(firstRecord), true);
  assert.strictEqual(filter(suppressedRecord1), false);
  assert.strictEqual(filter(suppressedRecord2), false);
  assert.deepStrictEqual(summaries, []);

  now = 100;
  assert.strictEqual(filter(nextRecord), true);
  assert.strictEqual(summaries.length, 1);
  const summary = summaries[0] as LogRecord;
  assert.deepStrictEqual(summary.properties.suppressed, 2);
  assert.deepStrictEqual(
    summary.properties.key,
    "c1:4:testl4:infors28:Database failed for {tenant}",
  );
  assert.strictEqual(summary.properties.firstRecord, firstRecord);
  assert.strictEqual(summary.properties.lastRecord, suppressedRecord2);
  assert.strictEqual(summary.properties.startTime, 0);
  assert.strictEqual(summary.properties.endTime, 100);
});

test("getThrottlingFilter() emits summaries when disposed", () => {
  let now = 0;
  const summaries: LogRecord[] = [];
  const logger = {
    error(message: string, properties: Record<string, unknown>) {
      summaries.push(
        recordWithRawMessage(message, { level: "error", properties }),
      );
    },
  };
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: {
      logger,
      level: "error",
      message: (summary) => `Suppressed ${summary.suppressed} records`,
    },
  });
  const record = recordWithRawMessage("Database failed");

  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);
  now = 250;
  filter[Symbol.dispose]();

  assert.strictEqual(summaries.length, 1);
  assert.deepStrictEqual(summaries[0].message, ["Suppressed 1 records"]);
  assert.strictEqual(summaries[0].level, "error");
  assert.strictEqual(summaries[0].properties.endTime, 250);
});

test("getThrottlingFilter() ignores missing summary logger methods", () => {
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => 0,
    summary: {
      logger: {},
      level: "error",
    },
  });
  const record = recordWithRawMessage("Database failed");

  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);
  assert.doesNotThrow(() => filter[Symbol.dispose]());
});

test("getThrottlingFilter() lets summary records pass through reentrantly", () => {
  const filterRef: { current?: ReturnType<typeof getThrottlingFilter> } = {};
  const logger = {
    warning(message: string, properties: Record<string, unknown>) {
      assert.ok(filterRef.current != null);
      assert.strictEqual(
        filterRef.current(recordWithRawMessage(message, { properties })),
        true,
      );
    },
  };
  let now = 0;
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: { logger },
  });
  filterRef.current = filter;
  const record = recordWithRawMessage("Database failed");

  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);

  now = 100;
  assert.strictEqual(filter(record), true);
});

test("getThrottlingFilter() recognizes copied summary properties reentrantly", () => {
  const filterRef: { current?: ReturnType<typeof getThrottlingFilter> } = {};
  let summaryCalls = 0;
  const logger = {
    warning(message: string, properties: Record<string, unknown>) {
      summaryCalls++;
      if (summaryCalls > 1) throw new Error("recursive summary");
      assert.ok(filterRef.current != null);
      assert.strictEqual(
        filterRef.current(recordWithRawMessage(message, {
          properties: { ...properties },
        })),
        true,
      );
    },
  };
  let now = 0;
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: { logger },
  });
  filterRef.current = filter;
  const summaryRecord = recordWithRawMessage(
    "Last log message was suppressed {suppressed} times.",
  );
  const record = recordWithRawMessage("Database failed");

  assert.strictEqual(filter(summaryRecord), true);
  assert.strictEqual(filter(summaryRecord), false);
  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);

  now = 100;
  assert.strictEqual(filter(record), true);
  assert.strictEqual(summaryCalls, 1);
});

test("getThrottlingFilter() recognizes standard logger summary records", () => {
  const root = LoggerImpl.getLogger();
  const summaryLogger = getLogger("summary");
  const sourceLogger = getLogger("source");
  const records: LogRecord[] = [];
  let now = 0;
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: { logger: summaryLogger },
  });

  try {
    root.filters.push(filter);
    root.sinks.push((record) => records.push(record));

    summaryLogger.warning(
      "Last log message was suppressed {suppressed} times.",
      { suppressed: 0 },
    );
    summaryLogger.warning(
      "Last log message was suppressed {suppressed} times.",
      { suppressed: 1 },
    );
    sourceLogger.info("Database failed");
    sourceLogger.info("Database failed");

    now = 100;
    assert.doesNotThrow(() => sourceLogger.info("Database failed"));
  } finally {
    root.resetDescendants();
  }

  const generatedSummaries = records.filter((record) =>
    record.properties.key != null
  );
  assert.strictEqual(generatedSummaries.length, 1);
  assert.strictEqual(generatedSummaries[0].properties.suppressed, 1);
  assert.strictEqual(
    generatedSummaries[0].properties.key,
    "c1:6:sourcel4:infors15:Database failed",
  );
});

test("getThrottlingFilter() throttles non-summary reentrant records", () => {
  const filterRef: { current?: ReturnType<typeof getThrottlingFilter> } = {};
  const nestedRecord = recordWithRawMessage("nested", {
    category: ["nested"],
  });
  const logger = {
    warning(message: string, properties: Record<string, unknown>) {
      assert.ok(filterRef.current != null);
      assert.strictEqual(filterRef.current(nestedRecord), true);
      assert.strictEqual(filterRef.current(nestedRecord), false);
      assert.strictEqual(
        filterRef.current(recordWithRawMessage(message, { properties })),
        true,
      );
    },
  };
  let now = 0;
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: { logger },
  });
  filterRef.current = filter;
  const record = recordWithRawMessage("Database failed");

  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);

  now = 100;
  assert.strictEqual(filter(record), true);
});

test("getThrottlingFilter() handles malformed summary record properties", () => {
  const filterRef: { current?: ReturnType<typeof getThrottlingFilter> } = {};
  const logger = {
    warning(message: string, properties: Record<string, unknown>) {
      assert.ok(filterRef.current != null);
      assert.strictEqual(
        filterRef.current({
          ...recordWithRawMessage(message, { properties }),
          properties: null as unknown as Record<string, unknown>,
        }),
        true,
      );
    },
  };
  let now = 0;
  const filter = getThrottlingFilter({
    limit: 1,
    windowMs: 100,
    clock: () => now,
    summary: { logger },
  });
  filterRef.current = filter;
  const record = recordWithRawMessage("Database failed");

  assert.strictEqual(filter(record), true);
  assert.strictEqual(filter(record), false);

  now = 100;
  assert.doesNotThrow(() => filter(record));
});

function recordWithLevel(level: LogLevel): LogRecord {
  return {
    level,
    category: ["test"],
    message: ["message"],
    rawMessage: "message",
    timestamp: 0,
    properties: {},
  };
}

function recordWithTimestamp(timestamp: number): LogRecord {
  return { ...recordWithLevel("info"), timestamp };
}

function recordWithRawMessage(
  rawMessage: string | TemplateStringsArray,
  options: {
    category?: readonly string[];
    level?: LogLevel;
    message?: readonly unknown[];
    timestamp?: number;
    properties?: Record<string, unknown>;
  } = {},
): LogRecord {
  return {
    category: options.category ?? ["test"],
    level: options.level ?? "info",
    message: options.message ??
      [typeof rawMessage === "string" ? rawMessage : rawMessage.join("{}")],
    rawMessage,
    timestamp: options.timestamp ?? 0,
    properties: options.properties ?? {},
  };
}
