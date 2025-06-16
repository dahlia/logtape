import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { getDisplayWidth, wcwidth } from "./wcwidth.ts";

const test = suite(import.meta);

test("wcwidth() basic functionality", () => {
  // Control characters should return -1
  assertEquals(wcwidth(0x0A), -1); // newline
  assertEquals(wcwidth(0x1B), -1); // escape

  // Regular ASCII characters should return 1
  assertEquals(wcwidth(0x41), 1); // 'A'
  assertEquals(wcwidth(0x20), 1); // space

  // Wide characters should return 2
  assertEquals(wcwidth(0x2728), 2); // ✨ sparkles
  assertEquals(wcwidth(0x274C), 2); // ❌ cross mark
  assertEquals(wcwidth(0x4E00), 2); // CJK ideograph

  // Zero-width characters should return 0
  assertEquals(wcwidth(0x0300), 0); // combining grave accent
  assertEquals(wcwidth(0xFE0F), 0); // variation selector
});

test("getDisplayWidth() with regular text", () => {
  assertEquals(getDisplayWidth("hello"), 5);
  assertEquals(getDisplayWidth(""), 0);
  assertEquals(getDisplayWidth("A"), 1);
});

test("getDisplayWidth() with emojis", () => {
  assertEquals(getDisplayWidth("✨"), 2);
  assertEquals(getDisplayWidth("❌"), 2);
  assertEquals(getDisplayWidth("🔍"), 2);
  assertEquals(getDisplayWidth("⚠️"), 2); // includes variation selector
});

test("getDisplayWidth() with mixed content", () => {
  assertEquals(getDisplayWidth("A✨B"), 4); // 1 + 2 + 1
  assertEquals(getDisplayWidth("test ❌ end"), 11); // 4 + 1 + 2 + 1 + 3
});

test("getDisplayWidth() with ANSI codes", () => {
  assertEquals(getDisplayWidth("\x1b[31mred\x1b[0m"), 3);
  assertEquals(getDisplayWidth("\x1b[1m\x1b[31mbold red\x1b[0m"), 8);
  assertEquals(getDisplayWidth("\x1b[38;2;255;0;0m✨\x1b[0m"), 2);
});

test("getDisplayWidth() with zero-width characters", () => {
  // Combining diacritical marks should not add to width
  assertEquals(getDisplayWidth("e\u0301"), 1); // e with acute accent
  assertEquals(getDisplayWidth("a\u0300"), 1); // a with grave accent
});

test("getDisplayWidth() with CJK characters", () => {
  assertEquals(getDisplayWidth("你好"), 4); // two CJK chars = 4 width
  assertEquals(getDisplayWidth("こんにちは"), 10); // five hiragana = 10 width
  assertEquals(getDisplayWidth("안녕"), 4); // two hangul = 4 width
});
