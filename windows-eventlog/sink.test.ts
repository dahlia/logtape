import { suite } from "@alinea/suite";
import type { LogLevel, LogRecord } from "@logtape/logtape";
import { assertEquals, assertThrows } from "@std/assert";
import { delay } from "@std/async/delay";
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

type Describe = (name: string, run: () => void | Promise<void>) => void;

const test: Describe & { skip?: Describe } = suite(import.meta);

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
    assertThrows(
      () => validateWindowsPlatform(),
      WindowsPlatformError,
      "Windows Event Log sink can only be used on Windows platforms",
    );
  }
});

test("getPlatform() returns correct platform", () => {
  const platform = getPlatform();
  assertEquals(typeof platform, "string");
  // Should return a non-empty string
  assertEquals(platform.length > 0, true);
});

test("isWindows() returns boolean", () => {
  const result = isWindows();
  assertEquals(typeof result, "boolean");

  // Should match platform check
  const platform = getPlatform();
  const expectedWindows = platform === "windows" || platform === "win32";
  assertEquals(result, expectedWindows);
});

test("getRuntime() returns valid runtime", () => {
  const runtime = getRuntime();
  const validRuntimes = ["deno", "node", "bun", "unknown"];
  assertEquals(validRuntimes.includes(runtime), true);
});

(skipWindowsTests ? test.skip! : test)(
  "getWindowsEventLogSink() with basic options",
  () => {
    const options: WindowsEventLogSinkOptions = {
      sourceName: "LogTape-Test-Basic",
    };

    const sink = getWindowsEventLogSink(options);
    assertEquals(typeof sink, "function");
    assertEquals(typeof sink[Symbol.dispose], "function");
  },
);

(skipWindowsTests ? test.skip! : test)(
  "getWindowsEventLogSink() with advanced options",
  () => {
    const options: WindowsEventLogSinkOptions = {
      sourceName: "LogTape-Test-Advanced",
      logName: "Application",
      eventIdMapping: {
        error: 1001,
        warning: 2001,
        info: 3001,
      },
    };

    const sink = getWindowsEventLogSink(options);
    assertEquals(typeof sink, "function");
    assertEquals(typeof sink[Symbol.dispose], "function");
  },
);

(skipWindowsTests ? test.skip! : test)("Basic logging test", () => {
  const sink = getWindowsEventLogSink({
    sourceName: "LogTape-Integration-Test",
  });

  const record = createLogRecord("info", ["Integration test message"]);

  // This should not throw
  sink(record);

  // Clean up
  sink[Symbol.dispose]();
});

(skipWindowsTests ? test.skip! : test)("Multiple log levels", () => {
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

(skipWindowsTests ? test.skip! : test)("Structured data logging", () => {
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

(skipWindowsTests ? test.skip! : test)("Unicode and special characters", () => {
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

(skipWindowsTests ? test.skip! : test)("Custom event ID mapping", () => {
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

(skipWindowsTests ? test.skip! : test)("Sink disposal", () => {
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

(skipWindowsTests ? test.skip! : test)(
  "PowerShell verification - actual event logging",
  async () => {
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
    assertEquals(
      events.length,
      1,
      `Expected exactly 1 event, but found ${events.length}`,
    );

    const event = events[0];

    // Verify event properties - message may be null due to Windows Event Log behavior
    assertEquals(
      event.level,
      "Warning",
      `Expected level 'Warning', but got '${event.level}'`,
    );
    assertEquals(
      event.providerName,
      uniqueSource,
      `Expected provider '${uniqueSource}', but got '${event.providerName}'`,
    );

    // Note: Windows Event Log may not preserve custom messages without proper message resource files
    // The important verification is that the event exists with correct source and level

    // Verify timestamp is recent (within last 5 minutes)
    const eventTime = new Date(event.timeCreated);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    assertEquals(
      eventTime > fiveMinutesAgo,
      true,
      `Event timestamp should be recent, but was ${event.timeCreated}`,
    );
  },
);

(skipWindowsTests ? test.skip! : test)(
  "PowerShell verification - multiple log levels",
  async () => {
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
    assertEquals(
      events.length,
      3,
      `Expected exactly 3 events, but found ${events.length}`,
    );

    // Verify we have events at the expected levels (sorted by level for consistency)
    const eventLevels = events.map((e) => e.level).sort();
    const expectedLevels = testCases.map((tc) => tc.expectedLevel).sort();

    assertEquals(
      eventLevels,
      expectedLevels,
      `Expected levels ${expectedLevels.join(", ")}, but got ${
        eventLevels.join(", ")
      }`,
    );

    // Verify all events have correct provider and recent timestamps
    for (const event of events) {
      assertEquals(
        event.providerName,
        uniqueSource,
        `Expected provider '${uniqueSource}', but got '${event.providerName}'`,
      );

      const eventTime = new Date(event.timeCreated);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      assertEquals(
        eventTime > fiveMinutesAgo,
        true,
        `Event timestamp should be recent, but was ${event.timeCreated}`,
      );
    }
  },
);

test("WindowsPlatformError properties", () => {
  const error = new WindowsPlatformError("linux");
  assertEquals(error.name, "WindowsPlatformError");
  assertEquals(error.message.includes("linux"), true);
  assertEquals(error.message.includes("Windows platforms"), true);
});

test("WindowsEventLogError properties", () => {
  const error = new WindowsEventLogError("Test error");
  assertEquals(error.name, "WindowsEventLogError");
  assertEquals(error.message.includes("Test error"), true);
});

test("WindowsEventLogError with cause", () => {
  const cause = new Error("Original error");
  const error = new WindowsEventLogError("Wrapper error", cause);
  assertEquals(error.cause, cause);
});
