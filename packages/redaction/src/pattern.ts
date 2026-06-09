import {
  type ConsoleFormatter,
  getLogger,
  type LogRecord,
  type TextFormatter,
} from "@logtape/logtape";
import {
  createRedactionTraversalContext,
  type RedactionLimit,
  type RedactionTraversalContext,
  type RedactionTraversalLimits,
  type RedactionTraversalOptions,
  redactionTruncatedValue,
} from "./traversal.ts";

const metaLogger = getLogger(["logtape", "meta"]);
let reportingRedactionLimit = false;

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
  pattern: /(?:\d{4}-){2}(?:\d{4}-\d{4}|\d{6})/g,
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
 * Options for pattern-based redaction.
 * @since 2.2.0
 */
export interface PatternRedactionOptions extends RedactionTraversalOptions {
  /**
   * Maximum recursion depth for object and array traversal.
   * @default `20`
   */
  readonly maxDepth?: number;

  /**
   * Maximum number of properties or array elements to process per object.
   * @default `1000`
   */
  readonly maxProperties?: number;
}

/**
 * Checks if a value is a built-in object that should not be recursively
 * processed (e.g., Error, Date, RegExp, Map, Set, etc.).
 * @param value The value to check.
 * @returns `true` if the value is a built-in object, `false` otherwise.
 */
function isBuiltInObject(value: object): boolean {
  return value instanceof Error ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof Promise ||
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" &&
      value instanceof SharedArrayBuffer) ||
    ArrayBuffer.isView(value);
}

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
 * @param options Options for bounding recursive traversal of formatter output.
 * @returns The redacted text formatter.
 * @since 0.10.0
 */
export function redactByPattern(
  formatter: TextFormatter,
  patterns: RedactionPatterns,
  options?: PatternRedactionOptions,
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
 * @param options Options for bounding recursive traversal of formatter output.
 * @returns The redacted console formatter.
 * @since 0.10.0
 */
export function redactByPattern(
  formatter: ConsoleFormatter,
  patterns: RedactionPatterns,
  options?: PatternRedactionOptions,
): ConsoleFormatter;

export function redactByPattern(
  formatter: TextFormatter | ConsoleFormatter,
  patterns: RedactionPatterns,
  options: PatternRedactionOptions = {},
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
    context: RedactionTraversalContext,
    depth: number,
  ): unknown {
    if (typeof object === "object" && object !== null) {
      if (context.visited.has(object)) {
        return context.visited.get(object)!; // Circular reference detected
      }
    }

    if (typeof object === "string") return replaceString(object);
    if (Array.isArray(object)) {
      const copy: unknown[] = [];
      const length = Math.min(object.length, context.limits.maxProperties);
      copy.length = length;
      context.visited.set(object, copy);
      if (object.length > context.limits.maxProperties) {
        reportLimitOnce(context, "maxProperties");
      }
      for (let i = 0; i < length; i++) {
        if (!(i in object)) continue;
        const item = object[i];
        if (
          shouldTraverseValue(item) && depth + 1 > context.limits.maxDepth
        ) {
          reportLimitOnce(context, "maxDepth");
          copy[i] = redactionTruncatedValue;
        } else {
          copy[i] = replaceObject(item, context, depth + 1);
        }
      }
      return copy;
    }
    if (typeof object === "object" && object !== null) {
      if (isBuiltInObject(object)) {
        return object;
      }
      const redacted: Record<string, unknown> = {};
      context.visited.set(object, redacted);
      const keys = Object.keys(object);
      if (keys.length > context.limits.maxProperties) {
        reportLimitOnce(context, "maxProperties");
      }
      for (const key of keys.slice(0, context.limits.maxProperties)) {
        const value = (object as Record<string, unknown>)[key];
        if (
          shouldTraverseValue(value) && depth + 1 > context.limits.maxDepth
        ) {
          reportLimitOnce(context, "maxDepth");
          redacted[key] = redactionTruncatedValue;
        } else {
          redacted[key] = replaceObject(value, context, depth + 1);
        }
      }
      return redacted;
    }
    return object;
  }

  return (record: LogRecord) => {
    const output = formatter(record);
    if (typeof output === "string") return replaceString(output);
    const context = createPatternRedactionContext(options);
    if (output.length > context.limits.maxProperties) {
      reportLimitOnce(context, "maxProperties");
    }
    return output
      .slice(0, context.limits.maxProperties)
      .map((obj) => replaceObject(obj, context, 0));
  };
}

function reportRedactionLimitExceeded(
  limit: RedactionLimit,
  limits: RedactionTraversalLimits,
): void {
  if (reportingRedactionLimit || typeof metaLogger.warn !== "function") {
    return;
  }
  try {
    reportingRedactionLimit = true;
    metaLogger.warn(
      "Redaction traversal exceeded {limit}; replacing or omitting " +
        "remaining data to keep logging bounded.",
      { limit, ...limits },
    );
  } catch {
    // Meta logging failures must not make normal logging fail.
  } finally {
    reportingRedactionLimit = false;
  }
}

function shouldTraverseValue(value: unknown): boolean {
  return (typeof value === "object" && value !== null) &&
    !isBuiltInObject(value);
}

function createPatternRedactionContext(
  options: RedactionTraversalOptions,
): RedactionTraversalContext {
  return createRedactionTraversalContext(
    options,
    reportRedactionLimitExceeded,
  );
}

function reportLimitOnce(
  context: RedactionTraversalContext,
  limit: RedactionLimit,
): void {
  if (context.exceededLimits.has(limit)) return;
  context.reportLimitExceeded(limit);
}
