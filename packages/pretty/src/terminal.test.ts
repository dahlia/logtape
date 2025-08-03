import { suite } from "@alinea/suite";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import {
  getOptimalWordWrapWidth,
  getTerminalWidth,
  isTerminal,
} from "./terminal.ts";

const test = suite(import.meta);

test("isTerminal() returns boolean", () => {
  const result = isTerminal();
  assert(typeof result === "boolean", "isTerminal should return a boolean");
});

test("getTerminalWidth() returns number or null", () => {
  const result = getTerminalWidth();
  assert(
    result === null || (typeof result === "number" && result > 0),
    "getTerminalWidth should return null or a positive number",
  );
});

test("getOptimalWordWrapWidth() returns default when not in terminal", () => {
  // We can't easily mock the function, so we'll test with a large default
  // to distinguish from common terminal widths
  const result = getOptimalWordWrapWidth(123);

  assert(
    typeof result === "number" && result > 0,
    "getOptimalWordWrapWidth should return a positive number",
  );

  // If we're not in a terminal (which is likely in test environment),
  // we should get the default value
  if (!isTerminal()) {
    assertEquals(result, 123, "Should return default when not in terminal");
  }
});

test("getOptimalWordWrapWidth() uses reasonable default", () => {
  const result = getOptimalWordWrapWidth();

  assert(
    typeof result === "number" && result > 0,
    "Should return a positive number",
  );

  assert(
    result >= 20 && result <= 1000,
    "Should return a reasonable terminal width (20-1000 columns)",
  );
});

test("getOptimalWordWrapWidth() respects custom default", () => {
  const customDefault = 150;
  const result = getOptimalWordWrapWidth(customDefault);

  // If not in terminal, should return custom default
  if (!isTerminal()) {
    assertEquals(result, customDefault);
  } else {
    // If in terminal, should return detected width (which may differ)
    assert(typeof result === "number" && result > 0);
  }
});
