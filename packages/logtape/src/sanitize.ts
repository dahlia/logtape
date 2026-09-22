/**
 * Options for neutralizing control characters and ANSI escape sequences in
 * formatted log output.
 *
 * Log messages and categories can carry attacker-influenced text.  When such
 * text reaches a terminal or a line-oriented log collector verbatim, it can
 * reposition the cursor, clear the screen, or start what looks like a separate
 * log record.  The built-in formatters therefore escape the dangerous
 * characters before emitting them.
 *
 * @since 2.0.23
 */
export interface SanitizationOptions {
  /**
   * Whether to escape SGR (Select Graphic Rendition) sequences, i.e. the
   * `` `\x1b[…m` `` sequences that set colors and text styles.
   *
   * These are purely presentational and cannot move the cursor or clear the
   * screen, so they are preserved by default; applications that log
   * pre-colored strings or captured subprocess output keep working.  Set this
   * to `"escape"` to neutralize them as well.
   *
   * A preserved sequence that the text left open is closed with a reset at the
   * end of the text.  A formatter sanitizes each literal message part on its
   * own, so styling opened in one part does not carry across an interpolated
   * value into the next; color the value itself, or the whole string, instead.
   *
   * @default `"preserve"`
   */
  readonly sgr?: "escape" | "preserve";

  /**
   * Whether to escape carriage returns (`` `\r` ``) and line feeds
   * (`` `\n` ``).
   *
   * Preserving them keeps multi-line messages such as stack traces readable,
   * which is why that is the default.  The trade-off is that an
   * attacker-controlled newline can emit a line that looks like a genuine log
   * record to tools that split on newlines.  Set this to `"escape"` when the
   * output is consumed by such a tool.
   *
   * @default `"preserve"`
   */
  readonly newlines?: "escape" | "preserve";
}

/**
 * The escape sequence emitted in place of a neutralized character.
 */
function escapeChar(charCode: number): string {
  if (charCode === 0x0a) return "\\n";
  if (charCode === 0x0d) return "\\r";
  if (charCode === 0x1b) return "\\x1b";
  return `\\x${charCode.toString(16).padStart(2, "0")}`;
}

/**
 * Whether a character needs escaping on its own, ignoring ESC, which is
 * handled separately because it may introduce a sequence worth preserving.
 */
function isDangerous(charCode: number, escapeNewlines: boolean): boolean {
  if (charCode === 0x09) return false; // Tab moves forward only; harmless.
  if (charCode === 0x0a || charCode === 0x0d) return escapeNewlines;
  if (charCode < 0x20 || charCode === 0x7f) return true;
  // C1 controls (U+0080–U+009F).  A terminal in UTF-8 mode maps these back to
  // 8-bit controls, so U+009B is CSI and U+009D is OSC: the same introducers
  // as ESC `[` and ESC `]`, in one code point.  None of them is printable, so
  // they are escaped whatever the options say.
  return charCode >= 0x80 && charCode <= 0x9f;
}

/**
 * Matches an SGR sequence anchored at the current position: CSI, its
 * parameter bytes, then the final byte `m`.
 */
// deno-lint-ignore no-control-regex
const sgrPattern = /^\x1b\[([0-9;:]*)m/;

/**
 * The SGR sequence that clears every attribute.
 */
const sgrReset = "\x1b[0m";

/**
 * Escapes control characters and ANSI escape sequences that would otherwise be
 * interpreted by a terminal or by a line-oriented log reader.
 *
 * A preserved SGR sequence that is left open is closed with `` `\x1b[0m` `` at
 * the end of the text, so that styling an attacker sets cannot carry over into
 * whatever is printed next.
 *
 * ESC itself is escaped rather than the whole sequence it introduces: once the
 * introducer is gone, the remaining bytes (`` `[2J` ``, for instance) render as
 * ordinary text, so no sequence needs to be parsed to its end.  The 8-bit C1
 * introducers (U+0080–U+009F) are escaped unconditionally, since none of them
 * is printable and each is a single code point with no sequence to inspect.
 *
 * @param text The text to neutralize.
 * @param options Which classes of characters to preserve.
 * @returns The neutralized text.
 * @since 2.0.23
 */
export function sanitizeControlSequences(
  text: string,
  options: SanitizationOptions = {},
): string {
  const preserveSgr = options.sgr !== "escape";
  const escapeNewlines = options.newlines === "escape";

  // Fast path: most log output contains nothing to escape.
  let needsWork = false;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode === 0x1b || isDangerous(charCode, escapeNewlines)) {
      needsWork = true;
      break;
    }
  }
  if (!needsWork) return text;

  let result = "";
  let i = 0;
  // Whether a preserved SGR sequence left an attribute set.  A sequence that
  // is left open would otherwise style everything printed afterwards, so
  // `\x1b[8m` (conceal) in one record would hide every record after it.
  let sgrOpen = false;
  while (i < text.length) {
    const charCode = text.charCodeAt(i);
    if (charCode === 0x1b) {
      if (preserveSgr) {
        const sgr = sgrPattern.exec(text.slice(i));
        if (sgr != null) {
          result += sgr[0];
          sgrOpen = !isSgrReset(sgr[1]);
          i += sgr[0].length;
          continue;
        }
      }
      result += escapeChar(0x1b);
      i++;
    } else if (isDangerous(charCode, escapeNewlines)) {
      result += escapeChar(charCode);
      i++;
    } else {
      result += text[i];
      i++;
    }
  }
  return sgrOpen ? result + sgrReset : result;
}

/**
 * Whether an SGR sequence's parameters clear every attribute rather than set
 * one.  `` `\x1b[m` ``, `` `\x1b[0m` ``, and `` `\x1b[0;0m` `` all do.
 */
function isSgrReset(parameters: string): boolean {
  return /^0*$/.test(parameters.replace(/[;:]/g, ""));
}

/**
 * Builds the sanitizer a formatter applies to its message and category parts.
 *
 * @param options `false` to disable sanitization entirely, or the classes of
 *                characters to preserve.
 * @returns A function that neutralizes a string, or `null` when sanitization
 *          is disabled.
 * @since 2.0.23
 */
export function getSanitizer(
  options?: SanitizationOptions | false,
): ((text: string) => string) | null {
  if (options === false) return null;
  const resolved = options ?? {};
  return (text: string) => sanitizeControlSequences(text, resolved);
}
