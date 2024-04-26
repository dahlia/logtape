import type { Filter } from "./filter.ts";
import type { LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

/**
 * A logger interface.  It provides methods to log messages at different
 * severity levels.
 *
 * ```typescript
 * const logger = getLogger("category");
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
   * Lazily log a debug message.  Use this when the message values are expensive
   * to compute and should only be computed if the message is actually logged.
   *
   * ```typescript
   * logger.debug(l => l`A debug message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
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
   * Lazily log an informational message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.info(l => l`An info message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
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
   * Lazily log a warning message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.warn(l => l`A warning message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   */
  warn(callback: LogCallback): void;

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
   * Lazily log an error message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.error(l => l`An error message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
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
   * Lazily log a fatal error message.  Use this when the message values are
   * expensive to compute and should only be computed if the message is actually
   * logged.
   *
   * ```typescript
   * logger.fatal(l => l`A fatal error message with ${expensiveValue()}.`);
   * ```
   *
   * @param callback A callback that returns the message template prefix.
   */
  fatal(callback: LogCallback): void;
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
 * The root logger.
 */
let rootLogger: LoggerImpl | null = null;

/**
 * A logger implementation.  Do not use this directly; use {@link getLogger}
 * instead.  This class is exported for testing purposes.
 */
export class LoggerImpl implements Logger {
  readonly parent: LoggerImpl | null;
  readonly children: Record<string, WeakRef<LoggerImpl>>;
  readonly category: readonly string[];
  readonly sinks: Sink[];
  readonly filters: Filter[];

  static getLogger(category: string | readonly string[] = []): LoggerImpl {
    if (rootLogger == null) {
      rootLogger = new LoggerImpl(null, []);
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
      | readonly [string, ...readonly string[]],
  ): LoggerImpl {
    const name = typeof subcategory === "string" ? subcategory : subcategory[0];
    let child: LoggerImpl | undefined = this.children[name]?.deref();
    if (child == null) {
      child = new LoggerImpl(this, [...this.category, name]);
      this.children[name] = new WeakRef(child);
    }
    if (typeof subcategory === "string" || subcategory.length === 1) {
      return child;
    }
    return child.getChild(
      subcategory.slice(1) as [string, ...readonly string[]],
    );
  }

  /**
   * Reset the logger.  This removes all sinks and filters from the logger.
   */
  reset(): void {
    while (this.sinks.length > 0) this.sinks.shift();
    while (this.filters.length > 0) this.filters.shift();
  }

  /**
   * Reset the logger and all its descendants.  This removes all sinks and
   * filters from the logger and all its descendants.
   */
  resetDescendants(): void {
    for (const child of Object.values(this.children)) {
      const logger = child.deref();
      if (logger != null) logger.resetDescendants();
    }
    this.reset();
  }

  filter(record: LogRecord): boolean {
    for (const filter of this.filters) {
      if (!filter(record)) return false;
    }
    if (this.filters.length < 1) return this.parent?.filter(record) ?? true;
    return true;
  }

  *getSinks(): Iterable<Sink> {
    if (this.parent != null) {
      for (const sink of this.parent.getSinks()) yield sink;
    }
    for (const sink of this.sinks) yield sink;
  }

  emit(record: LogRecord, bypassSinks?: Set<Sink>): void {
    if (!this.filter(record)) return;
    for (const sink of this.getSinks()) {
      if (bypassSinks?.has(sink)) continue;
      try {
        sink(record);
      } catch (error) {
        const bypassSinks2 = new Set(bypassSinks);
        bypassSinks2.add(sink);
        metaLogger.log(
          "fatal",
          "Failed to emit a log record to sink {sink}: {error}",
          { sink, error, record },
          bypassSinks2,
        );
      }
    }
  }

  log(
    level: LogLevel,
    message: string,
    properties: Record<string, unknown> | (() => Record<string, unknown>),
    bypassSinks?: Set<Sink>,
  ): void {
    let cachedProps: Record<string, unknown> | undefined = undefined;
    const record: LogRecord = typeof properties === "function"
      ? {
        category: this.category,
        level,
        timestamp: Date.now(),
        get message() {
          return parseMessageTemplate(message, this.properties);
        },
        get properties() {
          if (cachedProps == null) cachedProps = properties();
          return cachedProps;
        },
      }
      : {
        category: this.category,
        level,
        timestamp: Date.now(),
        message: parseMessageTemplate(message, properties),
        properties,
      };
    this.emit(record, bypassSinks);
  }

  logLazily(
    level: LogLevel,
    callback: LogCallback,
  ): void {
    let msg: unknown[] | undefined = undefined;
    this.emit({
      category: this.category,
      level,
      get message() {
        if (msg == null) {
          msg = callback((tpl, ...values) => renderMessage(tpl, values));
        }
        return msg;
      },
      timestamp: Date.now(),
      properties: {},
    });
  }

  logTemplate(
    level: LogLevel,
    messageTemplate: TemplateStringsArray,
    values: unknown[],
  ): void {
    this.emit({
      category: this.category,
      level,
      message: renderMessage(messageTemplate, values),
      timestamp: Date.now(),
      properties: {},
    });
  }

  debug(
    message: TemplateStringsArray | string | LogCallback,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("debug", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("debug", message);
    } else {
      this.logTemplate("debug", message, values);
    }
  }

  info(
    message: TemplateStringsArray | string | LogCallback,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("info", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("info", message);
    } else {
      this.logTemplate("info", message, values);
    }
  }

  warn(
    message: TemplateStringsArray | string | LogCallback,
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
    } else {
      this.logTemplate("warning", message, values);
    }
  }

  error(
    message: TemplateStringsArray | string | LogCallback,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("error", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("error", message);
    } else {
      this.logTemplate("error", message, values);
    }
  }

  fatal(
    message: TemplateStringsArray | string | LogCallback,
    ...values: unknown[]
  ): void {
    if (typeof message === "string") {
      this.log("fatal", message, (values[0] ?? {}) as Record<string, unknown>);
    } else if (typeof message === "function") {
      this.logLazily("fatal", message);
    } else {
      this.logTemplate("fatal", message, values);
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
  const message: unknown[] = [];
  let part = "";
  for (let i = 0; i < template.length; i++) {
    const char = template.charAt(i);
    const nextChar = template.charAt(i + 1);

    if (char == "{" && nextChar == "{") {
      // Escaped { character
      part = part + char;
      i++;
    } else if (char == "}" && nextChar == "}") {
      // Escaped } character
      part = part + char;
      i++;
    } else if (char == "{") {
      // Start of a placeholder
      message.push(part);
      part = "";
    } else if (char == "}") {
      // End of a placeholder
      message.push(properties[part]);
      part = "";
    } else {
      // Default case
      part = part + char;
    }
  }
  message.push(part);
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
