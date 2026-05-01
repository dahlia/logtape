import type { LogRecord, Sink } from "@logtape/logtape";

/**
 * A structural representation of a [Bunyan] logger sufficient for the
 * adapter's needs.  Avoids importing Bunyan's own type definitions so the
 * package builds cleanly under both Deno and Node.js.
 *
 * [Bunyan]: https://github.com/trentm/node-bunyan
 *
 * @since 2.1.0
 */
export interface BunyanLogger {
  trace(
    mergeObject: Record<string, unknown>,
    format: string,
    ...args: unknown[]
  ): void;
  debug(
    mergeObject: Record<string, unknown>,
    format: string,
    ...args: unknown[]
  ): void;
  info(
    mergeObject: Record<string, unknown>,
    format: string,
    ...args: unknown[]
  ): void;
  warn(
    mergeObject: Record<string, unknown>,
    format: string,
    ...args: unknown[]
  ): void;
  error(
    mergeObject: Record<string, unknown>,
    format: string,
    ...args: unknown[]
  ): void;
  fatal(
    mergeObject: Record<string, unknown>,
    format: string,
    ...args: unknown[]
  ): void;
}

/**
 * Options for configuring the Bunyan sink adapter.
 * @since 2.1.0
 */
export interface BunyanSinkOptions {
  /**
   * Configuration for how LogTape categories are handled in Bunyan logs.
   * - `false` or `undefined`: Categories are not included in the log message
   * - `true`: Categories are included with default formatting
   * - `CategoryOptions`: Custom category formatting configuration
   */
  readonly category?: boolean | CategoryOptions;
}

/**
 * Configuration options for formatting LogTape categories in Bunyan log
 * messages.
 * @since 2.1.0
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
 * Creates a LogTape sink that forwards log records to a Bunyan logger.
 *
 * Bunyan does not provide a global default logger; you must create one
 * with `bunyan.createLogger({ name: "..." })` and pass it in.
 *
 * LogTape's `record.properties` are passed verbatim to Bunyan as the
 * merge-object, so any `serializers` configured on the Bunyan logger
 * apply automatically.  Bunyan's reserved fields (`name`, `hostname`,
 * `pid`, `level`, `time`, `msg`, `src`, `v`) should not be used as
 * property keys.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getBunyanSink } from "@logtape/adaptor-bunyan";
 * import bunyan from "bunyan";
 *
 * const bunyanLogger = bunyan.createLogger({ name: "my-app" });
 *
 * await configure({
 *   sinks: {
 *     bunyan: getBunyanSink(bunyanLogger, {
 *       category: {
 *         position: "start",
 *         decorator: "[]",
 *         separator: "."
 *       }
 *     })
 *   },
 *   loggers: [
 *     { category: "my-library", sinks: ["bunyan"] }
 *   ]
 * });
 * ```
 *
 * @param logger The Bunyan logger instance to forward logs to.
 * @param options Configuration options for the sink adapter.
 * @returns A LogTape sink function that can be used in LogTape configuration.
 * @since 2.1.0
 */
export function getBunyanSink(
  // deno-lint-ignore no-unused-vars
  logger: BunyanLogger,
  // deno-lint-ignore no-unused-vars
  options: BunyanSinkOptions = {},
): Sink {
  // deno-lint-ignore no-unused-vars
  return (record: LogRecord) => {
    // Implementation lands in the next commit.
  };
}
