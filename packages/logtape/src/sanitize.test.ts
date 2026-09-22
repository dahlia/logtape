import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeControlSequences } from "./sanitize.ts";

test("sanitizeControlSequences() leaves ordinary text untouched", () => {
  assert.strictEqual(sanitizeControlSequences(""), "");
  assert.strictEqual(
    sanitizeControlSequences("Hello, world!"),
    "Hello, world!",
  );
  assert.strictEqual(
    sanitizeControlSequences("한글 · 漢字 · 😀"),
    "한글 · 漢字 · 😀",
  );
});

test("sanitizeControlSequences() escapes cursor and screen control", () => {
  assert.strictEqual(
    sanitizeControlSequences("\x1b[1A\x1b[2K[INF] auth: login ok"),
    "\\x1b[1A\\x1b[2K[INF] auth: login ok",
  );
  assert.strictEqual(sanitizeControlSequences("\x1b[2J"), "\\x1b[2J");
  assert.strictEqual(sanitizeControlSequences("\x1b[6n"), "\\x1b[6n");
});

test("sanitizeControlSequences() escapes OSC sequences", () => {
  assert.strictEqual(
    sanitizeControlSequences("\x1b]0;pwned\x07"),
    "\\x1b]0;pwned\\x07",
  );
});

test("sanitizeControlSequences() escapes a bare ESC", () => {
  assert.strictEqual(sanitizeControlSequences("\x1b"), "\\x1b");
  assert.strictEqual(sanitizeControlSequences("a\x1b"), "a\\x1b");
  assert.strictEqual(sanitizeControlSequences("\x1b[1"), "\\x1b[1");
});

test("sanitizeControlSequences() preserves SGR sequences by default", () => {
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31mred\x1b[0m"),
    "\x1b[31mred\x1b[0m",
  );
  assert.strictEqual(
    sanitizeControlSequences("\x1b[38;2;1;2;3mrgb\x1b[0m"),
    "\x1b[38;2;1;2;3mrgb\x1b[0m",
  );
  // An SGR sequence must not shield a following control sequence, and the
  // color it left open is closed at the end.
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31m\x1b[2J"),
    "\x1b[31m\\x1b[2J\x1b[0m",
  );
});

test("sanitizeControlSequences() closes an SGR sequence left open", () => {
  // Conceal with no reset would otherwise hide everything printed afterwards.
  assert.strictEqual(
    sanitizeControlSequences("oops\x1b[8m"),
    "oops\x1b[8m\x1b[0m",
  );
  // A sequence the text already closed is not closed twice.
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31mred\x1b[0m"),
    "\x1b[31mred\x1b[0m",
  );
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31mred\x1b[m"),
    "\x1b[31mred\x1b[m",
  );
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31mred\x1b[0;0m"),
    "\x1b[31mred\x1b[0;0m",
  );
  // A reset followed by a new attribute is still open.
  assert.strictEqual(
    sanitizeControlSequences("\x1b[0;31mred"),
    "\x1b[0;31mred\x1b[0m",
  );
  // Nothing is appended when no SGR was preserved.
  assert.strictEqual(sanitizeControlSequences("plain"), "plain");
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31mred", { sgr: "escape" }),
    "\\x1b[31mred",
  );
});

test('sanitizeControlSequences() escapes SGR when sgr is "escape"', () => {
  assert.strictEqual(
    sanitizeControlSequences("\x1b[31mred\x1b[0m", { sgr: "escape" }),
    "\\x1b[31mred\\x1b[0m",
  );
});

test("sanitizeControlSequences() preserves newlines and tabs by default", () => {
  assert.strictEqual(sanitizeControlSequences("a\nb\r\nc\td"), "a\nb\r\nc\td");
});

test('sanitizeControlSequences() escapes newlines when newlines is "escape"', () => {
  assert.strictEqual(
    sanitizeControlSequences("a\nb\r\nc\td", { newlines: "escape" }),
    "a\\nb\\r\\nc\td",
  );
});

test("sanitizeControlSequences() escapes C1 controls", () => {
  // U+009B is an 8-bit CSI and U+009D an 8-bit OSC: the same introducers as
  // ESC `[` and ESC `]`, which a terminal in UTF-8 mode honors.
  assert.strictEqual(sanitizeControlSequences("\u009b2J"), "\\x9b2J");
  assert.strictEqual(
    sanitizeControlSequences("\u009d0;pwned\u0007"),
    "\\x9d0;pwned\\x07",
  );
  assert.strictEqual(sanitizeControlSequences("a\u0080b"), "a\\x80b");
  assert.strictEqual(sanitizeControlSequences("a\u009fb"), "a\\x9fb");
  // NEL (U+0085) is a line break, and is escaped whatever `newlines` says.
  assert.strictEqual(sanitizeControlSequences("a\u0085b"), "a\\x85b");
  // U+00A0 is printable and must survive.
  assert.strictEqual(sanitizeControlSequences("a\u00a0b"), "a\u00a0b");
});

test("sanitizeControlSequences() escapes other C0 controls and DEL", () => {
  assert.strictEqual(sanitizeControlSequences("a\x00b"), "a\\x00b");
  assert.strictEqual(sanitizeControlSequences("a\x07b"), "a\\x07b");
  assert.strictEqual(sanitizeControlSequences("a\x08b"), "a\\x08b");
  assert.strictEqual(sanitizeControlSequences("a\x1fb"), "a\\x1fb");
  assert.strictEqual(sanitizeControlSequences("a\x7fb"), "a\\x7fb");
});
