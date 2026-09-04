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

function hasValidLuhnChecksum(digits: string): boolean {
  let checksum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--, shouldDouble = !shouldDouble) {
    let digit = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    checksum += digit;
  }

  return checksum % 10 === 0;
}

function hasCommonCreditCardGrouping(groups: readonly string[]): boolean {
  if (groups.length === 1) {
    return groups[0].length >= 13 && groups[0].length <= 19;
  }
  if (groups.length === 3) {
    return groups[0].length === 4 &&
      ((groups[1].length === 6 && groups[2].length >= 4 &&
        groups[2].length <= 5) ||
        ((groups[1].length === 4 || groups[1].length === 5) &&
          groups[2].length === 6));
  }
  if (groups.length === 4) {
    return groups[0].length === 4 && groups[1].length === 4 &&
      groups[2].length === 4 && groups[3].length >= 1 &&
      groups[3].length <= 4;
  }
  if (groups.length === 5) {
    return groups[0].length === 4 && groups[1].length === 4 &&
      groups[2].length === 4 && groups[3].length === 4 &&
      groups[4].length >= 1 && groups[4].length <= 3;
  }
  return false;
}

const creditCardNumberReplacement = "XXXX-XXXX-XXXX-XXXX";

type CreditCardCandidate = {
  start: number;
  end: number;
  endGroup: number;
};

type CreditCardCover = {
  readonly candidate: CreditCardCandidate;
  readonly next: CreditCardCover | null;
};

function redactCreditCardNumber(match: string): string {
  const groups = [...match.matchAll(/\d+/g)];
  const candidates: CreditCardCandidate[] = [];
  const candidatesByStart: CreditCardCandidate[][] = Array.from(
    { length: groups.length },
    () => [],
  );

  for (let start = 0; start < groups.length; start++) {
    let digits = "";
    for (let end = start; end < groups.length; end++) {
      digits += groups[end][0];
      if (digits.length > 19) break;
      if (
        digits.length >= 13 &&
        hasCommonCreditCardGrouping(
          groups.slice(start, end + 1).map((group) => group[0]),
        ) &&
        hasValidLuhnChecksum(digits)
      ) {
        const candidate = {
          start: groups[start].index,
          end: groups[end].index + groups[end][0].length,
          endGroup: end,
        };
        candidates.push(candidate);
        candidatesByStart[start].push(candidate);
      }
    }
  }

  if (candidates.length === 0) return match;

  // Keep adjacent card numbers as separate redactions when their candidates
  // cover the complete group sequence without overlapping.
  const completeCovers: (CreditCardCover | null | undefined)[] = [];
  completeCovers[groups.length] = null;
  for (let start = groups.length - 1; start >= 0; start--) {
    for (const candidate of candidatesByStart[start]) {
      const tail = completeCovers[candidate.endGroup + 1];
      if (tail !== undefined) {
        completeCovers[start] = { candidate, next: tail };
        break;
      }
    }
  }

  const completeCover = completeCovers[0];
  const intervals = completeCover === undefined ? candidates : [];
  for (
    let cover = completeCover;
    cover != null;
    cover = cover.next
  ) {
    intervals.push(cover.candidate);
  }
  const redacted: string[] = [];
  let candidate = { ...intervals[0] };
  let offset = 0;
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    // Merge ambiguous overlaps so no portion of a possible PAN remains visible.
    if (next.start < candidate.end) {
      candidate.end = Math.max(candidate.end, next.end);
    } else {
      redacted.push(
        match.slice(offset, candidate.start),
        creditCardNumberReplacement,
      );
      offset = candidate.end;
      candidate = next;
    }
  }
  redacted.push(
    match.slice(offset, candidate.start),
    creditCardNumberReplacement,
    match.slice(candidate.end),
  );
  return redacted.join("");
}

/**
 * A redaction pattern for Luhn-valid credit card numbers with 13–19 digits,
 * including numbers separated into common groups with spaces or hyphens.
 * @since 0.10.0
 */
export const CREDIT_CARD_NUMBER_PATTERN: RedactionPattern = {
  pattern: /(?<!\d)(?:\d{13,19}|\d{4}(?:(?: +|-)\d{1,6})+)(?!\d)/g,
  replacement: redactCreditCardNumber,
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
