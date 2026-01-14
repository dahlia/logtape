/**
 * A log4js adapter for LogTape logging library.
 *
 * This module provides functionality to integrate LogTape with log4js,
 * allowing LogTape logs to be forwarded to log4js loggers while maintaining
 * structured logging capabilities and category information.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import log4js from "log4js";
 * import { getLog4jsSink } from "@logtape/adaptor-log4js";
 *
 * log4js.configure({
 *   appenders: { out: { type: "stdout" } },
 *   categories: { default: { appenders: ["out"], level: "info" } }
 * });
 *
 * await configure({
 *   sinks: {
 *     log4js: getLog4jsSink()
 *   },
 *   loggers: [
 *     { category: "myapp", sinks: ["log4js"] }
 *   ]
 * });
 * ```
 *
 * @module
 * @since 2.0.0
 */
import {
  configureSync,
  type LogLevel,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import { inspect } from "node:util";
import type log4js from "log4js";

/**
 * Logger interface for log4js-compatible loggers.
 * @since 2.0.0
 */
export interface Logger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  addContext: (key: string, value: unknown) => void;
  removeContext: (key: string) => void;
  clearContext: () => void;
}

/**
 * Log method signature for log4js.
 * @since 2.0.0
 */
export interface LogMethod {
  (message: string, ...args: unknown[]): void;
}

/**
 * log4js log level type.
 * @since 2.0.0
 */
export type Log4jsLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

/**
 * Strategy for handling LogTape properties in log4js.
 * @since 2.0.0
 */
export type ContextStrategy = "mdc" | "args";

/**
 * Strategy for handling existing log4js context.
 * @since 2.0.0
 */
export type ContextPreservation = "preserve" | "merge" | "replace";

/**
 * Base configuration options shared by all context strategies.
 * @since 2.0.0
 */
export interface Log4jsSinkOptionsBase {
  /**
   * Mapping between LogTape log levels and log4js log levels.
   *
   * By default, LogTape levels are mapped as follows:
   *
   * - `trace` → `trace`
   * - `debug` → `debug`
   * - `info` → `info`
   * - `warning` → `warn`
   * - `error` → `error`
   * - `fatal` → `fatal`
   */
  readonly levelsMap?: Readonly<Record<LogLevel, Log4jsLevel>>;

  /**
   * Custom mapper function to convert LogTape categories to log4js category strings.
   *
   * By default, LogTape categories are joined with dots (e.g., `["app", "db"]` becomes `"app.db"`).
   *
   * @param category The LogTape category array
   * @returns The log4js category string
   * @default (category) => category.join(".")
   *
   * @example
   * ```typescript
   * // Use :: as separator
   * categoryMapper: (cat) => cat.join("::")
   * ```
   *
   * @example
   * ```typescript
   * // Custom logic for category mapping
   * categoryMapper: (cat) => {
   *   if (cat.length === 0) return "default";
   *   return cat.join(".");
   * }
   * ```
   */
  readonly categoryMapper?: (category: readonly string[]) => string;

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
 * Configuration options for log4js sink with MDC (Mapped Diagnostic Context) strategy.
 * @since 2.0.0
 */
export interface Log4jsSinkOptionsMdc extends Log4jsSinkOptionsBase {
  /**
   * Strategy for handling LogTape properties.
   *
   * Use `"mdc"` to leverage log4js's built-in MDC (Mapped Diagnostic Context) feature.
   *
   * @default "mdc"
   */
  readonly contextStrategy?: "mdc";

  /**
   * Strategy for handling existing log4js context when using MDC strategy.
   *
   * - `"preserve"` (default): Preserve existing context by saving and restoring it
   * - `"merge"`: Merge LogTape properties with existing context (existing values take precedence)
   * - `"replace"`: Replace existing context with LogTape properties
   *
   * @default "preserve"
   *
   * @example
   * ```typescript
   * // Preserve existing context (default)
   * const sink = getLog4jsSink(undefined, undefined, {
   *   contextStrategy: "mdc",
   *   contextPreservation: "preserve"
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Merge with existing context
   * const sink = getLog4jsSink(undefined, undefined, {
   *   contextStrategy: "mdc",
   *   contextPreservation: "merge"
   * });
   * ```
   */
  readonly contextPreservation?: ContextPreservation;
}

/**
 * Configuration options for log4js sink with args strategy.
 * @since 2.0.0
 */
export interface Log4jsSinkOptionsArgs extends Log4jsSinkOptionsBase {
  /**
   * Strategy for handling LogTape properties.
   *
   * Use `"args"` to pass properties as additional arguments to log methods.
   */
  readonly contextStrategy: "args";
}

/**
 * Configuration options for the log4js sink.
 *
 * This is a discriminated union type based on the `contextStrategy` option.
 * When `contextStrategy` is `"mdc"` (or omitted), the `contextPreservation` option
 * is available. When `contextStrategy` is `"args"`, the `contextPreservation` option
 * is not allowed.
 *
 * @example Basic usage with default options (MDC strategy)
 * ```typescript
 * const sink = getLog4jsSink();
 * ```
 *
 * @example Custom level mapping
 * ```typescript
 * const sink = getLog4jsSink(undefined, undefined, {
 *   levelsMap: {
 *     "trace": "debug",
 *     "debug": "debug",
 *     "info": "info",
 *     "warning": "warn",
 *     "error": "error",
 *     "fatal": "fatal"
 *   }
 * });
 * ```
 *
 * @example Custom category mapping
 * ```typescript
 * const sink = getLog4jsSink(undefined, undefined, {
 *   categoryMapper: (category) => category.join("::")
 * });
 * ```
 *
 * @example Using MDC strategy with preserve (default)
 * ```typescript
 * const sink = getLog4jsSink(undefined, undefined, {
 *   contextStrategy: "mdc",
 *   contextPreservation: "preserve"
 * });
 * ```
 *
 * @example Using args strategy
 * ```typescript
 * const sink = getLog4jsSink(undefined, undefined, {
 *   contextStrategy: "args"
 *   // contextPreservation is not allowed here
 * });
 * ```
 *
 * @since 2.0.0
 */
export type Log4jsSinkOptions =
  | Log4jsSinkOptionsMdc
  | Log4jsSinkOptionsArgs;

const DEFAULT_LEVELS_MAP: Readonly<Record<LogLevel, Log4jsLevel>> = {
  "trace": "trace",
  "debug": "debug",
  "info": "info",
  "warning": "warn",
  "error": "error",
  "fatal": "fatal",
};

const DEFAULT_CATEGORY_MAPPER = (category: readonly string[]): string =>
  category.length === 0 ? "" : category.join(".");

/**
 * Creates a LogTape sink that forwards log records to a log4js logger.
 *
 * This function creates a sink function that can be used with LogTape's
 * configuration system. The sink will format LogTape log records and
 * forward them to the provided log4js logger instance or create one
 * based on the LogTape category.
 *
 * @example Basic usage with default log4js logger
 * ```typescript
 * import log4js from "log4js";
 * import { configure } from "@logtape/logtape";
 * import { getLog4jsSink } from "@logtape/adaptor-log4js";
 *
 * log4js.configure({
 *   appenders: { out: { type: "stdout" } },
 *   categories: { default: { appenders: ["out"], level: "info" } }
 * });
 *
 * await configure({
 *   sinks: {
 *     log4js: getLog4jsSink()
 *   },
 *   loggers: [
 *     { category: ["myapp"], sinks: ["log4js"] }
 *   ]
 * });
 * ```
 *
 * @example With custom log4js logger
 * ```typescript
 * import log4js from "log4js";
 * import { getLog4jsSink } from "@logtape/adaptor-log4js";
 *
 * const logger = log4js.getLogger("custom");
 * const sink = getLog4jsSink(logger);
 * ```
 *
 * @example With custom options
 * ```typescript
 * const sink = getLog4jsSink(undefined, {
 *   categoryMapper: (cat) => cat.join("::"),
 *   contextStrategy: "args",
 *   levelsMap: {
 *     "trace": "debug",
 *     "debug": "debug",
 *     "info": "info",
 *     "warning": "warn",
 *     "error": "error",
 *     "fatal": "fatal"
 *   }
 * });
 * ```
 *
 * @param log4jsModule The log4js module instance. If not provided, log4js will be imported dynamically.
 * @param logger The log4js logger instance to forward logs to. If not provided,
 *               a logger will be created for each LogTape category using log4js.getLogger().
 * @param options Configuration options for the sink behavior.
 * @returns A sink function that can be used with LogTape's configure() function.
 * @since 2.0.0
 */
export function getLog4jsSink(
  log4jsModule?: typeof log4js,
  logger?: Logger,
  options: Log4jsSinkOptions = {},
): Sink {
  const {
    levelsMap = DEFAULT_LEVELS_MAP,
    categoryMapper = DEFAULT_CATEGORY_MAPPER,
    valueFormatter = inspect,
  } = options;

  const contextStrategy = options.contextStrategy ?? "mdc";
  const contextPreservation =
    contextStrategy === "mdc" && "contextPreservation" in options
      ? options.contextPreservation ?? "preserve"
      : "preserve"; // Default value, won't be used for "args" strategy

  // Cache for loggers by category
  const loggerCache = new Map<string, Logger>();

  const getLoggerForCategory = (category: readonly string[]): Logger => {
    if (logger) return logger;

    const categoryStr = categoryMapper(category);
    if (loggerCache.has(categoryStr)) {
      return loggerCache.get(categoryStr)!;
    }

    if (!log4jsModule) {
      throw new Error(
        "log4js module must be provided when not using a fixed logger",
      );
    }

    const newLogger = categoryStr
      ? log4jsModule.getLogger(categoryStr)
      : log4jsModule.getLogger();
    loggerCache.set(categoryStr, newLogger);
    return newLogger;
  };

  return (record: LogRecord) => {
    const targetLogger = getLoggerForCategory(record.category);
    const level = levelsMap[record.level];

    // Build message
    let message = "";
    for (let i = 0; i < record.message.length; i += 2) {
      message += record.message[i];
      if (i + 1 < record.message.length) {
        message += valueFormatter(record.message[i + 1]);
      }
    }

    if (contextStrategy === "mdc") {
      // MDC strategy: use log4js context
      const propertiesToAdd = Object.entries(record.properties);

      if (contextPreservation === "preserve") {
        // Save and restore context
        propertiesToAdd.forEach(([key, value]) => {
          targetLogger.addContext(key, value);
        });

        targetLogger[level](message);

        propertiesToAdd.forEach(([key]) => {
          targetLogger.removeContext(key);
        });
      } else if (contextPreservation === "merge") {
        // Merge with existing context (don't overwrite existing keys)
        propertiesToAdd.forEach(([key, value]) => {
          targetLogger.addContext(key, value);
        });

        targetLogger[level](message);
        // Don't remove - leave merged context
      } else {
        // replace: Replace existing context
        targetLogger.clearContext();
        propertiesToAdd.forEach(([key, value]) => {
          targetLogger.addContext(key, value);
        });

        targetLogger[level](message);
      }
    } else {
      // args strategy: pass properties as arguments
      targetLogger[level](message, record.properties);
    }
  };
}

/**
 * Automatically configures LogTape to route all logs to log4js.
 *
 * This is a convenience function that automatically sets up LogTape to forward
 * all log records to log4js. By default, it creates loggers based on LogTape
 * categories using log4js.getLogger(), but you can provide a custom logger
 * as the second parameter.
 *
 * @param log4jsModule The log4js module instance. If not provided, log4js will be imported dynamically.
 * @param logger Optional log4js logger instance to use for all logs.
 * @param options Configuration options for the log4js sink behavior.
 *
 * @example Basic auto-configuration
 * ```typescript
 * import log4js from "log4js";
 * import { install } from "@logtape/adaptor-log4js";
 *
 * log4js.configure({
 *   appenders: { out: { type: "stdout" } },
 *   categories: { default: { appenders: ["out"], level: "info" } }
 * });
 *
 * // Automatically route all LogTape logs to log4js
 * install(log4js);
 *
 * // Now any LogTape-enabled library will log through log4js
 * import { getLogger } from "@logtape/logtape";
 * const logger = getLogger("my-app");
 * logger.info("This will be logged through log4js");
 * ```
 *
 * @example Auto-configuration with custom logger
 * ```typescript
 * import log4js from "log4js";
 * import { install } from "@logtape/adaptor-log4js";
 *
 * const customLogger = log4js.getLogger("myapp");
 *
 * // Install with custom logger
 * install(log4js, customLogger);
 * ```
 *
 * @example Auto-configuration with custom options
 * ```typescript
 * import log4js from "log4js";
 * import { install } from "@logtape/adaptor-log4js";
 *
 * install(log4js, undefined, {
 *   categoryMapper: (cat) => cat.join("::"),
 *   contextStrategy: "args"
 * });
 * ```
 *
 * @since 2.0.0
 */
export function install(
  log4jsModule: typeof log4js,
  logger?: Logger,
  options?: Log4jsSinkOptions,
): void {
  configureSync({
    sinks: {
      log4js: getLog4jsSink(log4jsModule, logger, options),
    },
    loggers: [
      {
        category: ["logtape", "meta"],
        sinks: ["log4js"],
        lowestLevel: "warning",
      },
      { category: [], sinks: ["log4js"] },
    ],
  });
}
