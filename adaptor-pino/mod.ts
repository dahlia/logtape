import type { Logger } from "pino";
import type { LogRecord, Sink } from "@logtape/logtape";

/**
 * Options for configuring the Pino sink adapter.
 * @since 1.0.0
 */
export interface PinoSinkOptions {
  /**
   * Configuration for how LogTape categories are handled in Pino logs.
   * - `false` or `undefined`: Categories are not included in the log message
   * - `true`: Categories are included with default formatting
   * - `CategoryOptions`: Custom category formatting configuration
   */
  readonly category?: boolean | CategoryOptions;
}

/**
 * Configuration options for formatting LogTape categories in Pino log messages.
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

/**
 * Creates a LogTape sink that forwards log records to a Pino logger.
 *
 * This adapter allows LogTape-enabled libraries to integrate seamlessly with
 * applications that use Pino for logging.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getPinoSink } from "@logtape/adaptor-pino";
 * import pino from "pino";
 *
 * const pinoLogger = pino();
 *
 * await configure({
 *   sinks: {
 *     pino: getPinoSink(pinoLogger, {
 *       category: {
 *         position: "start",
 *         decorator: "[]",
 *         separator: "."
 *       }
 *     })
 *   },
 *   loggers: [
 *     { category: "my-library", sinks: ["pino"] }
 *   ]
 * });
 * ```
 *
 * @typeParam CustomLevels The custom log levels supported by the Pino logger.
 * @typeParam UseOnlyCustomLevels Whether to use only custom levels defined
 *                                in the Pino logger.
 * @param logger The Pino logger instance to forward logs to.
 * @param options Configuration options for the sink adapter.
 * @returns A LogTape sink function that can be used in LogTape configuration.
 * @since 1.0.0
 */
export function getPinoSink<
  CustomLevels extends string,
  UseOnlyCustomLevels extends boolean,
>(
  logger: Logger<CustomLevels, UseOnlyCustomLevels>,
  options?: PinoSinkOptions,
): Sink {
  const categoryOptions = !options?.category
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
    switch (record.level) {
      case "trace":
        return logger.trace(record.properties, message, interpolationValues);
      case "debug":
        return logger.debug(record.properties, message, interpolationValues);
      case "info":
        return logger.info(record.properties, message, interpolationValues);
      case "warning":
        return logger.warn(record.properties, message, interpolationValues);
      case "error":
        return logger.error(record.properties, message, interpolationValues);
      case "fatal":
        return logger.fatal(record.properties, message, interpolationValues);
    }
  };
}
