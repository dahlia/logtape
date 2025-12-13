import type {
  ConsoleFormatter,
  LogRecord,
  TextFormatter,
} from "@logtape/logtape";

/**
 * A redaction pattern, which is a pair of regular expression and replacement
 * string or function.
 * @since 0.10.0
 */
export interface RedactionPattern {
  /**
   * The regular expression to match against.  Note that it must have the
   * `g` (global) flag set, otherwise it will throw a `TypeError`.
   */
  readonly pattern: RegExp;

  /**
   * The replacement string or function.  If the replacement is a function,
   * it will be called with the matched string and any capture groups (the same
   * signature as `String.prototype.replaceAll()`).
   */
  readonly replacement:
    | string
    // deno-lint-ignore no-explicit-any
    | ((match: string, ...rest: readonly any[]) => string);
}

/**
 * A redaction pattern for email addresses.
 * @since 0.10.0
 */
export const EMAIL_ADDRESS_PATTERN: RedactionPattern = {
  pattern:
    /[\p{L}0-9.!#$%&'*+/=?^_`{|}~-]+@[\p{L}0-9](?:[\p{L}0-9-]{0,61}[\p{L}0-9])?(?:\.[\p{L}0-9](?:[\p{L}0-9-]{0,61}[\p{L}0-9])?)+/gu,
  replacement: "REDACTED@EMAIL.ADDRESS",
};

/**
 * A redaction pattern for credit card numbers (including American Express).
 * @since 0.10.0
 */
export const CREDIT_CARD_NUMBER_PATTERN: RedactionPattern = {
  pattern: /(?:\d{4}-){3}\d{4}|(?:\d{4}-){2}\d{6}/g,
  replacement: "XXXX-XXXX-XXXX-XXXX",
};

/**
 * A redaction pattern for U.S. Social Security numbers.
 * @since 0.10.0
 */
export const US_SSN_PATTERN: RedactionPattern = {
  pattern: /\d{3}-\d{2}-\d{4}/g,
  replacement: "XXX-XX-XXXX",
};

/**
 * A redaction pattern for South Korean resident registration numbers
 * (住民登錄番號).
 * @since 0.10.0
 */
export const KR_RRN_PATTERN: RedactionPattern = {
  pattern: /\d{6}-\d{7}/g,
  replacement: "XXXXXX-XXXXXXX",
};

/**
 * A redaction pattern for JSON Web Tokens (JWT).
 * @since 0.10.0
 */
export const JWT_PATTERN: RedactionPattern = {
  pattern: /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  replacement: "[JWT REDACTED]",
};

/**
 * A list of {@link RedactionPattern}s.
 * @since 0.10.0
 */
export type RedactionPatterns = readonly RedactionPattern[];

/**
 * Applies data redaction to a {@link TextFormatter}.
 *
 * Note that there are some built-in redaction patterns:
 *
 * - {@link CREDIT_CARD_NUMBER_PATTERN}
 * - {@link EMAIL_ADDRESS_PATTERN}
 * - {@link JWT_PATTERN}
 * - {@link KR_RRN_PATTERN}
 * - {@link US_SSN_PATTERN}
 *
 * @example
 * ```ts
 * import { getFileSink } from "@logtape/file";
 * import { getAnsiColorFormatter } from "@logtape/logtape";
 * import {
 *   CREDIT_CARD_NUMBER_PATTERN,
 *   EMAIL_ADDRESS_PATTERN,
 *   JWT_PATTERN,
 *   redactByPattern,
 * } from "@logtape/redaction";
 *
 * const formatter = redactByPattern(getAnsiConsoleFormatter(), [
 *   CREDIT_CARD_NUMBER_PATTERN,
 *   EMAIL_ADDRESS_PATTERN,
 *   JWT_PATTERN,
 * ]);
 * const sink = getFileSink("my-app.log", { formatter });
 * ```
 * @param formatter The text formatter to apply redaction to.
 * @param patterns The redaction patterns to apply.
 * @returns The redacted text formatter.
 * @since 0.10.0
 */
export function redactByPattern(
  formatter: TextFormatter,
  patterns: RedactionPatterns,
): TextFormatter;

/**
 * Applies data redaction to a {@link ConsoleFormatter}.
 *
 * Note that there are some built-in redaction patterns:
 *
 * - {@link CREDIT_CARD_NUMBER_PATTERN}
 * - {@link EMAIL_ADDRESS_PATTERN}
 * - {@link JWT_PATTERN}
 * - {@link KR_RRN_PATTERN}
 * - {@link US_SSN_PATTERN}
 *
 * @example
 * ```ts
 * import { defaultConsoleFormatter, getConsoleSink } from "@logtape/logtape";
 * import {
 *   CREDIT_CARD_NUMBER_PATTERN,
 *   EMAIL_ADDRESS_PATTERN,
 *   JWT_PATTERN,
 *   redactByPattern,
 * } from "@logtape/redaction";
 *
 * const formatter = redactByPattern(defaultConsoleFormatter, [
 *   CREDIT_CARD_NUMBER_PATTERN,
 *   EMAIL_ADDRESS_PATTERN,
 *   JWT_PATTERN,
 * ]);
 * const sink = getConsoleSink({ formatter });
 * ```
 * @param formatter The console formatter to apply redaction to.
 * @param patterns The redaction patterns to apply.
 * @returns The redacted console formatter.
 * @since 0.10.0
 */
export function redactByPattern(
  formatter: ConsoleFormatter,
  patterns: RedactionPatterns,
): ConsoleFormatter;

export function redactByPattern(
  formatter: TextFormatter | ConsoleFormatter,
  patterns: RedactionPatterns,
): (record: LogRecord) => string | readonly unknown[] {
  for (const { pattern } of patterns) {
    if (!pattern.global) {
      throw new TypeError(
        `Pattern ${pattern} does not have the global flag set.`,
      );
    }
  }

  function replaceString(str: string): string {
    for (const p of patterns) {
      // The following ternary operator may seem strange, but it's for
      // making TypeScript happy:
      str = typeof p.replacement === "string"
        ? str.replaceAll(p.pattern, p.replacement)
        : str.replaceAll(p.pattern, p.replacement);
    }
    return str;
  }

  function replaceObject(
    object: unknown,
    visited: Map<object, object>,
  ): unknown {
    if (typeof object === "object" && object !== null) {
      if (visited.has(object)) {
        return visited.get(object)!; // Circular reference detected
      }
    }

    if (typeof object === "string") return replaceString(object);
    if (Array.isArray(object)) {
      const copy: unknown[] = [];
      visited.set(object, copy);
      object.forEach((item) => copy.push(replaceObject(item, visited)));
      return copy;
    }
    if (typeof object === "object" && object !== null) {
      const redacted: Record<string, unknown> = {};
      visited.set(object, redacted);
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          redacted[key] = replaceObject(
            (object as Record<string, unknown>)[key],
            visited,
          );
        }
      }
      return redacted;
    }
    return object;
  }

  return (record: LogRecord) => {
    const output = formatter(record);
    if (typeof output === "string") return replaceString(output);
    return output.map((obj) => replaceObject(obj, new Map()));
  };
}
