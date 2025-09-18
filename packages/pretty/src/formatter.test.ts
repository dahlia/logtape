import { suite } from "@alinea/suite";
import type { LogRecord } from "@logtape/logtape";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertMatch } from "@std/assert/match";
import { assertStringIncludes } from "@std/assert/string-includes";
import {
  type CategoryColorMap,
  getPrettyFormatter,
  prettyFormatter,
} from "./formatter.ts";

const test = suite(import.meta);

function createLogRecord(
  level: LogRecord["level"],
  category: string[],
  message: LogRecord["message"],
  timestamp: number = Date.now(),
  properties: Record<string, unknown> = {},
): LogRecord {
  // Convert message array to template strings format for rawMessage
  const rawMessage = typeof message === "string"
    ? message
    : message.filter((_, i) => i % 2 === 0).join("{}");

  return {
    level,
    category,
    message,
    rawMessage,
    properties,
    timestamp,
  };
}

test("prettyFormatter basic output", () => {
  const record = createLogRecord(
    "info",
    ["app", "server"],
    ["Server started on port ", 3000],
  );

  const output = prettyFormatter(record);

  // Should contain emoji, level, category, and message
  assertMatch(output, /✨/);
  assertMatch(output, /info/); // Default level format is "full"
  assertMatch(output, /app·server/);
  assertMatch(output, /Server started on port/);
  assertMatch(output, /3000/);
});

test("getPrettyFormatter() with no colors", () => {
  const formatter = getPrettyFormatter({ colors: false });
  const record = createLogRecord(
    "error",
    ["app", "auth"],
    ["Authentication failed"],
  );

  const output = formatter(record);

  // Should not contain ANSI escape codes
  assertEquals(output.includes("\x1b["), false);
  assertMatch(output, /❌ error/); // Default level format is "full"
  assertMatch(output, /app·auth/);
});

test("getPrettyFormatter() with custom icons", () => {
  const formatter = getPrettyFormatter({
    icons: {
      info: "ℹ️ ",
      error: "🔥",
    },
  });

  const infoRecord = createLogRecord("info", ["test"], ["Info message"]);
  const errorRecord = createLogRecord("error", ["test"], ["Error message"]);

  assertMatch(formatter(infoRecord), /ℹ️/);
  assertMatch(formatter(errorRecord), /🔥/);
});

test("getPrettyFormatter() with no icons", () => {
  const formatter = getPrettyFormatter({ icons: false });
  const record = createLogRecord("info", ["test"], ["Message"]);

  const output = formatter(record);

  // Should not contain any emoji
  assertEquals(output.includes("✨"), false);
  assertEquals(output.includes("🐛"), false);
});

test("getPrettyFormatter() with timestamp", () => {
  const timestamp = new Date("2024-01-15T12:34:56Z").getTime();

  // Time only - note UTC timezone handling
  const timeFormatter = getPrettyFormatter({ timestamp: "time" });
  const record = createLogRecord("info", ["test"], ["Message"], timestamp);
  const timeOutput = timeFormatter(record);
  assertMatch(timeOutput, /\d{2}:\d{2}:\d{2}/);

  // Date and time
  const datetimeFormatter = getPrettyFormatter({ timestamp: "date-time" });
  const datetimeOutput = datetimeFormatter(record);
  assertMatch(datetimeOutput, /2024-01-15/);
  assertMatch(datetimeOutput, /\d{2}:\d{2}:\d{2}/);

  // Custom formatter
  const customFormatter = getPrettyFormatter({
    timestamp: (ts) => new Date(ts).toISOString(),
  });
  const customOutput = customFormatter(record);
  assertMatch(customOutput, /2024-01-15T12:34:56/);

  // Test function returning null
  const nullFormatter = getPrettyFormatter({
    timestamp: () => null,
  });
  const nullOutput = nullFormatter(record);
  assertEquals(nullOutput.includes("2024"), false);

  // Test none timestamp
  const noneFormatter = getPrettyFormatter({ timestamp: "none" });
  const noneOutput = noneFormatter(record);
  assertEquals(noneOutput.includes("2024"), false);
});

test("getPrettyFormatter() category truncation", () => {
  const formatter = getPrettyFormatter({
    categoryWidth: 15,
    categoryTruncate: "middle",
  });

  const record = createLogRecord(
    "info",
    ["app", "server", "http", "middleware"],
    ["Request processed"],
  );

  const output = formatter(record);
  // Category should be truncated and contain app
  assertMatch(output, /app/);
  assertMatch(output, /…/);
});

test("getPrettyFormatter() with null colors", () => {
  const formatter = getPrettyFormatter({
    levelColors: {
      info: null, // No color
    },
    categoryColor: null,
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);
  // Should work without errors and have basic formatting
  assertStringIncludes(result, "info"); // Default level format is "full"
  assertStringIncludes(result, "test");
  assertStringIncludes(result, "Message");
});

test("getPrettyFormatter() with values", () => {
  const formatter = getPrettyFormatter();
  const record = createLogRecord(
    "debug",
    ["app"],
    ["User data: ", { id: 123, name: "John" }, ", array: ", [1, 2, 3]],
  );

  const output = formatter(record);
  assertMatch(output, /User data:/);
  assertMatch(output, /123/);
  assertMatch(output, /John/);
  assertMatch(output, /1.*2.*3/);
});

test("getPrettyFormatter() all log levels", () => {
  const formatter = getPrettyFormatter();

  const levels: LogRecord["level"][] = [
    "trace",
    "debug",
    "info",
    "warning",
    "error",
    "fatal",
  ];
  const expectedIcons = ["🔍", "🐛", "✨", "⚡", "❌", "💀"];

  levels.forEach((level, i) => {
    const record = createLogRecord(level, ["test"], [`${level} message`]);
    const output = formatter(record);

    assertMatch(output, new RegExp(expectedIcons[i]));
    // Check for full level format (default)
    assertMatch(output, new RegExp(level));
  });
});

test("getPrettyFormatter() alignment", () => {
  const formatter = getPrettyFormatter({ align: true, colors: false });

  const records = [
    createLogRecord("info", ["app"], ["Short"]),
    createLogRecord("warning", ["app"], ["Longer level"]),
  ];

  const outputs = records.map((r) => formatter(r));

  // With alignment, warning (longer) should have more padding before the category
  // Just check that both outputs contain the expected content
  assertMatch(outputs[0], /✨ info.*app.*Short/); // Default level format is "full"
  assertMatch(outputs[1], /⚡.*warning.*app.*Longer level/); // Default level format is "full"
});

test("getPrettyFormatter() no alignment", () => {
  const formatter = getPrettyFormatter({ align: false, colors: false });

  const record = createLogRecord("info", ["app"], ["Message"]);
  const output = formatter(record);

  // Should still be formatted but without padding
  assertMatch(output, /✨ info app Message/); // Default level format is "full"
});

test("getPrettyFormatter() with hex colors", () => {
  const formatter = getPrettyFormatter({
    levelColors: {
      info: "#00ff00", // Bright green
      error: "#ff0000", // Bright red
    },
    categoryColor: "#888888",
    messageColor: "#cccccc",
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);
  // Should contain true color ANSI codes for hex colors
  assertStringIncludes(result, "\x1b[38;2;0;255;0m"); // #00ff00 converted to RGB
});

test("getPrettyFormatter() with rgb colors", () => {
  const formatter = getPrettyFormatter({
    levelColors: {
      info: "rgb(255,128,0)", // Orange
    },
    timestampColor: "rgb(100,100,100)",
    timestamp: "time",
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);
  // Should contain true color ANSI codes for RGB colors
  assertStringIncludes(result, "\x1b[38;2;255;128;0m"); // rgb(255,128,0)
  assertStringIncludes(result, "\x1b[38;2;100;100;100m"); // timestamp color
});

test("getPrettyFormatter() with level formats", () => {
  const abbr = getPrettyFormatter({ level: "ABBR" });
  const full = getPrettyFormatter({ level: "FULL" });
  const letter = getPrettyFormatter({ level: "L" });
  const custom = getPrettyFormatter({ level: (level) => `[${level}]` });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const abbrResult = abbr(record);
  const fullResult = full(record);
  const letterResult = letter(record);
  const customResult = custom(record);

  assertStringIncludes(abbrResult, "INF");
  assertStringIncludes(fullResult, "INFO");
  assertStringIncludes(letterResult, "I");
  assertStringIncludes(customResult, "[info]");
});

test("getPrettyFormatter() with extended timestamp formats", () => {
  const timestamp = new Date("2023-05-15T10:30:00.000Z").getTime();
  const record = createLogRecord("info", ["test"], ["Message"], timestamp);

  // Test all TextFormatterOptions timestamp formats
  const dateTimeTimezone = getPrettyFormatter({
    timestamp: "date-time-timezone",
  });
  const dateTimeTz = getPrettyFormatter({ timestamp: "date-time-tz" });
  const dateTime = getPrettyFormatter({ timestamp: "date-time" });
  const timeTimezone = getPrettyFormatter({ timestamp: "time-timezone" });
  const timeTz = getPrettyFormatter({ timestamp: "time-tz" });
  const rfc3339 = getPrettyFormatter({ timestamp: "rfc3339" });
  const dateOnly = getPrettyFormatter({ timestamp: "date" });
  const datetime = getPrettyFormatter({ timestamp: "date-time" });
  const none = getPrettyFormatter({ timestamp: "none" });
  const disabled = getPrettyFormatter({ timestamp: "disabled" });

  const dateTimeTimezoneResult = dateTimeTimezone(record);
  const dateTimeTzResult = dateTimeTz(record);
  const dateTimeResult = dateTime(record);
  const timeTimezoneResult = timeTimezone(record);
  const timeTzResult = timeTz(record);
  const rfc3339Result = rfc3339(record);
  const dateOnlyResult = dateOnly(record);
  const datetimeResult = datetime(record);
  const noneResult = none(record);
  const disabledResult = disabled(record);

  // Check that appropriate timestamps are included
  assertStringIncludes(dateTimeTimezoneResult, "2023-05-15");
  assertStringIncludes(dateTimeTimezoneResult, "+00:00");
  assertStringIncludes(dateTimeTzResult, "2023-05-15");
  assertStringIncludes(dateTimeTzResult, "+00");
  assertStringIncludes(dateTimeResult, "2023-05-15");
  assertStringIncludes(timeTimezoneResult, "10:30:00");
  assertStringIncludes(timeTzResult, "10:30:00");
  assertStringIncludes(rfc3339Result, "2023-05-15T10:30:00.000Z");
  assertStringIncludes(dateOnlyResult, "2023-05-15");
  assertStringIncludes(datetimeResult, "2023-05-15 10:30:00");

  // Check that none/disabled don't include timestamps
  assertEquals(noneResult.includes("2023"), false);
  assertEquals(disabledResult.includes("2023"), false);
});

test("getPrettyFormatter() with styles", () => {
  const formatter = getPrettyFormatter({
    levelStyle: "bold",
    categoryStyle: "italic",
    messageStyle: "underline",
    timestampStyle: "strikethrough",
    timestamp: "time",
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);
  // Should contain ANSI style codes
  assertStringIncludes(result, "\x1b[1m"); // bold
  assertStringIncludes(result, "\x1b[3m"); // italic
  assertStringIncludes(result, "\x1b[4m"); // underline
  assertStringIncludes(result, "\x1b[9m"); // strikethrough
});

test("getPrettyFormatter() with custom category separator", () => {
  const formatter = getPrettyFormatter({
    categorySeparator: ">",
    colors: false,
  });

  const record = createLogRecord("info", ["app", "web", "server"], ["Message"]);
  const result = formatter(record);
  assertStringIncludes(result, "app>web>server");
});

test("getPrettyFormatter() with ANSI colors", () => {
  const formatter = getPrettyFormatter({
    levelColors: {
      info: "green",
      error: "red",
    },
    categoryColor: "blue",
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);
  // Should contain ANSI color codes
  assertStringIncludes(result, "\x1b[32m"); // green
  assertStringIncludes(result, "\x1b[34m"); // blue
});

test("Color helper functions with 3-digit hex", () => {
  const formatter = getPrettyFormatter({
    levelColors: {
      info: "#fff", // 3-digit hex
    },
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);
  // Should contain converted RGB codes
  assertStringIncludes(result, "\x1b[38;2;255;255;255m"); // #fff -> rgb(255,255,255)
});

test("getPrettyFormatter() with category color mapping", () => {
  const categoryColorMap: CategoryColorMap = new Map([
    [["app", "auth"], "#ff6b6b"], // red for app.auth.*
    [["app", "db"], "#4ecdc4"], // teal for app.db.*
    [["app"], "#45b7d1"], // blue for app.* (fallback)
    [["lib"], "#96ceb4"], // green for lib.*
  ]);

  const formatter = getPrettyFormatter({
    categoryColorMap,
    colors: true,
  });

  // Test exact match
  const authRecord = createLogRecord("info", ["app", "auth", "login"], [
    "User logged in",
  ]);
  const authResult = formatter(authRecord);
  assertStringIncludes(authResult, "\x1b[38;2;255;107;107m"); // #ff6b6b

  // Test prefix fallback
  const miscRecord = createLogRecord("info", ["app", "utils"], [
    "Utility called",
  ]);
  const miscResult = formatter(miscRecord);
  assertStringIncludes(miscResult, "\x1b[38;2;69;183;209m"); // #45b7d1

  // Test different prefix
  const libRecord = createLogRecord("info", ["lib", "http"], ["HTTP request"]);
  const libResult = formatter(libRecord);
  assertStringIncludes(libResult, "\x1b[38;2;150;206;180m"); // #96ceb4
});

test("Category color mapping precedence", () => {
  const categoryColorMap: CategoryColorMap = new Map([
    [["app", "auth", "jwt"], "#ff0000"], // Most specific
    [["app", "auth"], "#00ff00"], // Less specific
    [["app"], "#0000ff"], // Least specific
  ]);

  const formatter = getPrettyFormatter({
    categoryColorMap,
    colors: true,
  });

  // Should match most specific pattern
  const jwtRecord = createLogRecord("info", ["app", "auth", "jwt", "verify"], [
    "Token verified",
  ]);
  const jwtResult = formatter(jwtRecord);
  assertStringIncludes(jwtResult, "\x1b[38;2;255;0;0m"); // #ff0000

  // Should match less specific pattern
  const authRecord = createLogRecord("info", ["app", "auth", "session"], [
    "Session created",
  ]);
  const authResult = formatter(authRecord);
  assertStringIncludes(authResult, "\x1b[38;2;0;255;0m"); // #00ff00

  // Should match least specific pattern
  const appRecord = createLogRecord("info", ["app", "server"], [
    "Server started",
  ]);
  const appResult = formatter(appRecord);
  assertStringIncludes(appResult, "\x1b[38;2;0;0;255m"); // #0000ff
});

test("Category color mapping with no match", () => {
  const categoryColorMap: CategoryColorMap = new Map([
    [["app"], "#ff0000"],
  ]);

  const formatter = getPrettyFormatter({
    categoryColorMap,
    categoryColor: "#00ff00", // fallback color
    colors: true,
  });

  // Should use fallback color for non-matching category
  const record = createLogRecord("info", ["system", "kernel"], [
    "Kernel message",
  ]);
  const result = formatter(record);
  assertStringIncludes(result, "\x1b[38;2;0;255;0m"); // fallback #00ff00
});

test("Interpolated values with proper color reset/reapply", () => {
  const formatter = getPrettyFormatter({
    messageColor: "#ffffff",
    messageStyle: "dim",
    colors: true,
  });

  const record = createLogRecord("info", ["test"], [
    "User data: ",
    { id: 123, name: "John" },
    ", status: ",
    "active",
  ]);

  const result = formatter(record);

  // Should contain proper color reset/reapply around interpolated values
  // The exact ANSI codes depend on inspect() output, but we should see resets
  assertStringIncludes(result, "\x1b[0m"); // Reset code should be present
  assertStringIncludes(result, "\x1b[2m"); // Dim style should be reapplied
  assertStringIncludes(result, "\x1b[38;2;255;255;255m"); // White color should be reapplied
});

test("Multiple styles combination", () => {
  const formatter = getPrettyFormatter({
    levelStyle: ["bold", "underline"],
    categoryStyle: ["dim", "italic"],
    messageStyle: ["bold", "strikethrough"],
    timestampStyle: ["dim", "underline"],
    timestamp: "time",
    colors: true,
  });

  const record = createLogRecord("info", ["test"], ["Message"]);
  const result = formatter(record);

  // Should contain multiple ANSI style codes combined
  assertStringIncludes(result, "\x1b[1m"); // bold
  assertStringIncludes(result, "\x1b[4m"); // underline
  assertStringIncludes(result, "\x1b[2m"); // dim
  assertStringIncludes(result, "\x1b[3m"); // italic
  assertStringIncludes(result, "\x1b[9m"); // strikethrough
});

("Bun" in globalThis ? test.skip : test)(
  "Word wrapping enabled by default",
  () => {
    const formatter = getPrettyFormatter({
      colors: false,
    });

    const longMessage =
      "This is a very long message that would normally exceed the typical console width and should be wrapped when word wrapping is enabled by default.";
    const record = createLogRecord("info", ["test"], [longMessage]);
    const result = formatter(record);

    // Should contain multiple line breaks due to wrapping
    const lines = result.split("\n");
    assert(lines.length > 2); // More than just content + trailing newline due to wrapping

    // First line should contain the beginning of the message
    assert(lines[0].includes("This is a very long message"));
  },
);

test("Word wrapping can be disabled", () => {
  const formatter = getPrettyFormatter({
    colors: false,
    wordWrap: false,
  });

  const longMessage =
    "This is a very long message that would normally exceed the typical console width but should not be wrapped when word wrapping is explicitly disabled.";
  const record = createLogRecord("info", ["test"], [longMessage]);
  const result = formatter(record);

  // Should not contain any line breaks in the message (only the trailing newline)
  const lines = result.split("\n");
  assertEquals(lines.length, 2); // One content line + one empty line from trailing newline
  assertStringIncludes(lines[0], longMessage);
});

test("Word wrapping with 80", () => {
  const formatter = getPrettyFormatter({
    wordWrap: 80,
    colors: false,
    align: false,
  });

  const longMessage =
    "This is a very long message that should be wrapped at approximately 80 characters when word wrapping is enabled with the default width setting.";
  const record = createLogRecord("info", ["test"], [longMessage]);
  const result = formatter(record);

  // Should contain multiple lines due to wrapping
  const lines = result.split("\n");
  assert(lines.length > 2); // More than just content + trailing newline

  // Each content line should be roughly within the wrap width
  const contentLines = lines.filter((line) => line.length > 0);
  for (const line of contentLines) {
    assert(line.length <= 85); // Allow some tolerance for word boundaries
  }
});

test("Word wrapping with custom width", () => {
  const formatter = getPrettyFormatter({
    wordWrap: 40,
    colors: false,
    align: false,
  });

  const longMessage =
    "This is a message that should be wrapped at 40 characters maximum width.";
  const record = createLogRecord("info", ["test"], [longMessage]);
  const result = formatter(record);

  // Should contain multiple lines due to aggressive wrapping
  const lines = result.split("\n");
  assert(lines.length > 2);

  // Each content line should be within 40 characters
  const contentLines = lines.filter((line) => line.length > 0);
  for (const line of contentLines) {
    assert(line.length <= 45); // Allow some tolerance
  }
});

test("Word wrapping with proper indentation", () => {
  const formatter = getPrettyFormatter({
    wordWrap: 50,
    colors: false,
    align: false,
  });

  const longMessage =
    "This is a long message that should wrap with proper indentation to align with the message column.";
  const record = createLogRecord("info", ["app"], [longMessage]);
  const result = formatter(record);

  const lines = result.split("\n");
  const contentLines = lines.filter((line) => line.length > 0);

  // Should have multiple lines due to wrapping
  assert(contentLines.length > 1);

  // First line starts with icon
  assert(contentLines[0].startsWith("✨ info"));

  // Check that lines are properly wrapped at word boundaries
  // With align: false, the format should be "✨ info app message..."
  // and continuation lines should be properly indented
  assert(
    contentLines.length >= 2,
    "Should have at least 2 lines from wrapping",
  );
});

test("getPrettyFormatter() with consistent icon spacing", () => {
  // Test with custom icons of different display widths
  const formatter = getPrettyFormatter({
    icons: {
      info: "ℹ️", // 2 width emoji
      warning: "!", // 1 width character
      error: "🚨🚨", // 4 width (2 emojis)
    },
    colors: false,
    align: true,
    wordWrap: 50,
  });

  const longMessage = "This is a long message that should wrap consistently";

  const infoRecord = createLogRecord("info", ["test"], [longMessage]);
  const warningRecord = createLogRecord("warning", ["test"], [longMessage]);
  const errorRecord = createLogRecord("error", ["test"], [longMessage]);

  const infoResult = formatter(infoRecord);
  const warningResult = formatter(warningRecord);
  const errorResult = formatter(errorRecord);

  // Split into lines and get continuation lines
  const infoLines = infoResult.split("\n").filter((line) => line.length > 0);
  const warningLines = warningResult.split("\n").filter((line) =>
    line.length > 0
  );
  const errorLines = errorResult.split("\n").filter((line) => line.length > 0);

  // All should have multiple lines due to wrapping
  assert(infoLines.length > 1, "Info should wrap to multiple lines");
  assert(warningLines.length > 1, "Warning should wrap to multiple lines");
  assert(errorLines.length > 1, "Error should wrap to multiple lines");

  // Check that continuation lines are indented to the same position
  // despite different icon widths
  if (
    infoLines.length > 1 && warningLines.length > 1 && errorLines.length > 1
  ) {
    const infoIndent = infoLines[1].search(/\S/);
    const warningIndent = warningLines[1].search(/\S/);
    const errorIndent = errorLines[1].search(/\S/);

    // All continuation lines should start at the same position
    assertEquals(
      infoIndent,
      warningIndent,
      "Info and warning should have same indentation",
    );
    assertEquals(
      warningIndent,
      errorIndent,
      "Warning and error should have same indentation",
    );
  }
});

test("getPrettyFormatter() with automatic width detection", () => {
  const formatter = getPrettyFormatter({
    wordWrap: true, // Auto-detect width
    colors: false,
  });

  const longMessage =
    "This is a long message that should wrap at the detected terminal width";
  const record = createLogRecord("info", ["test"], [longMessage]);
  const result = formatter(record);

  // Should have wrapped at some reasonable width
  const lines = result.split("\n").filter((line) => line.length > 0);
  assert(lines.length >= 1, "Should have at least one line");

  // If wrapping occurred, continuation lines should be properly indented
  if (lines.length > 1) {
    const firstLine = lines[0];
    const continuationLine = lines[1];

    assert(firstLine.includes("✨"), "First line should contain icon");
    assert(
      continuationLine.startsWith(" "),
      "Continuation line should be indented",
    );
  }
});

test("getPrettyFormatter() with multiline interpolated values", () => {
  const formatter = getPrettyFormatter({
    wordWrap: 60,
    colors: false,
    align: true,
  });

  // Create an error that will have multiline output
  const error = new Error("Test error message");
  const record = createLogRecord("error", ["test"], [
    "Exception occurred: ",
    error,
  ]);
  const result = formatter(record);

  const lines = result.split("\n").filter((line) => line.length > 0);

  // Should have multiple lines due to error stack trace
  assert(
    lines.length >= 2,
    "Should have multiple lines for error with stack trace",
  );

  // First line should contain our message and start of error
  assert(
    lines[0].includes("Exception occurred:"),
    "First line should contain our message",
  );
  assert(lines[0].includes("Error:"), "First line should contain error start");

  // Error message might be on first or second line depending on wrapping
  const fullOutput = result;
  assert(
    fullOutput.includes("Test error message"),
    "Output should contain error message",
  );

  // Check that continuation lines are properly indented (should start with significant whitespace)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();
    const indentLength = line.length - trimmedLine.length;
    assert(
      indentLength >= 10,
      `Line ${i} should be indented (has ${indentLength} spaces)`,
    );
  }

  // Should contain stack trace somewhere
  const stackTraceLine = lines.find((line) => line.trim().startsWith("at "));
  assert(stackTraceLine, "Should contain a stack trace line");
  const trimmedStackTrace = stackTraceLine.trimStart();
  const stackIndentLength = stackTraceLine.length - trimmedStackTrace.length;
  assert(stackIndentLength >= 10, "Stack trace should be properly indented");
});

test("getPrettyFormatter() with multiline interpolated values (no align)", () => {
  const formatter = getPrettyFormatter({
    wordWrap: 50,
    colors: false,
    align: false,
  });

  const error = new Error("Test error");
  const record = createLogRecord("error", ["app"], [
    "Error: ",
    error,
  ]);
  const result = formatter(record);

  const lines = result.split("\n").filter((line) => line.length > 0);

  // Should have multiple lines
  assert(lines.length >= 2, "Should have multiple lines for error");

  // Check that stack trace lines are properly indented relative to the message start
  const firstLine = lines[0];
  assert(
    firstLine.includes("❌ error app Error:"),
    "First line should contain prefix and message start",
  );

  if (lines.length > 1) {
    const stackTraceLine = lines.find((line) => line.trim().startsWith("at "));
    if (stackTraceLine) {
      // Stack trace should be indented to align with message content
      assert(
        stackTraceLine.length > stackTraceLine.trimStart().length,
        "Stack trace line should be indented",
      );
    }
  }
});

test("properties set to true", () => {
  const formatter = getPrettyFormatter({
    properties: true,
    colors: false,
    inspectOptions: { colors: false },
  });

  const record = createLogRecord("info", ["test"], ["FooBar"], Date.now(), {
    foo: "bar",
    bar: "baz",
  });
  const result = formatter(record);

  // Should contain multiple lines due to wrapping
  const lines = result.split("\n");
  assertEquals(lines.length, 4); // Normal log line + formatted properties + newline
  assertEquals(
    lines[1].trim(),
    "Deno" in globalThis ? 'foo: "bar"' : "foo: 'bar'",
  );
  assertEquals(
    lines[2].trim(),
    "Deno" in globalThis ? 'bar: "baz"' : "bar: 'baz'",
  );
});

test("properties with long keys (regression test for #87)", () => {
  const formatter = getPrettyFormatter({
    properties: true,
    colors: false,
    inspectOptions: { colors: false },
    align: false, // Disable alignment for predictable output
  });

  // Use fixed timestamp for reproducible output
  const fixedTimestamp = new Date("2024-01-15T00:00:00Z").getTime();

  // Create properties with very long keys that will cause negative padding
  const longKeyProps: Record<string, unknown> = {
    VERY_LONG_PROPERTY_NAME_THAT_EXCEEDS_INDENT_WIDTH: "value1",
    ANOTHER_EXTREMELY_LONG_KEY_NAME_FOR_TESTING: "value2",
    SHORT: "value3",
  };

  const record = createLogRecord(
    "info",
    ["test"],
    ["Test message"],
    fixedTimestamp,
    longKeyProps,
  );

  // After the fix, this should not throw an error
  const result = formatter(record);

  // Check the exact output format
  // Note: Long keys have 0 padding, SHORT key still has some padding
  const expectedOutput = `✨ info test Test message
VERY_LONG_PROPERTY_NAME_THAT_EXCEEDS_INDENT_WIDTH: ${
    "Deno" in globalThis ? '"value1"' : "'value1'"
  }
ANOTHER_EXTREMELY_LONG_KEY_NAME_FOR_TESTING: ${
    "Deno" in globalThis ? '"value2"' : "'value2'"
  }
      SHORT: ${"Deno" in globalThis ? '"value3"' : "'value3'"}
`;

  assertEquals(result, expectedOutput);
});
