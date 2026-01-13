import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { LogLevel, LogRecord } from "@logtape/logtape";
import { getWindowsEventLogSink } from "./mod.ts";
import {
  getPlatform,
  getRuntime,
  isWindows,
  validateWindowsPlatform,
} from "./platform.ts";
import { verifyEventsLogged } from "./powershell.ts";
import {
  WindowsEventLogError,
  type WindowsEventLogSinkOptions,
  WindowsPlatformError,
} from "./types.ts";

// Skip Windows-specific integration tests on non-Windows platforms
const skipWindowsTests = !isWindows();

if (skipWindowsTests) {
  console.warn(
    `⚠️  Skipping Windows Event Log integration tests. ` +
      `Current platform: ${getPlatform()}, Runtime: ${getRuntime()}. ` +
      `These tests only run on Windows platforms.`,
  );
}

// Helper function to create test log records
function createLogRecord(
  level: LogLevel = "info",
  // deno-lint-ignore no-explicit-any
  message: any[] = ["Test message"],
  properties: Record<string, unknown> = {},
): LogRecord {
  return {
    level: level,
    category: ["test"],
    message,
    rawMessage: message.length === 1 && typeof message[0] === "string"
      ? message[0]
      : "Test message",
    timestamp: Date.now(),
    properties,
  };
}

test("validateWindowsPlatform() on Windows", () => {
  if (isWindows()) {
    // Should not throw on Windows
    validateWindowsPlatform();
  } else {
    // Should throw on non-Windows
    assert.throws(
      () => validateWindowsPlatform(),
      WindowsPlatformError,
      "Windows Event Log sink can only be used on Windows platforms",
    );
  }
});

test("getPlatform() returns correct platform", () => {
  const platform = getPlatform();
  assert.strictEqual(typeof platform, "string");
  // Should return a non-empty string
  assert.ok(platform.length > 0);
});

test("isWindows() returns boolean", () => {
  const result = isWindows();
  assert.strictEqual(typeof result, "boolean");

  // Should match platform check
  const platform = getPlatform();
  const expectedWindows = platform === "windows" || platform === "win32";
  assert.strictEqual(result, expectedWindows);
});

test("getRuntime() returns valid runtime", () => {
  const runtime = getRuntime();
  const validRuntimes = ["deno", "node", "bun", "unknown"];
  assert.ok(validRuntimes.includes(runtime));
});

test(
  "getWindowsEventLogSink() with basic options",
  { skip: skipWindowsTests },
  () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (skipWindowsTests) return;

    const options: WindowsEventLogSinkOptions = {
      sourceName: "LogTape-Test-Basic",
    };

    const sink = getWindowsEventLogSink(options);
    assert.strictEqual(typeof sink, "function");
    assert.strictEqual(typeof sink[Symbol.dispose], "function");
  },
);

test(
  "getWindowsEventLogSink() with advanced options",
  { skip: skipWindowsTests },
  () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (skipWindowsTests) return;

    const options: WindowsEventLogSinkOptions = {
      sourceName: "LogTape-Test-Advanced",
      eventIdMapping: {
        error: 1001,
        warning: 2001,
        info: 3001,
      },
    };

    const sink = getWindowsEventLogSink(options);
    assert.strictEqual(typeof sink, "function");
    assert.strictEqual(typeof sink[Symbol.dispose], "function");
  },
);

test("Basic logging test", { skip: skipWindowsTests }, () => {
  // Workaround for Bun not supporting skip option yet:
  // https://github.com/oven-sh/bun/issues/19412
  if (skipWindowsTests) return;

  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-Integration-Test",
  });

  const record = createLogRecord("info", ["Integration test message"]);

  // This should not throw
  sink(record);

  // Clean up
  sink[Symbol.dispose]();
});

test("Multiple log levels", { skip: skipWindowsTests }, () => {
  // Workaround for Bun not supporting skip option yet:
  // https://github.com/oven-sh/bun/issues/19412
  if (skipWindowsTests) return;

  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-Levels-Test",
  });

  const levels = ["fatal", "error", "warning", "info", "debug", "trace"];

  for (const level of levels) {
    const record = createLogRecord(level as LogLevel, [
      `Test ${level} message`,
    ]);
    sink(record);
  }

  // Clean up
  sink[Symbol.dispose]();
});

test("Structured data logging", { skip: skipWindowsTests }, () => {
  // Workaround for Bun not supporting skip option yet:
  // https://github.com/oven-sh/bun/issues/19412
  if (skipWindowsTests) return;

  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-Structured-Test",
  });

  const record = createLogRecord(
    "info",
    ["User action: {action}", { action: "login" }],
    {
      userId: 12345,
      ip: "192.168.1.100",
      userAgent: "TestAgent/1.0",
    },
  );

  sink(record);

  // Clean up
  sink[Symbol.dispose]();
});

test("Unicode and special characters", { skip: skipWindowsTests }, () => {
  // Workaround for Bun not supporting skip option yet:
  // https://github.com/oven-sh/bun/issues/19412
  if (skipWindowsTests) return;

  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-Unicode-Test",
  });

  const record = createLogRecord(
    "info",
    ["Unicode test: 한글 테스트 🎉 Special chars: !@#$%^&*()"],
    { emoji: "🚀", korean: "한글", special: "!@#$%^&*()" },
  );

  sink(record);

  // Clean up
  sink[Symbol.dispose]();
});

test("Custom event ID mapping", { skip: skipWindowsTests }, () => {
  // Workaround for Bun not supporting skip option yet:
  // https://github.com/oven-sh/bun/issues/19412
  if (skipWindowsTests) return;

  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-CustomIds-Test",
    eventIdMapping: {
      error: 9001,
      warning: 9002,
      info: 9003,
    },
  });

  const record = createLogRecord("error", ["Custom event ID test"]);
  sink(record);

  // Clean up
  sink[Symbol.dispose]();
});

test("Sink disposal", { skip: skipWindowsTests }, () => {
  // Workaround for Bun not supporting skip option yet:
  // https://github.com/oven-sh/bun/issues/19412
  if (skipWindowsTests) return;

  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-Disposal-Test",
  });

  // Use the sink
  const record = createLogRecord("info", ["Disposal test message"]);
  sink(record);

  // Dispose should not throw
  sink[Symbol.dispose]();

  // Test that using sink after disposal works (creates new instance)
  sink(createLogRecord("info", ["After disposal"]));

  // Dispose again to clean up the new instance
  sink[Symbol.dispose]();
});

test(
  "PowerShell verification - actual event logging",
  { skip: skipWindowsTests },
  async () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (skipWindowsTests) return;

    const uniqueSource = `LogTape-Verification-${Date.now()}`;
    const testMessage = `Verification test message ${Date.now()}`;

    const sink = getWindowsEventLogSink({
      sourceName: uniqueSource,
    });

    // Log a unique message
    const record = createLogRecord("warning", [testMessage]);
    sink(record);

    // Give the async initialization and write a moment to complete
    await delay(500);

    // Clean up sink
    sink[Symbol.dispose]();

    // Give Windows Event Log a moment to process the event
    await delay(500);

    // Verify the event was actually logged using PowerShell
    const events = await verifyEventsLogged(uniqueSource, 5);

    // We should find exactly one event
    assert.strictEqual(
      events.length,
      1,
      `Expected exactly 1 event, but found ${events.length}`,
    );

    const event = events[0];

    // Verify event properties - message may be null due to Windows Event Log behavior
    assert.strictEqual(
      event.level,
      "Warning",
      `Expected level 'Warning', but got '${event.level}'`,
    );
    assert.strictEqual(
      event.providerName,
      uniqueSource,
      `Expected provider '${uniqueSource}', but got '${event.providerName}'`,
    );

    // Note: Windows Event Log may not preserve custom messages without proper message resource files
    // The important verification is that the event exists with correct source and level

    // Verify timestamp is recent (within last 5 minutes)
    const eventTime = new Date(event.timeCreated);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    assert.ok(
      eventTime > fiveMinutesAgo,
      `Event timestamp should be recent, but was ${event.timeCreated}`,
    );
  },
);

test(
  "PowerShell verification - multiple log levels",
  { skip: skipWindowsTests },
  async () => {
    // Workaround for Bun not supporting skip option yet:
    // https://github.com/oven-sh/bun/issues/19412
    if (skipWindowsTests) return;
    const uniqueSource = `LogTape-Levels-${Date.now()}`;

    const sink = getWindowsEventLogSink({
      sourceName: uniqueSource,
    });

    // Log messages at different levels with unique identifiers
    const testCases = [
      { level: "error" as LogLevel, expectedLevel: "Error" },
      { level: "warning" as LogLevel, expectedLevel: "Warning" },
      { level: "info" as LogLevel, expectedLevel: "Information" },
    ];

    for (const testCase of testCases) {
      const record = createLogRecord(testCase.level, [
        `${testCase.level.toUpperCase()} test message`,
      ]);
      sink(record);
    }

    // Give the async initialization and writes a moment to complete
    await delay(500);

    // Clean up sink
    sink[Symbol.dispose]();

    // Give Windows Event Log a moment to process the events
    await delay(500);

    // Verify the events were actually logged
    const events = await verifyEventsLogged(uniqueSource, 10);

    // We should find exactly 3 events
    assert.strictEqual(
      events.length,
      3,
      `Expected exactly 3 events, but found ${events.length}`,
    );

    // Verify we have events at the expected levels (sorted by level for consistency)
    const eventLevels = events.map((e) => e.level).sort();
    const expectedLevels = testCases.map((tc) => tc.expectedLevel).sort();

    assert.deepStrictEqual(
      eventLevels,
      expectedLevels,
      `Expected levels ${expectedLevels.join(", ")}, but got ${
        eventLevels.join(", ")
      }`,
    );

    // Verify all events have correct provider and recent timestamps
    for (const event of events) {
      assert.strictEqual(
        event.providerName,
        uniqueSource,
        `Expected provider '${uniqueSource}', but got '${event.providerName}'`,
      );

      const eventTime = new Date(event.timeCreated);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      assert.ok(
        eventTime > fiveMinutesAgo,
        `Event timestamp should be recent, but was ${event.timeCreated}`,
      );
    }
  },
);

test("WindowsPlatformError properties", () => {
  const error = new WindowsPlatformError("linux");
  assert.strictEqual(error.name, "WindowsPlatformError");
  assert.ok(error.message.includes("linux"));
  assert.ok(error.message.includes("Windows platforms"));
});

test("WindowsEventLogError properties", () => {
  const error = new WindowsEventLogError("Test error");
  assert.strictEqual(error.name, "WindowsEventLogError");
  assert.ok(error.message.includes("Test error"));
});

test("WindowsEventLogError with cause", () => {
  const cause = new Error("Original error");
  const error = new WindowsEventLogError("Wrapper error", cause);
  assert.strictEqual(error.cause, cause);
});
