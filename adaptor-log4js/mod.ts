import { configureSync, type LogRecord, type Sink } from "@logtape/logtape";
import type log4js from "log4js";

/**
 * Options for configuring the Log4js sink adapter.
 * @since 1.0.0
 */
export interface Log4jsSinkOptions {
  /**
   * If true, use the LogTape record's category to select the log4js logger.
   * If false or not set, use the provided logger or the default logger.
   * @default true
   */
  readonly useCategoryLogger?: boolean;
}

/**
 * Creates a LogTape sink that forwards log records to a log4js logger.
 *
 * This adapter allows LogTape-enabled libraries to integrate seamlessly with
 * applications that use log4js for logging.
 *
 * If no logger is provided, a default log4js logger is used.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getLog4jsSink } from "@logtape/adaptor-log4js";
 *
 * // Uses default logger
 * const sink = getLog4jsSink();
 *
 * // Or provide your own
 * import log4js from "log4js";
 * const logger = log4js.getLogger("my-app");
 * const sink2 = getLog4jsSink(logger);
 * ```
 *
 * @param logger The log4js logger instance to forward logs to. If omitted, a default logger is created.
 * @param options Configuration options for the sink adapter.
 * @returns A LogTape sink function that can be used in LogTape configuration.
 * @since 1.0.0
 */
export function getLog4jsSink(
  logger?: log4js.Logger,
  options: Log4jsSinkOptions = {},
): Sink {
  let log4jsModule: typeof log4js | undefined = undefined;
  let defaultLogger: log4js.Logger | undefined = undefined;
  function getLoggerForRecord(record: LogRecord): log4js.Logger {
    if (options.useCategoryLogger !== false && record.category.length > 0) {
      if (!log4jsModule) {
        // @ts-ignore: dynamic import for runtime
        log4jsModule = typeof require === "function"
          ? require("log4js")
          : (await import("log4js")).default;
      }
      return log4jsModule.getLogger(record.category.join("."));
    }
    if (logger) return logger;
    if (!defaultLogger) {
      if (!log4jsModule) {
        // @ts-ignore: dynamic import for runtime
        log4jsModule = typeof require === "function"
          ? require("log4js")
          : (await import("log4js")).default;
      }
      defaultLogger = log4jsModule.getLogger();
    }
    return defaultLogger;
  }
  return (record: LogRecord) => {
    const loggerForRecord = getLoggerForRecord(record);
    // Map LogTape levels to log4js levels
    let log4jsLevel: string;
    switch (record.level) {
      case "trace":
        log4jsLevel = "trace";
        break;
      case "debug":
        log4jsLevel = "debug";
        break;
      case "info":
        log4jsLevel = "info";
        break;
      case "warning":
        log4jsLevel = "warn";
        break;
      case "error":
        log4jsLevel = "error";
        break;
      case "fatal":
        log4jsLevel = "fatal";
        break;
      default:
        log4jsLevel = "info";
    }
    // Compose message
    let message = "";
    const interpolationValues: unknown[] = [];
    for (let i = 0; i < record.message.length; i += 2) {
      message += record.message[i];
      if (i + 1 < record.message.length) {
        message += "%o";
        interpolationValues.push(record.message[i + 1]);
      }
    }
    const formattedMessage = interpolationValues.length > 0
      ? message.replace(/%[so]/g, () => String(interpolationValues.shift()))
      : message;
    // Structured logging: pass properties as first arg if present
    if (record.properties && Object.keys(record.properties).length > 0) {
      (loggerForRecord as any)[log4jsLevel](record.properties, formattedMessage);
    } else {
      (loggerForRecord as any)[log4jsLevel](formattedMessage);
    }
  };
}

/**
 * Automatically configures LogTape to route all logs to a log4js logger.
 *
 * This is a convenience function that automatically sets up LogTape to forward
 * all log records to a log4js logger instance.
 *
 * @example Basic auto-configuration
 * ```typescript
 * import log4js from "log4js";
 * import { install } from "@logtape/adaptor-log4js";
 *
 * const logger = log4js.getLogger("my-app");
 *
 * // Automatically route all LogTape logs to the log4js logger
 * install(logger);
 *
 * // Now any LogTape-enabled library will log through log4js
 * import { getLogger } from "@logtape/logtape";
 * const logger2 = getLogger("my-app");
 * logger2.info("This will be logged through log4js");
 * ```
 *
 * @param logger The log4js logger instance to forward logs to.
 * @param options Configuration options for the sink adapter.
 * @since 1.0.0
 */
export function install(
  logger?: log4js.Logger,
  options: Log4jsSinkOptions = {},
): void {
  configureSync({
    sinks: {
      log4js: getLog4jsSink(logger, options),
    },
    loggers: [
      { sinks: ["log4js"] },
    ],
  });
} 
