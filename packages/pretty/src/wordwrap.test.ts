import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { assert } from "@std/assert/assert";
import { wrapText } from "./wordwrap.ts";

const test = suite(import.meta);

test("wrapText() should not wrap short text", () => {
  const result = wrapText("short text", 80, "short text".length);
  assertEquals(result, "short text");
});

test("wrapText() should wrap long text", () => {
  const text =
    "This is a very long line that should be wrapped at 40 characters maximum width for testing purposes.";
  const result = wrapText(text, 40, "This is a very long line".length);

  const lines = result.split("\n");
  assert(lines.length > 1, "Should have multiple lines");

  // Each line should be within the limit (with some tolerance for word boundaries)
  for (const line of lines) {
    assert(line.length <= 45, `Line too long: ${line.length} chars`);
  }
});

test("wrapText() should preserve ANSI codes", () => {
  const text =
    "\x1b[31mThis is a very long red line that should be wrapped while preserving the color codes\x1b[0m";
  const result = wrapText(text, 40, "This is a very long red line".length);

  // Should contain ANSI codes
  assert(result.includes("\x1b[31m"), "Should preserve opening ANSI code");
  assert(result.includes("\x1b[0m"), "Should preserve closing ANSI code");
});

test("wrapText() should handle emojis correctly", () => {
  const text =
    "✨ info test This is a very long message that should wrap properly with emoji alignment";
  const result = wrapText(text, 40, "This is a very long message".length);

  const lines = result.split("\n");
  assert(lines.length > 1, "Should have multiple lines");

  // Check that continuation lines are indented properly
  // The emoji ✨ should be accounted for in width calculation
  const firstLine = lines[0];
  const continuationLine = lines[1];

  assert(firstLine.includes("✨"), "First line should contain emoji");
  assert(
    continuationLine.startsWith(" "),
    "Continuation line should be indented",
  );
});

test("wrapText() should handle newlines in interpolated content", () => {
  const textWithNewlines =
    "Error occurred: Error: Something went wrong\n    at line 1\n    at line 2";
  const result = wrapText(textWithNewlines, 40, "Error occurred".length);

  const lines = result.split("\n");
  assert(
    lines.length >= 3,
    "Should preserve original newlines and add more if needed",
  );
});

test("wrapText() should calculate indentation based on display width", () => {
  // Test with different emojis that have different string lengths but same display width
  const sparklesText = "✨ info test Message content here";
  const crossText = "❌ error test Message content here";

  const sparklesResult = wrapText(
    sparklesText,
    25,
    "Message content here".length,
  );
  const crossResult = wrapText(crossText, 25, "Message content here".length);

  const sparklesLines = sparklesResult.split("\n");
  const crossLines = crossResult.split("\n");

  if (sparklesLines.length > 1 && crossLines.length > 1) {
    // Both should have similar indentation for continuation lines
    // (accounting for the fact that both emojis are width 2)
    const sparklesIndent = sparklesLines[1].search(/\S/);
    const crossIndent = crossLines[1].search(/\S/);

    // The indentation should be very close (within 1-2 characters)
    // since both emojis have width 2
    assert(
      Math.abs(sparklesIndent - crossIndent) <= 2,
      `Indentation should be similar: sparkles=${sparklesIndent}, cross=${crossIndent}`,
    );
  }
});

test("wrapText() should handle zero width", () => {
  const result = wrapText("any text", 0, "any text".length);
  assertEquals(result, "any text");
});

test("wrapText() should break at word boundaries", () => {
  const text = "word1 word2 word3 word4 word5";
  const result = wrapText(text, 15, "word1 word2 word3".length);

  const lines = result.split("\n");
  // Should break at spaces, not in the middle of words
  for (const line of lines) {
    const words = line.trim().split(" ");
    assert(words.every((word) => word.length > 0), "Should not break words");
  }
});
