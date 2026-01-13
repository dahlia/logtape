import assert from "node:assert/strict";
import test from "node:test";
import { getDisplayWidth, wcwidth } from "./wcwidth.ts";

test("wcwidth() basic functionality", () => {
  // Control characters should return -1
  assert.strictEqual(wcwidth(0x0A), -1); // newline
  assert.strictEqual(wcwidth(0x1B), -1); // escape

  // Regular ASCII characters should return 1
  assert.strictEqual(wcwidth(0x41), 1); // 'A'
  assert.strictEqual(wcwidth(0x20), 1); // space

  // Wide characters should return 2
  assert.strictEqual(wcwidth(0x2728), 2); // ✨ sparkles
  assert.strictEqual(wcwidth(0x274C), 2); // ❌ cross mark
  assert.strictEqual(wcwidth(0x4E00), 2); // CJK ideograph

  // Zero-width characters should return 0
  assert.strictEqual(wcwidth(0x0300), 0); // combining grave accent
  assert.strictEqual(wcwidth(0xFE0F), 0); // variation selector
});

test("getDisplayWidth() with regular text", () => {
  assert.strictEqual(getDisplayWidth("hello"), 5);
  assert.strictEqual(getDisplayWidth(""), 0);
  assert.strictEqual(getDisplayWidth("A"), 1);
});

test("getDisplayWidth() with emojis", () => {
  assert.strictEqual(getDisplayWidth("✨"), 2);
  assert.strictEqual(getDisplayWidth("❌"), 2);
  assert.strictEqual(getDisplayWidth("🔍"), 2);
  assert.strictEqual(getDisplayWidth("⚠️"), 2); // includes variation selector
});

test("getDisplayWidth() with mixed content", () => {
  assert.strictEqual(getDisplayWidth("A✨B"), 4); // 1 + 2 + 1
  assert.strictEqual(getDisplayWidth("test ❌ end"), 11); // 4 + 1 + 2 + 1 + 3
});

test("getDisplayWidth() with ANSI codes", () => {
  assert.strictEqual(getDisplayWidth("\x1b[31mred\x1b[0m"), 3);
  assert.strictEqual(getDisplayWidth("\x1b[1m\x1b[31mbold red\x1b[0m"), 8);
  assert.strictEqual(getDisplayWidth("\x1b[38;2;255;0;0m✨\x1b[0m"), 2);
});

test("getDisplayWidth() with zero-width characters", () => {
  // Combining diacritical marks should not add to width
  assert.strictEqual(getDisplayWidth("e\u0301"), 1); // e with acute accent
  assert.strictEqual(getDisplayWidth("a\u0300"), 1); // a with grave accent
});

test("getDisplayWidth() with CJK characters", () => {
  assert.strictEqual(getDisplayWidth("你好"), 4); // two CJK chars = 4 width
  assert.strictEqual(getDisplayWidth("こんにちは"), 10); // five hiragana = 10 width
  assert.strictEqual(getDisplayWidth("안녕"), 4); // two hangul = 4 width
});
