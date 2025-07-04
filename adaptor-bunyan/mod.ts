import { configureSync, type LogRecord, type Sink } from "@logtape/logtape";
import type bunyan from "bunyan";

/**
 * Options for configuring the Bunyan sink adapter.
 * @since 1.0.0
 */
export interface BunyanSinkOptions {
  /**
   * Configuration for how LogTape categories are handled in Bunyan logs.
   * - `false` or `undefined`: Categories are not included in the log message
   * - `true`: Categories are included with default formatting
   * - `CategoryOptions`: Custom category formatting configuration
   */
  readonly category?: boolean | CategoryOptions;
  /**
   * If true, each log record will use a Bunyan child logger with the category as context.
   * If a function, it will be called with the record and should return the child context object.
   * @default false
   */
  readonly childLogger?:
    | boolean
    | ((record: LogRecord) => Record<string, unknown>);
  /**
   * Custom Bunyan serializers to use when creating the default logger.
   * Ignored if a custom logger is provided.
   */
  readonly serializers?: Record<string, unknown>;
}

/**
 * Configuration options for formatting LogTape categories in Bunyan log messages.
 * @since 1.0.0
 */
export interface CategoryOptions {
  /**
   * The separator used to join category parts when multiple categories exist.
   * @default "."
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

/**
 * Creates a LogTape sink that forwards log records to a Bunyan logger.
 *
 * This adapter allows LogTape-enabled libraries to integrate seamlessly with
 * applications that use Bunyan for logging.
 *
 * If no logger is provided, a default Bunyan logger with name 'logtape' is used.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getBunyanSink } from "@logtape/adaptor-bunyan";
 *
 * // Uses default logger
 * const sink = getBunyanSink();
 *
 * // Or provide your own
 * import bunyan from "bunyan";
 * const bunyanLogger = bunyan.createLogger({ name: "my-app" });
 * const sink2 = getBunyanSink(bunyanLogger);
 * ```
 *
 * @param logger The Bunyan logger instance to forward logs to. If omitted, a default logger is created.
 * @param options Configuration options for the sink adapter.
 * @returns A LogTape sink function that can be used in LogTape configuration.
 * @since 1.0.0
 */
export async function getBunyanSink(
  logger?: bunyan,
  options: BunyanSinkOptions = {},
): Promise<Sink> {
  let actualLogger = logger;
  if (!actualLogger) {
    // Dynamically import bunyan if not provided
    // @ts-ignore: dynamic import for runtime
    const bunyanModule = typeof require === "function"
      ? require("bunyan")
      : (await import("bunyan")).default;
    actualLogger = bunyanModule.createLogger({
      name: "logtape",
      ...(options.serializers ? { serializers: options.serializers } : {}),
    });
  }
  const categoryOptions = !options.category
    ? undefined
    : typeof options.category === "object"
    ? options.category
    : {};
  const category: Required<CategoryOptions> | undefined =
    categoryOptions == null ? undefined : {
      separator: categoryOptions.separator ?? ".",
      position: categoryOptions.position ?? "start",
      decorator: categoryOptions.decorator ?? ":",
    };
  return (record: LogRecord) => {
    let message = "";
    const interpolationValues: unknown[] = [];
    if (category?.position === "start" && record.category.length > 0) {
      message += category.decorator === "[]"
        ? "[%s] "
        : category.decorator === "()"
        ? "(%s) "
        : category.decorator === "<>"
        ? "<%s> "
        : category.decorator === "{}"
        ? "{%s} "
        : category.decorator === ":"
        ? "%s: "
        : category.decorator === "-"
        ? "%s - "
        : category.decorator === "|"
        ? "%s | "
        : category.decorator === "/"
        ? "%s / "
        : "%s ";
      interpolationValues.push(
        record.category.join(category.separator),
      );
    }
    for (let i = 0; i < record.message.length; i += 2) {
      message += record.message[i];
      if (i + 1 < record.message.length) {
        message += "%o";
        interpolationValues.push(record.message[i + 1]);
      }
    }
    if (category?.position === "end" && record.category.length > 0) {
      message += category.decorator === "[]"
        ? " [%s]"
        : category.decorator === "()"
        ? " (%s)"
        : category.decorator === "<>"
        ? " <%s>"
        : category.decorator === "{}"
        ? " {%s}"
        : category.decorator === ":"
        ? ": %s"
        : category.decorator === "-"
        ? " - %s"
        : category.decorator === "|"
        ? " | %s"
        : category.decorator === "/"
        ? " / %s"
        : " %s";
      interpolationValues.push(
        record.category.join(category.separator),
      );
    }
    // Map LogTape levels to Bunyan levels
    let bunyanLevel: bunyan.LogLevelString;
    switch (record.level) {
      case "trace":
        bunyanLevel = "trace";
        break;
      case "debug":
        bunyanLevel = "debug";
        break;
      case "info":
        bunyanLevel = "info";
        break;
      case "warning":
        bunyanLevel = "warn";
        break;
      case "error":
        bunyanLevel = "error";
        break;
      case "fatal":
        bunyanLevel = "fatal";
        break;
      default:
        bunyanLevel = "info";
    }
    // Bunyan does not support printf-style interpolation, so we join values
    const formattedMessage = interpolationValues.length > 0
      ? message.replace(/%[so]/g, () => String(interpolationValues.shift()))
      : message;
    // Handle child logger option
    let loggerForRecord = actualLogger;
    if (options.childLogger) {
      let childContext: Record<string, unknown>;
      if (typeof options.childLogger === "function") {
        childContext = options.childLogger(record);
      } else {
        childContext = {
          category: record.category.join(category?.separator ?? "."),
        };
      }
      if (actualLogger) {
        loggerForRecord = actualLogger.child(childContext);
      }
    }
    if (loggerForRecord) {
      loggerForRecord[bunyanLevel](record.properties, formattedMessage);
    }
  };
}

/**
 * Automatically configures LogTape to route all logs to a Bunyan logger.
 *
 * This is a convenience function that automatically sets up LogTape to forward
 * all log records to a Bunyan logger instance.
 *
 * @example Basic auto-configuration
 * ```typescript
 * import bunyan from "bunyan";
 * import { install } from "@logtape/adaptor-bunyan";
 *
 * const bunyanLogger = bunyan.createLogger({ name: "my-app" });
 *
 * // Automatically route all LogTape logs to the Bunyan logger
 * install(bunyanLogger);
 *
 * // Now any LogTape-enabled library will log through Bunyan
 * import { getLogger } from "@logtape/logtape";
 * const logger = getLogger("my-app");
 * logger.info("This will be logged through Bunyan");
 * ```
 *
 * @param logger The Bunyan logger instance to forward logs to.
 * @param options Configuration options for the sink adapter.
 * @since 1.0.0
 */
export async function install(
  logger: bunyan,
  options: BunyanSinkOptions = {},
): Promise<void> {
  configureSync({
    sinks: {
      bunyan: await getBunyanSink(logger, options),
    },
    loggers: [
      {
        category: ["logtape", "meta"],
        sinks: ["bunyan"],
        lowestLevel: "warning",
      },
      { category: [], sinks: ["bunyan"] },
    ],
  });
}
