import type { ContextLocalStorage } from "./context.ts";
import type { Filter } from "./filter.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

/**
 * A logger interface.  It provides methods to log messages at different
 * severity levels.
 *
 * ```typescript
 * const logger = getLogger("category");
 * logger.trace `A trace message with ${value}`
 * logger.debug `A debug message with ${value}.`;
 * logger.info `An info message with ${value}.`;
 * logger.warn `A warning message with ${value}.`;
 * logger.error `An error message with ${value}.`;
 * logger.fatal `A fatal error message with ${value}.`;
 * ```
 */
export interface Logger {
  /**
   * The category of the logger.  It is an array of strings.
   */
  readonly category: readonly string[];

  /**
   * The logger with the supercategory of the current logger.  If the current
   * logger is the root logger, this is `null`.
   */
  readonly parent: Logger | null;

  /**
   * Get a child logger with the given subcategory.
   *
   * ```typescript
   * const logger = getLogger("category");
   * const subLogger = logger.getChild("sub-category");
   * ```
   *
   * The above code is equivalent to:
   *
   * ```typescript
   * const logger = getLogger("category");
   * const subLogger = getLogger(["category", "sub-category"]);
   * ```
   *
   * @param subcategory The subcategory.
   * @returns The child logger.
   */
  getChild(
    subcategory: string | readonly [string] | readonly [string, ...string[]],
  ): Logger;

  /**
   * Get a logger with contextual properties.  This is useful for
   * log multiple messages with the shared set of properties.
   *
   * ```typescript
   * const logger = getLogger("category");
   * const ctx = logger.with({ foo: 123, bar: "abc" });
   * ctx.info("A message with {foo} and {bar}.");
   * ctx.warn("Another message with {foo}, {bar}, and {baz}.", { baz: true });
   * ```
   *
   * The above code is equivalent to:
   *
   * ```typescript
   * const logger = getLogger("category");
   * logger.info("A message with {foo} and {bar}.", { foo: 123, bar: "abc" });
   * logger.warn(
   *   "Another message with {foo}, {bar}, and {baz}.",
   *   { foo: 123, bar: "abc", baz: true },
   * );
   * ```
   *
   * @param properties
   * @returns
   * @since 0.5.0
   */
  with(properties: Record<string, unknown>): Logger;

  /**
   * Log a trace message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.trace `A trace message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   * @since 0.12.0
   */
  trace(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log a trace message with properties.
   *
   * ```typescript
   * logger.trace('A trace message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.trace(
   *   'A trace message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   * @since 0.12.0
   */
  trace(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log a trace values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.trace({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.trace('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.trace('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.12.0
   */
  trace(properties: Record<string, unknown>): void;

  /**
   * Lazily log a trace message.  Use this when the message values are expensive
   * to compute and should only be computed if the message is actually logged.
   *
   * ```typescript
   * logger.trace(l => l`A trace message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   * @since 0.12.0
   */
  trace(callback: LogCallback): void;

  /**
   * Log a debug message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.debug `A debug message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   */
  debug(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log a debug message with properties.
   *
   * ```typescript
   * logger.debug('A debug message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.debug(
   *   'A debug message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   */
  debug(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log a debug values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.debug({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.debug('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.debug('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.11.0
   */
  debug(properties: Record<string, unknown>): void;

  /**
   * Lazily log a debug message.  Use this when the message values are expensive
   * to compute and should only be computed if the message is actually logged.
   *
   * ```typescript
   * logger.debug(l => l`A debug message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   */
  debug(callback: LogCallback): void;

  /**
   * Log an informational message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.info `An info message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   */
  info(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log an informational message with properties.
   *
   * ```typescript
   * logger.info('An info message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.info(
   *   'An info message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   */
  info(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log an informational values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.info({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.info('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.info('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.11.0
   */
  info(properties: Record<string, unknown>): void;

  /**
   * Lazily log an informational message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.info(l => l`An info message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   */
  info(callback: LogCallback): void;

  /**
   * Log a warning message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.warn `A warning message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   */
  warn(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log a warning message with properties.
   *
   * ```typescript
   * logger.warn('A warning message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.warn(
   *   'A warning message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   */
  warn(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log a warning values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.warn({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.warn('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.warn('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.11.0
   */
  warn(properties: Record<string, unknown>): void;

  /**
   * Lazily log a warning message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.warn(l => l`A warning message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   */
  warn(callback: LogCallback): void;

  /**
   * Log a warning message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.warning `A warning message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   * @since 0.12.0
   */
  warning(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log a warning message with properties.
   *
   * ```typescript
   * logger.warning('A warning message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.warning(
   *   'A warning message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   * @since 0.12.0
   */
  warning(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log a warning values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.warning({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.warning('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.warning('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.12.0
   */
  warning(properties: Record<string, unknown>): void;

  /**
   * Lazily log a warning message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.warning(l => l`A warning message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   * @since 0.12.0
   */
  warning(callback: LogCallback): void;

  /**
   * Log an error message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.error `An error message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   */
  error(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log an error message with properties.
   *
   * ```typescript
   * logger.warn('An error message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.error(
   *   'An error message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   */
  error(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log an error values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.error({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.error('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.error('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.11.0
   */
  error(properties: Record<string, unknown>): void;

  /**
   * Lazily log an error message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.error(l => l`An error message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   */
  error(callback: LogCallback): void;

  /**
   * Log a fatal error message.  Use this as a template string prefix.
   *
   * ```typescript
   * logger.fatal `A fatal error message with ${value}.`;
   * ```
   *
   * @param message The message template strings array.
   * @param values The message template values.
   */
  fatal(message: TemplateStringsArray, ...values: readonly unknown[]): void;

  /**
   * Log a fatal error message with properties.
   *
   * ```typescript
   * logger.warn('A fatal error message with {value}.', { value });
   * ```
   *
   * If the properties are expensive to compute, you can pass a callback that
   * returns the properties:
   *
   * ```typescript
   * logger.fatal(
   *   'A fatal error message with {value}.',
   *   () => ({ value: expensiveComputation() })
   * );
   * ```
   *
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   */
  fatal(
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log a fatal error values with no message.  This is useful when you
   * want to log properties without a message, e.g., when you want to log
   * the context of a request or an operation.
   *
   * ```typescript
   * logger.fatal({ method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * Note that this is a shorthand for:
   *
   * ```typescript
   * logger.fatal('{*}', { method: 'GET', url: '/api/v1/resource' });
   * ```
   *
   * If the properties are expensive to compute, you cannot use this shorthand
   * and should use the following syntax instead:
   *
   * ```typescript
   * logger.fatal('{*}', () => ({
   *   method: expensiveMethod(),
   *   url: expensiveUrl(),
   * }));
   * ```
   *
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   * @since 0.11.0
   */
  fatal(properties: Record<string, unknown>): void;

  /**
   * Lazily log a fatal error message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.fatal(l => l`A fatal error message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   */
  fatal(callback: LogCallback): void;

  /**
   * Emits a log record with custom fields while using this logger's
   * category.
   *
   * This is a low-level API for integration scenarios where you need full
   * control over the log record, particularly for preserving timestamps
   * from external systems.
   *
   * ```typescript
   * const logger = getLogger(["my-app", "integration"]);
   *
   * // Emit a log with a custom timestamp
   * logger.emit({
   *   timestamp: kafkaLog.originalTimestamp,
   *   level: "info",
   *   message: [kafkaLog.message],
   *   rawMessage: kafkaLog.message,
   *   properties: {
   *     source: "kafka",
   *     partition: kafkaLog.partition,
   *     offset: kafkaLog.offset,
   *   },
   * });
   * ```
   *
   * @param record Log record without category field (category comes from
   *               the logger instance)
   * @since 1.1.0
   */
  emit(record: Omit<LogRecord, "category">): void;
}

/**
 * A logging callback function.  It is used to defer the computation of a
 * message template until it is actually logged.
 * @param prefix The message template prefix.
 * @returns The rendered message array.
 */
export type LogCallback = (prefix: LogTemplatePrefix) => unknown[];

/**
 * A logging template prefix function.  It is used to log a message in
 * a {@link LogCallback} function.
 * @param message The message template strings array.
 * @param values The message template values.
 * @returns The rendered message array.
 */
export type LogTemplatePrefix = (
  message: TemplateStringsArray,
  ...values: unknown[]
) => unknown[];

/**
 * A function type for logging methods in the {@link Logger} interface.
 * @since 1.0.0
 */
export interface LogMethod {
  /**
   * Log a message with the given level using a template string.
   * @param message The message template strings array.
   * @param values The message template values.
   */
  (
    message: TemplateStringsArray,
    ...values: readonly unknown[]
  ): void;

  /**
   * Log a message with the given level with properties.
   * @param message The message template.  Placeholders to be replaced with
   *                `values` are indicated by keys in curly braces (e.g.,
   *                `{value}`).
   * @param properties The values to replace placeholders with.  For lazy
   *                   evaluation, this can be a callback that returns the
   *                   properties.
   */
  (
    message: string,
    properties?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  /**
   * Log a message with the given level with no message.
   * @param properties The values to log.  Note that this does not take
   *                   a callback.
   */
  (properties: Record<string, unknown>): void;

  /**
   * Lazily log a message with the given level.
   * @param callback A callback that returns the message template prefix.
   * @throws {TypeError} If no log record was made inside the callback.
   */
  (callback: LogCallback): void;
}

/**
 * Get a logger with the given category.
 *
 * ```typescript
 * const logger = getLogger(["my-app"]);
 * ```
 *
 * @param category The category of the logger.  It can be a string or an array
 *                 of strings.  If it is a string, it is equivalent to an array
 *                 with a single element.
 * @returns The logger.
 */
export function getLogger(category: string | readonly string[] = []): Logger {
  return LoggerImpl.getLogger(category);
}

/**
 * The symbol for the global root logger.
 */
const globalRootLoggerSymbol = Symbol.for("logtape.rootLogger");

/**
 * The global root logger registry.
 */
interface GlobalRootLoggerRegistry {
  [globalRootLoggerSymbol]?: LoggerImpl;
}

/**
 * A logger implementation.  Do not use this directly; use {@link getLogger}
 * instead.  This class is exported for testing purposes.
 */
export class LoggerImpl implements Logger {
  readonly parent: LoggerImpl | null;
  readonly children: Record<string, LoggerImpl | WeakRef<LoggerImpl>>;
  readonly category: readonly string[];
  readonly sinks: Sink[];
  parentSinks: "inherit" | "override" = "inherit";
  readonly filters: Filter[];
  lowestLevel: LogLevel | null = "trace";
  contextLocalStorage?: ContextLocalStorage<Record<string, unknown>>;

  static getLogger(category: string | readonly string[] = []): LoggerImpl {
    let rootLogger: LoggerImpl | null = globalRootLoggerSymbol in globalThis
      ? ((globalThis as GlobalRootLoggerRegistry)[globalRootLoggerSymbol] ??
        null)
      : null;
    if (rootLogger == null) {
      rootLogger = new LoggerImpl(null, []);
      (globalThis as GlobalRootLoggerRegistry)[globalRootLoggerSymbol] =
        rootLogger;
    }
    if (typeof category === "string") return rootLogger.getChild(category);
    if (category.length === 0) return rootLogger;
    return rootLogger.getChild(category as readonly [string, ...string[]]);
  }

  private constructor(parent: LoggerImpl | null, category: readonly string[]) {
    this.parent = parent;
    this.children = {};
    this.category = category;
    this.sinks = [];
    this.filters = [];
  }

  getChild(
    subcategory:
      | string
      | readonly [string]
      | readonly [string, ...(readonly string[])],
  ): LoggerImpl {
    const name = typeof subcategory === "string" ? subcategory : subcategory[0];
    const childRef = this.children[name];
    let child: LoggerImpl | undefined = childRef instanceof LoggerImpl
      ? childRef
      : childRef?.deref();
    if (child == null) {
      child = new LoggerImpl(this, [...this.category, name]);
      this.children[name] = "WeakRef" in globalThis
        ? new WeakRef(child)
        : child;
    }
    if (typeof subcategory === "string" || subcategory.length === 1) {
      return child;
    }
    return child.getChild(
      subcategory.slice(1) as [string, ...(readonly string[])],
    );
  }

  /**
   * Reset the logger.  This removes all sinks and filters from the logger.
   */
  reset(): void {
    while (this.sinks.length > 0) this.sinks.shift();
    this.parentSinks = "inherit";
    while (this.filters.length > 0) this.filters.shift();
    this.lowestLevel = "trace";
  }

  /**
   * Reset the logger and all its descendants.  This removes all sinks and
   * filters from the logger and all its descendants.
   */
  resetDescendants(): void {
    for (const child of Object.values(this.children)) {
      const logger = child instanceof LoggerImpl ? child : child.deref();
      if (logger != null) logger.resetDescendants();
    }
    this.reset();
  }

  with(properties: Record<string, unknown>): Logger {
    return new LoggerCtx(this, { ...properties });
  }

  filter(record: LogRecord): boolean {
    for (const filter of this.filters) {
      if (!filter(record)) return false;
    }
    if (this.filters.length < 1) return this.parent?.filter(record) ?? true;
    return true;
  }

  *getSinks(level: LogLevel): Iterable<Sink> {
    if (
      this.lowestLevel === null || compareLogLevel(level, this.lowestLevel) < 0
    ) {
      return;
    }
    if (this.parent != null && this.parentSinks === "inherit") {
      for (const sink of this.parent.getSinks(level)) yield sink;
    }
    for (const sink of this.sinks) yield sink;
  }

  emit(record: Omit<LogRecord, "category">): void;
  emit(record: LogRecord, bypassSinks?: Set<Sink>): void;
  emit(
    record: Omit<LogRecord, "category"> | LogRecord,
    bypassSinks?: Set<Sink>,
  ): void {
    const fullRecord: LogRecord = "category" in record
      ? record as LogRecord
      : { ...record, category: this.category };

    if (
      this.lowestLevel === null ||
      compareLogLevel(fullRecord.level, this.lowestLevel) < 0 ||
      !this.filter(fullRecord)
    ) {
      return;
    }
    for (const sink of this.getSinks(fullRecord.level)) {
      if (bypassSinks?.has(sink)) continue;
      try {
        sink(fullRecord);
      } catch (error) {
        const bypassSinks2 = new Set(bypassSinks);
        bypassSinks2.add(sink);
        metaLogger.log(
          "fatal",
          "Failed to emit a log record to sink {sink}: {error}",
          { sink, error, record: fullRecord },
          bypassSinks2,
        );
      }
    }
  }

  log(
    level: LogLevel,
    rawMessage: string,
    properties: Record<string, unknown> | (() => Record<string, unknown>),
    bypassSinks?: Set<Sink>,
  ): void {
    const implicitContext =
      LoggerImpl.getLogger().contextLocalStorage?.getStore() ?? {};
    let cachedProps: Record<string, unknown> | undefined = undefined;
    const record: LogRecord = typeof properties === "function"
      ? {
        category: this.category,
        level,
        timestamp: Date.now(),
        get message() {
          return parseMessageTemplate(rawMessage, this.properties);
        },
        rawMessage,
        get properties() {
          if (cachedProps == null) {
            cachedProps = {
              ...implicitContext,
              ...properties(),
            };
          }
          return cachedProps;
        },
      }
      : {
        category: this.category,
        level,
        timestamp: Date.now(),
        message: parseMessageTemplate(rawMessage, {
          ...implicitContext,
          ...properties,
        }),
        rawMessage,
        properties: { ...implicitContext, ...properties },
      };
    this.emit(record, bypassSinks);
  }

  logLazily(
    level: LogLevel,
    callback: LogCallback,
    properties: Record<string, unknown> = {},
  ): void {
    const implicitContext =
      LoggerImpl.getLogger().contextLocalStorage?.getStore() ?? {};
    let rawMessage: TemplateStringsArray | undefined = undefined;
    let msg: unknown[] | undefined = undefined;
    function realizeMessage(): [unknown[], TemplateStringsArray] {
      if (msg == null || rawMessage == null) {
        msg = callback((tpl, ...values) => {
          rawMessage = tpl;
          return renderMessage(tpl, values);
        });
        if (rawMessage == null) throw new TypeError("No log record was made.");
      }
      return [msg, rawMessage];
    }
    this.emit({
      category: this.category,
      level,
      get message() {
        return realizeMessage()[0];
      },
      get rawMessage() {
        return realizeMessage()[1];
      },
      timestamp: Date.now(),
      properties: { ...implicitContext, ...properties },
    });
  }

  logTemplate(
    level: LogLevel,
    messageTemplate: TemplateStringsArray,
    values: unknown[],
    properties: Record<string, unknown> = {},
  ): void {
    const implicitContext =
      LoggerImpl.getLogger().contextLocalStorage?.getStore() ?? {};
    this.emit({
      category: this.category,
      level,
      message: renderMessage(messageTemplate, values),
      rawMessage: messageTemplate,
      timestamp: Date.now(),
      properties: { ...implicitContext, ...properties },
    });
  }

  trace(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("trace", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("trace", message);
    } else if (!Array.isArray(message)) {
      this.log("trace", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("trace", message as TemplateStringsArray, values);
    }
  }

  debug(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("debug", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("debug", message);
    } else if (!Array.isArray(message)) {
      this.log("debug", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("debug", message as TemplateStringsArray, values);
    }
  }

  info(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("info", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("info", message);
    } else if (!Array.isArray(message)) {
      this.log("info", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("info", message as TemplateStringsArray, values);
    }
  }

  warn(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log(
        "warning",
        message,
        (values[0] ?? {}) as Record<string, unknown>,
      );
    } else if (typeof message === "function") {
      this.logLazily("warning", message);
    } else if (!Array.isArray(message)) {
      this.log("warning", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("warning", message as TemplateStringsArray, values);
    }
  }

  warning(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    this.warn(message, ...values);
  }

  error(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("error", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("error", message);
    } else if (!Array.isArray(message)) {
      this.log("error", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("error", message as TemplateStringsArray, values);
    }
  }

  fatal(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("fatal", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("fatal", message);
    } else if (!Array.isArray(message)) {
      this.log("fatal", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("fatal", message as TemplateStringsArray, values);
    }
  }
}

/**
 * A logger implementation with contextual properties.  Do not use this
 * directly; use {@link Logger.with} instead.  This class is exported
 * for testing purposes.
 */
export class LoggerCtx implements Logger {
  logger: LoggerImpl;
  properties: Record<string, unknown>;

  constructor(logger: LoggerImpl, properties: Record<string, unknown>) {
    this.logger = logger;
    this.properties = properties;
  }

  get category(): readonly string[] {
    return this.logger.category;
  }

  get parent(): Logger | null {
    return this.logger.parent;
  }

  getChild(
    subcategory: string | readonly [string] | readonly [string, ...string[]],
  ): Logger {
    return this.logger.getChild(subcategory).with(this.properties);
  }

  with(properties: Record<string, unknown>): Logger {
    return new LoggerCtx(this.logger, { ...this.properties, ...properties });
  }

  log(
    level: LogLevel,
    message: string,
    properties: Record<string, unknown> | (() => Record<string, unknown>),
    bypassSinks?: Set<Sink>,
  ): void {
    this.logger.log(
      level,
      message,
      typeof properties === "function"
        ? () => ({
          ...this.properties,
          ...properties(),
        })
        : { ...this.properties, ...properties },
      bypassSinks,
    );
  }

  logLazily(level: LogLevel, callback: LogCallback): void {
    this.logger.logLazily(level, callback, this.properties);
  }

  logTemplate(
    level: LogLevel,
    messageTemplate: TemplateStringsArray,
    values: unknown[],
  ): void {
    this.logger.logTemplate(level, messageTemplate, values, this.properties);
  }

  emit(record: Omit<LogRecord, "category">): void {
    const recordWithContext = {
      ...record,
      properties: { ...this.properties, ...record.properties },
    };
    this.logger.emit(recordWithContext);
  }

  trace(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("trace", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("trace", message);
    } else if (!Array.isArray(message)) {
      this.log("trace", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("trace", message as TemplateStringsArray, values);
    }
  }

  debug(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("debug", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("debug", message);
    } else if (!Array.isArray(message)) {
      this.log("debug", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("debug", message as TemplateStringsArray, values);
    }
  }

  info(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("info", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("info", message);
    } else if (!Array.isArray(message)) {
      this.log("info", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("info", message as TemplateStringsArray, values);
    }
  }

  warn(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log(
        "warning",
        message,
        (values[0] ?? {}) as Record<string, unknown>,
      );
    } else if (typeof message === "function") {
      this.logLazily("warning", message);
    } else if (!Array.isArray(message)) {
      this.log("warning", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("warning", message as TemplateStringsArray, values);
    }
  }

  warning(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    this.warn(message, ...values);
  }

  error(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("error", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("error", message);
    } else if (!Array.isArray(message)) {
      this.log("error", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("error", message as TemplateStringsArray, values);
    }
  }

  fatal(
    message:
      | TemplateStringsArray
      | string
      | LogCallback
      | Record<string, unknown>,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("fatal", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("fatal", message);
    } else if (!Array.isArray(message)) {
      this.log("fatal", "{*}", message as Record<string, unknown>);
    } else {
      this.logTemplate("fatal", message as TemplateStringsArray, values);
    }
  }
}

/**
 * The meta logger.  It is a logger with the category `["logtape", "meta"]`.
 */
const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);

/**
 * Parse a message template into a message template array and a values array.
 * @param template The message template.
 * @param properties The values to replace placeholders with.
 * @returns The message template array and the values array.
 */
export function parseMessageTemplate(
  template: string,
  properties: Record<string, unknown>,
): readonly unknown[] {
  const length = template.length;
  if (length === 0) return [""];

  // Fast path: no placeholders
  if (!template.includes("{")) return [template];

  const message: unknown[] = [];
  let startIndex = 0;

  for (let i = 0; i < length; i++) {
    const char = template[i];

    if (char === "{") {
      const nextChar = i + 1 < length ? template[i + 1] : "";

      if (nextChar === "{") {
        // Escaped { character - skip and continue
        i++; // Skip the next {
        continue;
      }

      // Find the closing }
      const closeIndex = template.indexOf("}", i + 1);
      if (closeIndex === -1) {
        // No closing } found, treat as literal text
        continue;
      }

      // Add text before placeholder
      const beforeText = template.slice(startIndex, i);
      message.push(beforeText.replace(/{{/g, "{").replace(/}}/g, "}"));

      // Extract and process placeholder key
      const key = template.slice(i + 1, closeIndex);

      // Resolve property value
      let prop: unknown;

      // Check for wildcard patterns
      const trimmedKey = key.trim();
      if (trimmedKey === "*") {
        // This is a wildcard pattern
        prop = key in properties
          ? properties[key]
          : "*" in properties
          ? properties["*"]
          : properties;
      } else {
        // Regular property lookup with possible whitespace handling
        if (key !== trimmedKey) {
          // Key has leading/trailing whitespace
          prop = key in properties ? properties[key] : properties[trimmedKey];
        } else {
          // Key has no leading/trailing whitespace
          prop = properties[key];
        }
      }

      message.push(prop);
      i = closeIndex; // Move to the }
      startIndex = i + 1;
    } else if (char === "}" && i + 1 < length && template[i + 1] === "}") {
      // Escaped } character - skip
      i++; // Skip the next }
    }
  }

  // Add remaining text
  const remainingText = template.slice(startIndex);
  message.push(remainingText.replace(/{{/g, "{").replace(/}}/g, "}"));

  return message;
}

/**
 * Render a message template with values.
 * @param template The message template.
 * @param values The message template values.
 * @returns The message template values interleaved between the substitution
 *          values.
 */
export function renderMessage(
  template: TemplateStringsArray,
  values: readonly unknown[],
): unknown[] {
  const args = [];
  for (let i = 0; i < template.length; i++) {
    args.push(template[i]);
    if (i < values.length) args.push(values[i]);
  }
  return args;
}
