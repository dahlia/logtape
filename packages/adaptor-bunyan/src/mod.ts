import { configureSync, type LogRecord, type Sink } from "@logtape/logtape";
import { inspect } from "node:util";

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

  /**
   * A function that converts an interpolated value in the message template
   * to a string.  By default, values are formatted with
   * `node:util#inspect()` using `breakLength: Infinity` so each value
   * appears on a single line in the rendered `msg` field.
   *
   * Supply a custom formatter to use, for example, `JSON.stringify`,
   * a redaction-aware serializer, or any other strategy.
   * @default `(value) => inspect(value, { breakLength: Infinity })`
   */
  readonly valueFormatter?: (value: unknown) => string;
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

function defaultValueFormatter(value: unknown): string {
  return inspect(value, { breakLength: Infinity });
}

function renderMessage(
  parts: readonly (string | unknown)[],
  valueFormatter: (value: unknown) => string,
): string {
  let rendered = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      rendered += parts[i] as string;
    } else {
      rendered += valueFormatter(parts[i]);
    }
  }
  return rendered;
}

function decorateCategoryStart(
  category: string,
  decorator: Required<CategoryOptions>["decorator"],
): string {
  switch (decorator) {
    case "[]":
      return `[${category}] `;
    case "()":
      return `(${category}) `;
    case "<>":
      return `<${category}> `;
    case "{}":
      return `{${category}} `;
    case ":":
      return `${category}: `;
    case "-":
      return `${category} - `;
    case "|":
      return `${category} | `;
    case "/":
      return `${category} / `;
    case "":
      return `${category} `;
  }
}

function decorateCategoryEnd(
  category: string,
  decorator: Required<CategoryOptions>["decorator"],
): string {
  switch (decorator) {
    case "[]":
      return ` [${category}]`;
    case "()":
      return ` (${category})`;
    case "<>":
      return ` <${category}>`;
    case "{}":
      return ` {${category}}`;
    case ":":
      return `: ${category}`;
    case "-":
      return ` - ${category}`;
    case "|":
      return ` | ${category}`;
    case "/":
      return ` / ${category}`;
    case "":
      return ` ${category}`;
  }
}

/**
 * Creates a LogTape sink that forwards log records to a Bunyan logger.
 *
 * Bunyan does not provide a global default logger; you must create one
 * with `bunyan.createLogger({ name: "..." })` and pass it in.
 *
 * LogTape's `record.properties` are passed to Bunyan as the merge-object,
 * so any `serializers` configured on the Bunyan logger apply automatically.
 * The adapter also sets the merge-object's `time` field to a `Date`
 * derived from `record.timestamp`, so the resulting Bunyan record reflects
 * when LogTape created the record rather than when the sink call ran.
 *
 * Bunyan's other reserved fields (`name`, `hostname`, `pid`, `level`,
 * `msg`, `src`, `v`) should not be used as property keys.
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
  logger: BunyanLogger,
  options: BunyanSinkOptions = {},
): Sink {
  const categoryOptions: CategoryOptions | undefined = !options.category
    ? undefined
    : typeof options.category === "object"
    ? options.category
    : {};
  const category: Required<CategoryOptions> | undefined =
    categoryOptions === undefined ? undefined : {
      separator: categoryOptions.separator ?? "·",
      position: categoryOptions.position ?? "start",
      decorator: categoryOptions.decorator ?? ":",
    };
  const valueFormatter = options.valueFormatter ?? defaultValueFormatter;
  return (record: LogRecord) => {
    let message = renderMessage(record.message, valueFormatter);
    if (category !== undefined && record.category.length > 0) {
      const joined = record.category.join(category.separator);
      if (category.position === "start") {
        message = decorateCategoryStart(joined, category.decorator) + message;
      } else {
        message = message + decorateCategoryEnd(joined, category.decorator);
      }
    }
    const properties = {
      ...record.properties,
      time: new Date(record.timestamp),
    };
    switch (record.level) {
      case "trace":
        logger.trace(properties, message);
        return;
      case "debug":
        logger.debug(properties, message);
        return;
      case "info":
        logger.info(properties, message);
        return;
      case "warning":
        logger.warn(properties, message);
        return;
      case "error":
        logger.error(properties, message);
        return;
      case "fatal":
        logger.fatal(properties, message);
        return;
    }
  };
}

/**
 * Automatically configures LogTape to route all logs to a Bunyan logger.
 *
 * This is a convenience function that wires up `getBunyanSink()` as
 * LogTape's catch-all sink and routes the meta logger
 * (`["logtape", "meta"]`) to the same sink with `lowestLevel: "warning"`,
 * matching the conventions of the other adapter packages.
 *
 * Bunyan does not provide a global default logger, so the logger argument
 * is required.  Create one with `bunyan.createLogger({ name: "..." })`
 * and pass it in.
 *
 * @example Basic auto-configuration
 * ```typescript
 * import bunyan from "bunyan";
 * import { install } from "@logtape/adaptor-bunyan";
 *
 * const bunyanLogger = bunyan.createLogger({ name: "my-app" });
 * install(bunyanLogger);
 *
 * import { getLogger } from "@logtape/logtape";
 * const logger = getLogger("my-app");
 * logger.info("This will be logged through Bunyan");
 * ```
 *
 * @example Auto-configuration with custom options
 * ```typescript
 * import bunyan from "bunyan";
 * import { install } from "@logtape/adaptor-bunyan";
 *
 * const bunyanLogger = bunyan.createLogger({ name: "my-app" });
 * install(bunyanLogger, {
 *   category: {
 *     position: "start",
 *     decorator: "[]",
 *     separator: "."
 *   }
 * });
 * ```
 *
 * @param logger The Bunyan logger instance to forward logs to.
 * @param options Configuration options for the sink adapter.
 * @since 2.1.0
 */
export function install(
  logger: BunyanLogger,
  options: BunyanSinkOptions = {},
): void {
  configureSync({
    sinks: {
      bunyan: getBunyanSink(logger, options),
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
