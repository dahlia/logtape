/**
 * A winston adapter for LogTape logging library.
 *
 * This module provides functionality to integrate LogTape with winston,
 * allowing LogTape logs to be forwarded to winston loggers while maintaining
 * structured logging capabilities and category information.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import winston from "winston";
 * import { getWinstonSink } from "@logtape/adaptor-winston";
 *
 * const winstonLogger = winston.createLogger({
 *   level: "info",
 *   format: winston.format.json(),
 *   transports: [new winston.transports.Console()]
 * });
 *
 * await configure({
 *   sinks: {
 *     winston: getWinstonSink(winstonLogger)
 *   },
 *   loggers: [
 *     { category: "myapp", sinks: ["winston"] }
 *   ]
 * });
 * ```
 *
 * @module
 * @since 1.0.0
 */
import {
  configureSync,
  type LogLevel,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import winston, { type LeveledLogMethod } from "winston";
import { inspect } from "node:util";

/**
 * Logger interface for Winston-compatible loggers.
 * @since 1.0.0
 */
export interface Logger {
  error: LeveledLogMethod;
  warn: LeveledLogMethod;
  info: LeveledLogMethod;
  http: LeveledLogMethod;
  verbose: LeveledLogMethod;
  debug: LeveledLogMethod;
  silly: LeveledLogMethod;
}

/**
 * Configuration options for the winston sink.
 *
 * @example Basic usage with default options
 * ```typescript
 * const sink = getWinstonSink(winstonLogger);
 * ```
 *
 * @example Custom level mapping
 * ```typescript
 * const sink = getWinstonSink(winstonLogger, {
 *   levelsMap: {
 *     "trace": "debug",
 *     "debug": "debug",
 *     "info": "info",
 *     "warning": "warn",
 *     "error": "error",
 *     "fatal": "error"
 *   }
 * });
 * ```
 *
 * @example Custom category formatting
 * ```typescript
 * const sink = getWinstonSink(winstonLogger, {
 *   category: {
 *     separator: ".",
 *     position: "start",
 *     decorator: "[]"
 *   }
 * });
 * ```
 *
 * @since 1.0.0
 */
export interface WinstonSinkOptions {
  /**
   * Mapping between LogTape log levels and winston log levels.
   *
   * By default, LogTape levels are mapped as follows:
   *
   * - `trace` → `silly`
   * - `debug` → `debug`
   * - `info` → `info`
   * - `warning` → `warn`
   * - `error` → `error`
   * - `fatal` → `error`
   */
  readonly levelsMap?: Readonly<Record<LogLevel, keyof Logger>>;

  /**
   * Configuration for how LogTape categories are handled in winston logs.
   *
   * - `false` or `undefined`: Categories are not included in the log message
   * - `true`: Categories are included with default formatting (":" decorator at start)
   * - `CategoryOptions`: Custom category formatting configuration
   *
   * @default undefined
   */
  readonly category?: boolean | CategoryOptions;

  /**
   * Custom formatter for interpolated values in log messages.
   *
   * This function is used to convert values that are interpolated into
   * log messages (e.g., the `name` in
   * `logger.info("Hello, {name}!", { name: "world" })`).
   *
   * @param value The value to format
   * @returns A string representation of the value
   * @default `inspect` (from `node:util` module)
   */
  readonly valueFormatter?: (value: unknown) => string;
}

/**
 * Configuration options for formatting LogTape categories in winston log messages.
 *
 * Categories in LogTape represent a hierarchical namespace for loggers
 * (e.g., ["myapp", "database", "connection"]). This interface controls
 * how these categories are formatted when included in winston log messages.
 *
 * @example Default formatting
 * ```typescript
 * // With category ["myapp", "db"] and default options:
 * // Output: "myapp·db: User logged in"
 * const options: CategoryOptions = {};
 * ```
 *
 * @example Custom separator and decorator
 * ```typescript
 * // With category ["myapp", "db"] and custom options:
 * // Output: "[myapp.db] User logged in"
 * const options: CategoryOptions = {
 *   separator: ".",
 *   decorator: "[]"
 * };
 * ```
 *
 * @example Category at end
 * ```typescript
 * // With category ["myapp", "db"] and position at end:
 * // Output: "User logged in: myapp·db"
 * const options: CategoryOptions = {
 *   position: "end"
 * };
 * ```
 *
 * @since 1.0.0
 */
export interface CategoryOptions {
  /**
   * The separator used to join category parts when multiple categories exist.
   * @default "·"
   */
  readonly separator?: string;

  /**
   * Where to position the category in the log message.
   * - `"start"`: Category appears at the beginning of the message
   * - `"end"`: Category appears at the end of the message
   * @default "start"
   */
  readonly position?: "start" | "end";

  /**
   * The decorator used to format the category in the log message.
   * - `"[]"`: [category] format
   * - `"()"`: (category) format
   * - `"<>"`: <category> format
   * - `"{}"`: {category} format
   * - `":"`: category: format
   * - `"-"`: category - format
   * - `"|"`: category | format
   * - `"/"`: category / format
   * - `""`: category format (no decoration)
   * @default ":"
   */
  readonly decorator?: "[]" | "()" | "<>" | "{}" | ":" | "-" | "|" | "/" | "";
}

const DEFAULT_LEVELS_MAP: Readonly<Record<LogLevel, keyof Logger>> = {
  "trace": "silly",
  "debug": "debug",
  "info": "info",
  "warning": "warn",
  "error": "error",
  "fatal": "error",
};

/**
 * Creates a LogTape sink that forwards log records to a winston logger.
 *
 * This function creates a sink function that can be used with LogTape's
 * configuration system. The sink will format LogTape log records and
 * forward them to the provided winston logger instance.
 *
 * @example Basic usage
 * ```typescript
 * import winston from "winston";
 * import { configure } from "@logtape/logtape";
 * import { getWinstonSink } from "@logtape/adaptor-winston";
 *
 * const winstonLogger = winston.createLogger({
 *   level: "info",
 *   format: winston.format.combine(
 *     winston.format.timestamp(),
 *     winston.format.json()
 *   ),
 *   transports: [new winston.transports.Console()]
 * });
 *
 * await configure({
 *   sinks: {
 *     winston: getWinstonSink(winstonLogger)
 *   },
 *   loggers: [
 *     { category: ["myapp"], sinks: ["winston"] }
 *   ]
 * });
 * ```
 *
 * @example With custom options
 * ```typescript
 * const sink = getWinstonSink(winstonLogger, {
 *   category: {
 *     separator: ".",
 *     position: "start",
 *     decorator: "[]"
 *   },
 *   levelsMap: {
 *     "trace": "debug",  // Map trace to debug instead of silly
 *     "debug": "debug",
 *     "info": "info",
 *     "warning": "warn",
 *     "error": "error",
 *     "fatal": "error"
 *   }
 * });
 * ```
 *
 * @param logger The winston logger instance to forward logs to. Must implement
 *               the Logger interface with error, warn, info, http, verbose,
 *               debug, and silly methods.
 * @param options Configuration options for the sink behavior.
 * @returns A sink function that can be used with LogTape's configure() function.
 * @since 1.0.0
 */
export function getWinstonSink(
  logger: Logger,
  options: WinstonSinkOptions = {},
): Sink {
  const { levelsMap = DEFAULT_LEVELS_MAP, valueFormatter = inspect } = options;
  const categoryOptions = !options.category
    ? undefined
    : typeof options.category === "object"
    ? options.category
    : {};
  const category: Required<CategoryOptions> | undefined =
    categoryOptions == null ? undefined : {
      separator: categoryOptions.separator ?? "·",
      position: categoryOptions.position ?? "start",
      decorator: categoryOptions.decorator ?? ":",
    };

  return (record: LogRecord) => {
    const level = levelsMap[record.level];
    let message = "";
    if (category?.position === "start" && record.category.length > 0) {
      const joinedCategory = record.category.join(category.separator);
      message += category.decorator === "[]"
        ? `[${joinedCategory}] `
        : category.decorator === "()"
        ? `(${joinedCategory}) `
        : category.decorator === "<>"
        ? `<${joinedCategory}> `
        : category.decorator === "{}"
        ? `{${joinedCategory}} `
        : category.decorator === ":"
        ? `${joinedCategory}: `
        : category.decorator === "-"
        ? `${joinedCategory} - `
        : category.decorator === "|"
        ? `${joinedCategory} | `
        : category.decorator === "/"
        ? `${joinedCategory} / `
        : `${joinedCategory} `;
    }
    for (let i = 0; i < record.message.length; i += 2) {
      message += record.message[i];
      if (i + 1 < record.message.length) {
        message += valueFormatter(record.message[i + 1]);
      }
    }
    if (category?.position === "end" && record.category.length > 0) {
      const joinedCategory = record.category.join(category.separator);
      message += category.decorator === "[]"
        ? ` [${joinedCategory}]`
        : category.decorator === "()"
        ? ` (${joinedCategory})`
        : category.decorator === "<>"
        ? ` <${joinedCategory}>`
        : category.decorator === "{}"
        ? ` {${joinedCategory}}`
        : category.decorator === ":"
        ? `: ${joinedCategory}`
        : category.decorator === "-"
        ? ` - ${joinedCategory}`
        : category.decorator === "|"
        ? ` | ${joinedCategory}`
        : category.decorator === "/"
        ? ` / ${joinedCategory}`
        : ` ${joinedCategory}`;
    }
    logger[level](message, record.properties);
  };
}

/**
 * Automatically configures LogTape to route all logs to a winston logger.
 *
 * This is a convenience function that automatically sets up LogTape to forward
 * all log records to a winston logger instance. By default, it uses winston's
 * default logger, but you can provide a custom logger as the first parameter.
 *
 * @param logger The winston logger instance to use.
 * @param options Configuration options for the winston sink behavior.
 *
 * @example Basic auto-configuration with default logger
 * ```typescript
 * import { install } from "@logtape/adaptor-winston";
 *
 * // Automatically route all LogTape logs to winston's default logger
 * install();
 *
 * // Now any LogTape-enabled library will log through winston
 * import { getLogger } from "@logtape/logtape";
 * const logger = getLogger("my-app");
 * logger.info("This will be logged through winston");
 * ```
 *
 * @example Auto-configuration with custom winston logger
 * ```typescript
 * import winston from "winston";
 * import { install } from "@logtape/adaptor-winston";
 *
 * const customLogger = winston.createLogger({
 *   level: "info",
 *   format: winston.format.combine(
 *     winston.format.timestamp(),
 *     winston.format.json()
 *   ),
 *   transports: [
 *     new winston.transports.Console(),
 *     new winston.transports.File({ filename: "app.log" })
 *   ]
 * });
 *
 * // Install with custom logger
 * install(customLogger);
 * ```
 *
 * @example Auto-configuration with custom options
 * ```typescript
 * import { install } from "@logtape/adaptor-winston";
 *
 * install(undefined, {
 *   category: {
 *     position: "start",
 *     decorator: "[]",
 *     separator: "."
 *   },
 *   levelsMap: {
 *     "trace": "debug"  // Map LogTape trace to winston debug
 *   }
 * });
 * ```
 *
 * @example Custom logger with custom options
 * ```typescript
 * import winston from "winston";
 * import { install } from "@logtape/adaptor-winston";
 *
 * const customLogger = winston.createLogger({
 *   transports: [new winston.transports.Console()]
 * });
 *
 * install(customLogger, {
 *   category: { position: "start", decorator: "[]" }
 * });
 * ```
 *
 * @since 1.0.0
 */
export function install(
  logger: Logger,
  options?: WinstonSinkOptions,
): void;

/**
 * Configures LogTape to route all logs to winston's default logger.
 *
 * @param options Optional configuration for the winston sink behavior.
 * @since 1.0.0
 */
export function install(
  options?: WinstonSinkOptions,
): void;

export function install(
  loggerOrOptions?: Logger | WinstonSinkOptions,
  options: WinstonSinkOptions = {},
): void {
  let logger: Logger;
  let sinkOptions: WinstonSinkOptions;

  // Handle overloaded parameters
  if (
    loggerOrOptions && ("error" in loggerOrOptions || "info" in loggerOrOptions)
  ) {
    // First parameter is a Logger
    logger = loggerOrOptions as Logger;
    sinkOptions = options;
  } else {
    // First parameter is WinstonSinkOptions or undefined
    logger = winston;
    sinkOptions = (loggerOrOptions as WinstonSinkOptions) || {};
  }

  configureSync({
    sinks: {
      winston: getWinstonSink(logger, sinkOptions),
    },
    loggers: [
      { category: [], sinks: ["winston"] },
    ],
  });
}
