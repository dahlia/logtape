import type { LogLevel, LogRecord, Sink } from "@logtape/logtape";

/**
 * A predicate that matches log record properties.
 *
 * The first argument is the resolved properties object.  The second argument
 * is the full log record for cases where the predicate needs category, level,
 * or message context.
 *
 * @since 2.2.0
 */
export type PropertyMatcher = (
  properties: Readonly<Record<string, unknown>>,
  record: LogRecord,
) => boolean;

/**
 * A matcher for records collected by a {@link LogRecorder}.
 *
 * Object property matching is shallow: every own string key in the matcher
 * must exist on the record properties and have the same value according to
 * `Object.is()`.  Use a {@link PropertyMatcher} when a test needs absence
 * checks or deeper matching.
 *
 * @since 2.2.0
 */
export interface LogRecordMatch {
  /**
   * Exact category matcher.  A string is matched against the dot-joined
   * category, while an array is matched segment by segment.  A regular
   * expression is tested against the dot-joined category.
   */
  readonly category?: string | readonly string[] | RegExp;

  /**
   * Category prefix matcher.  A string is split on dots, while an array is
   * matched segment by segment.
   */
  readonly categoryPrefix?: string | readonly string[];

  /**
   * Exact severity level matcher.
   */
  readonly level?: LogLevel;

  /**
   * Rendered message matcher.  String and regular expression matchers are
   * applied to the rendered message.  A predicate receives the full record.
   */
  readonly message?: string | RegExp | ((record: LogRecord) => boolean);

  /**
   * Raw message matcher.  A string record is matched directly.  A tagged
   * template record is matched against the concatenated template strings.
   */
  readonly rawMessage?: string | RegExp;

  /**
   * Shallow property matcher or predicate.
   */
  readonly properties?: Readonly<Record<string, unknown>> | PropertyMatcher;

  /**
   * Full-record predicate for custom checks.
   */
  readonly predicate?: (record: LogRecord) => boolean;
}

/**
 * A test recorder for LogTape records.
 *
 * @since 2.2.0
 */
export interface LogRecorder {
  /**
   * A sink that appends each received record to {@link LogRecorder.records}.
   */
  readonly sink: Sink;

  /**
   * Records collected so far, in sink call order.
   */
  readonly records: readonly LogRecord[];

  /**
   * Removes all collected records.
   */
  clear(): void;

  /**
   * Returns collected records and clears the recorder.
   */
  take(): readonly LogRecord[];

  /**
   * Finds the first collected record matching the given matcher.
   *
   * @param match The matcher to apply.
   * @returns The first matching record, or `undefined`.
   */
  find(match: LogRecordMatch): LogRecord | undefined;

  /**
   * Finds all collected records matching the given matcher.
   *
   * @param match The matcher to apply.
   * @returns All matching records in collection order.
   */
  filter(match: LogRecordMatch): readonly LogRecord[];

  /**
   * Asserts that at least one collected record matches the given matcher.
   *
   * @param match The matcher to apply.
   * @throws {Error} If no matching record exists.
   */
  assertLogged(match: LogRecordMatch): void;

  /**
   * Asserts that no collected record matches the given matcher.
   *
   * @param match The matcher to apply.
   * @throws {Error} If a matching record exists.
   */
  assertNotLogged(match: LogRecordMatch): void;
}

/**
 * Creates a LogTape test recorder.
 *
 * @example
 * ```ts
 * import { configure, getLogger, reset } from "@logtape/logtape";
 * import { createLogRecorder } from "@logtape/testing";
 *
 * const recorder = createLogRecorder();
 *
 * try {
 *   await configure({
 *     sinks: { recorder: recorder.sink },
 *     loggers: [
 *       { category: ["my-lib"], lowestLevel: "debug", sinks: ["recorder"] },
 *     ],
 *   });
 *
 *   getLogger(["my-lib"]).info("User {userId} logged in.", {
 *     userId: "u-123",
 *   });
 *
 *   recorder.assertLogged({
 *     category: ["my-lib"],
 *     level: "info",
 *     message: "User u-123 logged in.",
 *     properties: { userId: "u-123" },
 *   });
 * } finally {
 *   await reset();
 * }
 * ```
 *
 * @returns A recorder with a sink and assertion helpers.
 * @since 2.2.0
 */
export function createLogRecorder(): LogRecorder {
  const records: LogRecord[] = [];
  const sink: Sink = (record: LogRecord): void => {
    records.push(record);
  };

  return {
    sink,
    get records(): readonly LogRecord[] {
      return records;
    },
    clear(): void {
      records.length = 0;
    },
    take(): readonly LogRecord[] {
      return records.splice(0);
    },
    find(match: LogRecordMatch): LogRecord | undefined {
      return records.find((record) => matchesLogRecord(record, match));
    },
    filter(match: LogRecordMatch): readonly LogRecord[] {
      return records.filter((record) => matchesLogRecord(record, match));
    },
    assertLogged(match: LogRecordMatch): void {
      if (records.some((record) => matchesLogRecord(record, match))) return;

      throw new Error(
        [
          "Expected a LogTape record matching:",
          formatMatcher(match),
          "",
          `Recorded ${formatCount(records.length, "record")}:`,
          formatRecords(records),
        ].join("\n"),
      );
    },
    assertNotLogged(match: LogRecordMatch): void {
      const matching = records.filter((record) =>
        matchesLogRecord(record, match)
      );
      if (matching.length < 1) return;

      throw new Error(
        [
          "Expected no LogTape record matching:",
          formatMatcher(match),
          "",
          `Found ${formatCount(matching.length, "matching record")}:`,
          formatRecords(matching),
        ].join("\n"),
      );
    },
  };
}

function matchesLogRecord(record: LogRecord, match: LogRecordMatch): boolean {
  if (
    match.category != null &&
    !matchesCategory(record.category, match.category)
  ) {
    return false;
  }
  if (
    match.categoryPrefix != null &&
    !matchesCategoryPrefix(record.category, match.categoryPrefix)
  ) {
    return false;
  }
  if (match.level != null && record.level !== match.level) return false;
  if (
    match.message != null &&
    !matchesMessage(renderMessage(record.message), record, match.message)
  ) {
    return false;
  }
  if (
    match.rawMessage != null &&
    !matchesText(renderRawMessage(record.rawMessage), match.rawMessage)
  ) {
    return false;
  }
  if (
    match.properties != null &&
    !matchesProperties(record.properties, record, match.properties)
  ) {
    return false;
  }
  if (match.predicate != null && !match.predicate(record)) return false;
  return true;
}

function matchesCategory(
  category: readonly string[],
  expected: string | readonly string[] | RegExp,
): boolean {
  if (expected instanceof RegExp) {
    return testRegExp(expected, formatCategory(category));
  }
  if (typeof expected === "string") {
    return formatCategory(category) === expected;
  }
  const expectedCategory = parseCategory(expected);
  return category.length === expectedCategory.length &&
    category.every((part, index) => part === expectedCategory[index]);
}

function matchesCategoryPrefix(
  category: readonly string[],
  prefix: string | readonly string[],
): boolean {
  const expectedPrefix = parseCategory(prefix);
  return expectedPrefix.length <= category.length &&
    expectedPrefix.every((part, index) => part === category[index]);
}

function parseCategory(
  category: string | readonly string[],
): readonly string[] {
  return typeof category === "string" ? category.split(".") : category;
}

function matchesMessage(
  renderedMessage: string,
  record: LogRecord,
  matcher: string | RegExp | ((record: LogRecord) => boolean),
): boolean {
  if (typeof matcher === "function") return matcher(record);
  return matchesText(renderedMessage, matcher);
}

function matchesText(text: string, matcher: string | RegExp): boolean {
  return typeof matcher === "string"
    ? text === matcher
    : testRegExp(matcher, text);
}

function matchesProperties(
  properties: Readonly<Record<string, unknown>>,
  record: LogRecord,
  matcher: Readonly<Record<string, unknown>> | PropertyMatcher,
): boolean {
  if (typeof matcher === "function") return matcher(properties, record);
  for (const key of Object.keys(matcher)) {
    if (!Object.hasOwn(properties, key)) return false;
    if (!Object.is(properties[key], matcher[key])) return false;
  }
  return true;
}

function testRegExp(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags;
  const clone = new RegExp(pattern.source, flags);
  clone.lastIndex = pattern.lastIndex;
  return clone.test(text);
}

function renderRawMessage(rawMessage: string | TemplateStringsArray): string {
  return typeof rawMessage === "string" ? rawMessage : [...rawMessage].join("");
}

function renderMessage(message: readonly unknown[]): string {
  let rendered = "";
  for (const part of message) {
    rendered += renderMessagePart(part);
  }
  return rendered;
}

function renderMessagePart(part: unknown): string {
  if (typeof part === "string") return part;
  if (typeof part === "bigint") return `${part}n`;
  if (part instanceof Error) return part.message;
  if (part == null) return String(part);
  if (typeof part === "object") {
    try {
      return JSON.stringify(part) ?? String(part);
    } catch {
      return String(part);
    }
  }
  return String(part);
}

function formatMatcher(match: LogRecordMatch): string {
  const lines: string[] = [];
  if (match.category != null) {
    lines.push(`  category: ${formatCategoryMatcher(match.category)}`);
  }
  if (match.categoryPrefix != null) {
    lines.push(
      `  categoryPrefix: ${
        formatCategoryValue(parseCategory(match.categoryPrefix))
      }`,
    );
  }
  if (match.level != null) lines.push(`  level: ${formatValue(match.level)}`);
  if (match.message != null) {
    lines.push(`  message: ${formatMessageMatcher(match.message)}`);
  }
  if (match.rawMessage != null) {
    lines.push(`  rawMessage: ${formatTextMatcher(match.rawMessage)}`);
  }
  if (match.properties != null) {
    lines.push(...formatPropertiesMatcher(match.properties));
  }
  if (match.predicate != null) lines.push("  predicate: <predicate>");
  return lines.length < 1 ? "  <any record>" : lines.join("\n");
}

function formatCategoryMatcher(
  category: string | readonly string[] | RegExp,
): string {
  return category instanceof RegExp
    ? String(category)
    : typeof category === "string"
    ? formatValue(category)
    : formatCategoryValue(category);
}

function formatCategoryValue(category: readonly string[]): string {
  return `[${category.map((part) => formatValue(part)).join(", ")}]`;
}

function formatMessageMatcher(
  matcher: string | RegExp | ((record: LogRecord) => boolean),
): string {
  return typeof matcher === "function" ? "<predicate>" : formatTextMatcher(
    matcher,
  );
}

function formatTextMatcher(matcher: string | RegExp): string {
  return typeof matcher === "string" ? formatValue(matcher) : String(matcher);
}

function formatPropertiesMatcher(
  matcher: Readonly<Record<string, unknown>> | PropertyMatcher,
): string[] {
  if (typeof matcher === "function") return ["  properties: <predicate>"];
  const lines = Object.keys(matcher).map((key) =>
    `  properties.${key}: ${formatValue(matcher[key])}`
  );
  return lines.length < 1 ? ["  properties: {}"] : lines;
}

function formatRecords(records: readonly LogRecord[]): string {
  if (records.length < 1) return "  <none>";
  const lines = records.slice(0, 3).map(formatRecord);
  if (records.length > 3) {
    lines.push(`  ... ${records.length - 3} more`);
  }
  return lines.join("\n");
}

function formatRecord(record: LogRecord): string {
  const category = formatCategory(record.category);
  return `  [${record.level}] ${category}: ${renderMessage(record.message)}${
    formatProperties(record.properties)
  }`;
}

function formatCategory(category: readonly string[]): string {
  return category.length < 1 ? "<root>" : category.join(".");
}

function formatProperties(
  properties: Readonly<Record<string, unknown>>,
): string {
  const entries = Object.keys(properties);
  if (entries.length < 1) return "";
  const summary = entries.slice(0, 3).map((key) =>
    `${key}: ${formatValue(properties[key])}`
  );
  if (entries.length > 3) summary.push(`... ${entries.length - 3} more`);
  return ` {${summary.join(", ")}}`;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return String(value);
  if (value instanceof RegExp) return String(value);
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
