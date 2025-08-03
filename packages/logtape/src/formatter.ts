import * as util from "#util";
import type { LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";

/**
 * A text formatter is a function that accepts a log record and returns
 * a string.
 *
 * @param record The log record to format.
 * @returns The formatted log record.
 */
export type TextFormatter = (record: LogRecord) => string;

/**
 * The severity level abbreviations.
 */
const levelAbbreviations: Record<LogLevel, string> = {
  "trace": "TRC",
  "debug": "DBG",
  "info": "INF",
  "warning": "WRN",
  "error": "ERR",
  "fatal": "FTL",
};

/**
 * A platform-specific inspect function.  In Deno, this is {@link Deno.inspect},
 * and in Node.js/Bun it is `util.inspect()`.  If neither is available, it
 * falls back to {@link JSON.stringify}.
 *
 * @param value The value to inspect.
 * @param options The options for inspecting the value.
 *                If `colors` is `true`, the output will be ANSI-colored.
 * @returns The string representation of the value.
 */
const inspect: (value: unknown, options?: { colors?: boolean }) => string =
  // @ts-ignore: Browser detection
  // dnt-shim-ignore
  typeof document !== "undefined" ||
    // @ts-ignore: React Native detection
    // dnt-shim-ignore
    typeof navigator !== "undefined" && navigator.product === "ReactNative"
    ? (v) => JSON.stringify(v)
    // @ts-ignore: Deno global
    // dnt-shim-ignore
    : "Deno" in globalThis && "inspect" in globalThis.Deno &&
        // @ts-ignore: Deno global
        // dnt-shim-ignore
        typeof globalThis.Deno.inspect === "function"
    ? (v, opts) =>
      // @ts-ignore: Deno global
      // dnt-shim-ignore
      globalThis.Deno.inspect(v, {
        strAbbreviateSize: Infinity,
        iterableLimit: Infinity,
        ...opts,
      })
    // @ts-ignore: Node.js global
    // dnt-shim-ignore
    : util != null && "inspect" in util && typeof util.inspect === "function"
    ? (v, opts) =>
      // @ts-ignore: Node.js global
      // dnt-shim-ignore
      util.inspect(v, {
        maxArrayLength: Infinity,
        maxStringLength: Infinity,
        ...opts,
      })
    : (v) => JSON.stringify(v);

/**
 * The formatted values for a log record.
 * @since 0.6.0
 */
export interface FormattedValues {
  /**
   * The formatted timestamp.
   */
  timestamp: string | null;

  /**
   * The formatted log level.
   */
  level: string;

  /**
   * The formatted category.
   */
  category: string;

  /**
   * The formatted message.
   */
  message: string;

  /**
   * The unformatted log record.
   */
  record: LogRecord;
}

/**
 * The various options for the built-in text formatters.
 * @since 0.6.0
 */
export interface TextFormatterOptions {
  /**
   * The timestamp format.  This can be one of the following:
   *
   * - `"date-time-timezone"`: The date and time with the full timezone offset
   *   (e.g., `"2023-11-14 22:13:20.000 +00:00"`).
   * - `"date-time-tz"`: The date and time with the short timezone offset
   *   (e.g., `"2023-11-14 22:13:20.000 +00"`).
   * - `"date-time"`: The date and time without the timezone offset
   *   (e.g., `"2023-11-14 22:13:20.000"`).
   * - `"time-timezone"`: The time with the full timezone offset but without
   *   the date (e.g., `"22:13:20.000 +00:00"`).
   * - `"time-tz"`: The time with the short timezone offset but without the date
   *   (e.g., `"22:13:20.000 +00"`).
   * - `"time"`: The time without the date or timezone offset
   *   (e.g., `"22:13:20.000"`).
   * - `"date"`: The date without the time or timezone offset
   *   (e.g., `"2023-11-14"`).
   * - `"rfc3339"`: The date and time in RFC 3339 format
   *   (e.g., `"2023-11-14T22:13:20.000Z"`).
   * - `"none"` or `"disabled"`: No display
   *
   * Alternatively, this can be a function that accepts a timestamp and returns
   * a string.
   *
   * The default is `"date-time-timezone"`.
   */
  timestamp?:
    | "date-time-timezone"
    | "date-time-tz"
    | "date-time"
    | "time-timezone"
    | "time-tz"
    | "time"
    | "date"
    | "rfc3339"
    | "none"
    | "disabled"
    | ((ts: number) => string | null);

  /**
   * The log level format.  This can be one of the following:
   *
   * - `"ABBR"`: The log level abbreviation in uppercase (e.g., `"INF"`).
   * - `"FULL"`: The full log level name in uppercase (e.g., `"INFO"`).
   * - `"L"`: The first letter of the log level in uppercase (e.g., `"I"`).
   * - `"abbr"`: The log level abbreviation in lowercase (e.g., `"inf"`).
   * - `"full"`: The full log level name in lowercase (e.g., `"info"`).
   * - `"l"`: The first letter of the log level in lowercase (e.g., `"i"`).
   *
   * Alternatively, this can be a function that accepts a log level and returns
   * a string.
   *
   * The default is `"ABBR"`.
   */
  level?:
    | "ABBR"
    | "FULL"
    | "L"
    | "abbr"
    | "full"
    | "l"
    | ((level: LogLevel) => string);

  /**
   * The separator between category names.  For example, if the separator is
   * `"·"`, the category `["a", "b", "c"]` will be formatted as `"a·b·c"`.
   * The default separator is `"·"`.
   *
   * If this is a function, it will be called with the category array and
   * should return a string, which will be used for rendering the category.
   */
  category?: string | ((category: readonly string[]) => string);

  /**
   * The format of the embedded values.
   *
   * A function that renders a value to a string.  This function is used to
   * render the values in the log record.  The default is [`util.inspect()`] in
   * Node.js/Bun and [`Deno.inspect()`] in Deno.
   *
   * [`util.inspect()`]: https://nodejs.org/api/util.html#utilinspectobject-options
   * [`Deno.inspect()`]: https://docs.deno.com/api/deno/~/Deno.inspect
   * @param value The value to render.
   * @returns The string representation of the value.
   */
  value?: (value: unknown) => string;

  /**
   * How those formatted parts are concatenated.
   *
   * A function that formats the log record.  This function is called with the
   * formatted values and should return a string.  Note that the formatted
   * *should not* include a newline character at the end.
   *
   * By default, this is a function that formats the log record as follows:
   *
   * ```
   * 2023-11-14 22:13:20.000 +00:00 [INF] category·subcategory: Hello, world!
   * ```
   * @param values The formatted values.
   * @returns The formatted log record.
   */
  format?: (values: FormattedValues) => string;
}

// Optimized helper functions for timestamp formatting
function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

function padThree(num: number): string {
  return num < 10 ? `00${num}` : num < 100 ? `0${num}` : `${num}`;
}

// Pre-optimized timestamp formatter functions
const timestampFormatters = {
  "date-time-timezone": (ts: number): string => {
    const d = new Date(ts);
    const year = d.getUTCFullYear();
    const month = padZero(d.getUTCMonth() + 1);
    const day = padZero(d.getUTCDate());
    const hour = padZero(d.getUTCHours());
    const minute = padZero(d.getUTCMinutes());
    const second = padZero(d.getUTCSeconds());
    const ms = padThree(d.getUTCMilliseconds());
    return `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms} +00:00`;
  },
  "date-time-tz": (ts: number): string => {
    const d = new Date(ts);
    const year = d.getUTCFullYear();
    const month = padZero(d.getUTCMonth() + 1);
    const day = padZero(d.getUTCDate());
    const hour = padZero(d.getUTCHours());
    const minute = padZero(d.getUTCMinutes());
    const second = padZero(d.getUTCSeconds());
    const ms = padThree(d.getUTCMilliseconds());
    return `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms} +00`;
  },
  "date-time": (ts: number): string => {
    const d = new Date(ts);
    const year = d.getUTCFullYear();
    const month = padZero(d.getUTCMonth() + 1);
    const day = padZero(d.getUTCDate());
    const hour = padZero(d.getUTCHours());
    const minute = padZero(d.getUTCMinutes());
    const second = padZero(d.getUTCSeconds());
    const ms = padThree(d.getUTCMilliseconds());
    return `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;
  },
  "time-timezone": (ts: number): string => {
    const d = new Date(ts);
    const hour = padZero(d.getUTCHours());
    const minute = padZero(d.getUTCMinutes());
    const second = padZero(d.getUTCSeconds());
    const ms = padThree(d.getUTCMilliseconds());
    return `${hour}:${minute}:${second}.${ms} +00:00`;
  },
  "time-tz": (ts: number): string => {
    const d = new Date(ts);
    const hour = padZero(d.getUTCHours());
    const minute = padZero(d.getUTCMinutes());
    const second = padZero(d.getUTCSeconds());
    const ms = padThree(d.getUTCMilliseconds());
    return `${hour}:${minute}:${second}.${ms} +00`;
  },
  "time": (ts: number): string => {
    const d = new Date(ts);
    const hour = padZero(d.getUTCHours());
    const minute = padZero(d.getUTCMinutes());
    const second = padZero(d.getUTCSeconds());
    const ms = padThree(d.getUTCMilliseconds());
    return `${hour}:${minute}:${second}.${ms}`;
  },
  "date": (ts: number): string => {
    const d = new Date(ts);
    const year = d.getUTCFullYear();
    const month = padZero(d.getUTCMonth() + 1);
    const day = padZero(d.getUTCDate());
    return `${year}-${month}-${day}`;
  },
  "rfc3339": (ts: number): string => new Date(ts).toISOString(),
  "none": (): null => null,
} as const;

// Pre-computed level renderers for common cases
const levelRenderersCache = {
  ABBR: levelAbbreviations,
  abbr: {
    trace: "trc",
    debug: "dbg",
    info: "inf",
    warning: "wrn",
    error: "err",
    fatal: "ftl",
  } as const,
  FULL: {
    trace: "TRACE",
    debug: "DEBUG",
    info: "INFO",
    warning: "WARNING",
    error: "ERROR",
    fatal: "FATAL",
  } as const,
  full: {
    trace: "trace",
    debug: "debug",
    info: "info",
    warning: "warning",
    error: "error",
    fatal: "fatal",
  } as const,
  L: {
    trace: "T",
    debug: "D",
    info: "I",
    warning: "W",
    error: "E",
    fatal: "F",
  } as const,
  l: {
    trace: "t",
    debug: "d",
    info: "i",
    warning: "w",
    error: "e",
    fatal: "f",
  } as const,
} as const;

/**
 * Get a text formatter with the specified options.  Although it's flexible
 * enough to create a custom formatter, if you want more control, you can
 * create a custom formatter that satisfies the {@link TextFormatter} type
 * instead.
 *
 * For more information on the options, see {@link TextFormatterOptions}.
 *
 * By default, the formatter formats log records as follows:
 *
 * ```
 * 2023-11-14 22:13:20.000 +00:00 [INF] category·subcategory: Hello, world!
 * ```
 * @param options The options for the text formatter.
 * @returns The text formatter.
 * @since 0.6.0
 */
export function getTextFormatter(
  options: TextFormatterOptions = {},
): TextFormatter {
  // Pre-compute timestamp formatter with optimized lookup
  const timestampRenderer = (() => {
    const tsOption = options.timestamp;
    if (tsOption == null) {
      return timestampFormatters["date-time-timezone"];
    } else if (tsOption === "disabled") {
      return timestampFormatters["none"];
    } else if (
      typeof tsOption === "string" && tsOption in timestampFormatters
    ) {
      return timestampFormatters[tsOption as keyof typeof timestampFormatters];
    } else {
      return tsOption as (ts: number) => string | null;
    }
  })();

  const categorySeparator = options.category ?? "·";
  const valueRenderer = options.value ?? inspect;

  // Pre-compute level renderer for better performance
  const levelRenderer = (() => {
    const levelOption = options.level;
    if (levelOption == null || levelOption === "ABBR") {
      return (level: LogLevel): string => levelRenderersCache.ABBR[level];
    } else if (levelOption === "abbr") {
      return (level: LogLevel): string => levelRenderersCache.abbr[level];
    } else if (levelOption === "FULL") {
      return (level: LogLevel): string => levelRenderersCache.FULL[level];
    } else if (levelOption === "full") {
      return (level: LogLevel): string => levelRenderersCache.full[level];
    } else if (levelOption === "L") {
      return (level: LogLevel): string => levelRenderersCache.L[level];
    } else if (levelOption === "l") {
      return (level: LogLevel): string => levelRenderersCache.l[level];
    } else {
      return levelOption;
    }
  })();

  const formatter: (values: FormattedValues) => string = options.format ??
    (({ timestamp, level, category, message }: FormattedValues) =>
      `${timestamp ? `${timestamp} ` : ""}[${level}] ${category}: ${message}`);

  return (record: LogRecord): string => {
    // Optimized message building
    const msgParts = record.message;
    const msgLen = msgParts.length;

    let message: string;
    if (msgLen === 1) {
      // Fast path for simple messages with no interpolation
      message = msgParts[0] as string;
    } else if (msgLen <= 6) {
      // Fast path for small messages - direct concatenation
      message = "";
      for (let i = 0; i < msgLen; i++) {
        message += (i % 2 === 0) ? msgParts[i] : valueRenderer(msgParts[i]);
      }
    } else {
      // Optimized path for larger messages - array join
      const parts: string[] = new Array(msgLen);
      for (let i = 0; i < msgLen; i++) {
        parts[i] = (i % 2 === 0)
          ? msgParts[i] as string
          : valueRenderer(msgParts[i]);
      }
      message = parts.join("");
    }

    const timestamp = timestampRenderer(record.timestamp);
    const level = levelRenderer(record.level);
    const category = typeof categorySeparator === "function"
      ? categorySeparator(record.category)
      : record.category.join(categorySeparator);

    const values: FormattedValues = {
      timestamp,
      level,
      category,
      message,
      record,
    };
    return `${formatter(values)}\n`;
  };
}

/**
 * The default text formatter.  This formatter formats log records as follows:
 *
 * ```
 * 2023-11-14 22:13:20.000 +00:00 [INF] category·subcategory: Hello, world!
 * ```
 *
 * @param record The log record to format.
 * @returns The formatted log record.
 */
export const defaultTextFormatter: TextFormatter = getTextFormatter();

const RESET = "\x1b[0m";

/**
 * The ANSI colors.  These can be used to colorize text in the console.
 * @since 0.6.0
 */
export type AnsiColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

const ansiColors: Record<AnsiColor, string> = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

/**
 * The ANSI text styles.
 * @since 0.6.0
 */
export type AnsiStyle =
  | "bold"
  | "dim"
  | "italic"
  | "underline"
  | "strikethrough";

const ansiStyles: Record<AnsiStyle, string> = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  strikethrough: "\x1b[9m",
};

const defaultLevelColors: Record<LogLevel, AnsiColor | null> = {
  trace: null,
  debug: "blue",
  info: "green",
  warning: "yellow",
  error: "red",
  fatal: "magenta",
};

/**
 * The various options for the ANSI color formatter.
 * @since 0.6.0
 */
export interface AnsiColorFormatterOptions extends TextFormatterOptions {
  /**
   * The timestamp format.  This can be one of the following:
   *
   * - `"date-time-timezone"`: The date and time with the full timezone offset
   *   (e.g., `"2023-11-14 22:13:20.000 +00:00"`).
   * - `"date-time-tz"`: The date and time with the short timezone offset
   *   (e.g., `"2023-11-14 22:13:20.000 +00"`).
   * - `"date-time"`: The date and time without the timezone offset
   *   (e.g., `"2023-11-14 22:13:20.000"`).
   * - `"time-timezone"`: The time with the full timezone offset but without
   *   the date (e.g., `"22:13:20.000 +00:00"`).
   * - `"time-tz"`: The time with the short timezone offset but without the date
   *   (e.g., `"22:13:20.000 +00"`).
   * - `"time"`: The time without the date or timezone offset
   *   (e.g., `"22:13:20.000"`).
   * - `"date"`: The date without the time or timezone offset
   *   (e.g., `"2023-11-14"`).
   * - `"rfc3339"`: The date and time in RFC 3339 format
   *   (e.g., `"2023-11-14T22:13:20.000Z"`).
   *
   * Alternatively, this can be a function that accepts a timestamp and returns
   * a string.
   *
   * The default is `"date-time-tz"`.
   */
  timestamp?:
    | "date-time-timezone"
    | "date-time-tz"
    | "date-time"
    | "time-timezone"
    | "time-tz"
    | "time"
    | "date"
    | "rfc3339"
    | ((ts: number) => string);

  /**
   * The ANSI style for the timestamp.  `"dim"` is used by default.
   */
  timestampStyle?: AnsiStyle | null;

  /**
   * The ANSI color for the timestamp.  No color is used by default.
   */
  timestampColor?: AnsiColor | null;

  /**
   * The ANSI style for the log level.  `"bold"` is used by default.
   */
  levelStyle?: AnsiStyle | null;

  /**
   * The ANSI colors for the log levels.  The default colors are as follows:
   *
   * - `"trace"`: `null` (no color)
   * - `"debug"`: `"blue"`
   * - `"info"`: `"green"`
   * - `"warning"`: `"yellow"`
   * - `"error"`: `"red"`
   * - `"fatal"`: `"magenta"`
   */
  levelColors?: Record<LogLevel, AnsiColor | null>;

  /**
   * The ANSI style for the category.  `"dim"` is used by default.
   */
  categoryStyle?: AnsiStyle | null;

  /**
   * The ANSI color for the category.  No color is used by default.
   */
  categoryColor?: AnsiColor | null;
}

/**
 * Get an ANSI color formatter with the specified options.
 *
 * ![A preview of an ANSI color formatter.](https://i.imgur.com/I8LlBUf.png)
 * @param option The options for the ANSI color formatter.
 * @returns The ANSI color formatter.
 * @since 0.6.0
 */
export function getAnsiColorFormatter(
  options: AnsiColorFormatterOptions = {},
): TextFormatter {
  const format = options.format;
  const timestampStyle = typeof options.timestampStyle === "undefined"
    ? "dim"
    : options.timestampStyle;
  const timestampColor = options.timestampColor ?? null;
  const timestampPrefix = `${
    timestampStyle == null ? "" : ansiStyles[timestampStyle]
  }${timestampColor == null ? "" : ansiColors[timestampColor]}`;
  const timestampSuffix = timestampStyle == null && timestampColor == null
    ? ""
    : RESET;
  const levelStyle = typeof options.levelStyle === "undefined"
    ? "bold"
    : options.levelStyle;
  const levelColors = options.levelColors ?? defaultLevelColors;
  const categoryStyle = typeof options.categoryStyle === "undefined"
    ? "dim"
    : options.categoryStyle;
  const categoryColor = options.categoryColor ?? null;
  const categoryPrefix = `${
    categoryStyle == null ? "" : ansiStyles[categoryStyle]
  }${categoryColor == null ? "" : ansiColors[categoryColor]}`;
  const categorySuffix = categoryStyle == null && categoryColor == null
    ? ""
    : RESET;
  return getTextFormatter({
    timestamp: "date-time-tz",
    value(value: unknown): string {
      return inspect(value, { colors: true });
    },
    ...options,
    format({ timestamp, level, category, message, record }): string {
      const levelColor = levelColors[record.level];
      timestamp = `${timestampPrefix}${timestamp}${timestampSuffix}`;
      level = `${levelStyle == null ? "" : ansiStyles[levelStyle]}${
        levelColor == null ? "" : ansiColors[levelColor]
      }${level}${levelStyle == null && levelColor == null ? "" : RESET}`;
      return format == null
        ? `${timestamp} ${level} ${categoryPrefix}${category}:${categorySuffix} ${message}`
        : format({
          timestamp,
          level,
          category: `${categoryPrefix}${category}${categorySuffix}`,
          message,
          record,
        });
    },
  });
}

/**
 * A text formatter that uses ANSI colors to format log records.
 *
 * ![A preview of ansiColorFormatter.](https://i.imgur.com/I8LlBUf.png)
 *
 * @param record The log record to format.
 * @returns The formatted log record.
 * @since 0.5.0
 */
export const ansiColorFormatter: TextFormatter = getAnsiColorFormatter();

/**
 * Options for the {@link getJsonLinesFormatter} function.
 * @since 0.11.0
 */
export interface JsonLinesFormatterOptions {
  /**
   * The separator between category names.  For example, if the separator is
   * `"."`, the category `["a", "b", "c"]` will be formatted as `"a.b.c"`.
   * If this is a function, it will be called with the category array and
   * should return a string or an array of strings, which will be used
   * for rendering the category.
   *
   * @default `"."`
   */
  readonly categorySeparator?:
    | string
    | ((category: readonly string[]) => string | readonly string[]);

  /**
   * The message format.  This can be one of the following:
   *
   * - `"template"`: The raw message template is used as the message.
   * - `"rendered"`: The message is rendered with the values.
   *
   * @default `"rendered"`
   */
  readonly message?: "template" | "rendered";

  /**
   * The properties format.  This can be one of the following:
   *
   * - `"flatten"`: The properties are flattened into the root object.
   * - `"prepend:<prefix>"`: The properties are prepended with the given prefix
   *   (e.g., `"prepend:ctx_"` will prepend `ctx_` to each property key).
   * - `"nest:<key>"`: The properties are nested under the given key
   *   (e.g., `"nest:properties"` will nest the properties under the
   *   `properties` key).
   *
   * @default `"nest:properties"`
   */
  readonly properties?: "flatten" | `prepend:${string}` | `nest:${string}`;
}

/**
 * Get a [JSON Lines] formatter with the specified options.  The log records
 * will be rendered as JSON objects, one per line, which is a common format
 * for log files.  This format is also known as Newline-Delimited JSON (NDJSON).
 * It looks like this:
 *
 * ```json
 * {"@timestamp":"2023-11-14T22:13:20.000Z","level":"INFO","message":"Hello, world!","logger":"my.logger","properties":{"key":"value"}}
 * ```
 *
 * [JSON Lines]: https://jsonlines.org/
 * @param options The options for the JSON Lines formatter.
 * @returns The JSON Lines formatter.
 * @since 0.11.0
 */
export function getJsonLinesFormatter(
  options: JsonLinesFormatterOptions = {},
): TextFormatter {
  // Most common configuration - optimize for the default case
  if (!options.categorySeparator && !options.message && !options.properties) {
    // Ultra-minimalist path - eliminate all possible overhead
    return (record: LogRecord): string => {
      // Direct benchmark pattern match (most common case first)
      if (record.message.length === 3) {
        return JSON.stringify({
          "@timestamp": new Date(record.timestamp).toISOString(),
          level: record.level === "warning"
            ? "WARN"
            : record.level.toUpperCase(),
          message: record.message[0] + JSON.stringify(record.message[1]) +
            record.message[2],
          logger: record.category.join("."),
          properties: record.properties,
        }) + "\n";
      }

      // Single message (second most common)
      if (record.message.length === 1) {
        return JSON.stringify({
          "@timestamp": new Date(record.timestamp).toISOString(),
          level: record.level === "warning"
            ? "WARN"
            : record.level.toUpperCase(),
          message: record.message[0],
          logger: record.category.join("."),
          properties: record.properties,
        }) + "\n";
      }

      // Complex messages (fallback)
      let msg = record.message[0] as string;
      for (let i = 1; i < record.message.length; i++) {
        msg += (i & 1) ? JSON.stringify(record.message[i]) : record.message[i];
      }

      return JSON.stringify({
        "@timestamp": new Date(record.timestamp).toISOString(),
        level: record.level === "warning" ? "WARN" : record.level.toUpperCase(),
        message: msg,
        logger: record.category.join("."),
        properties: record.properties,
      }) + "\n";
    };
  }

  // Pre-compile configuration for non-default cases
  const isTemplateMessage = options.message === "template";
  const propertiesOption = options.properties ?? "nest:properties";

  // Pre-compile category joining strategy
  let joinCategory: (category: readonly string[]) => string | readonly string[];
  if (typeof options.categorySeparator === "function") {
    joinCategory = options.categorySeparator;
  } else {
    const separator = options.categorySeparator ?? ".";
    joinCategory = (category: readonly string[]): string =>
      category.join(separator);
  }

  // Pre-compile properties handling strategy
  let getProperties: (
    properties: Record<string, unknown>,
  ) => Record<string, unknown>;

  if (propertiesOption === "flatten") {
    getProperties = (properties) => properties;
  } else if (propertiesOption.startsWith("prepend:")) {
    const prefix = propertiesOption.substring(8);
    if (prefix === "") {
      throw new TypeError(
        `Invalid properties option: ${
          JSON.stringify(propertiesOption)
        }. It must be of the form "prepend:<prefix>" where <prefix> is a non-empty string.`,
      );
    }
    getProperties = (properties) => {
      const result: Record<string, unknown> = {};
      for (const key in properties) {
        result[`${prefix}${key}`] = properties[key];
      }
      return result;
    };
  } else if (propertiesOption.startsWith("nest:")) {
    const key = propertiesOption.substring(5);
    getProperties = (properties) => ({ [key]: properties });
  } else {
    throw new TypeError(
      `Invalid properties option: ${
        JSON.stringify(propertiesOption)
      }. It must be "flatten", "prepend:<prefix>", or "nest:<key>".`,
    );
  }

  // Pre-compile message rendering function
  let getMessage: (record: LogRecord) => string;

  if (isTemplateMessage) {
    getMessage = (record: LogRecord): string => {
      if (typeof record.rawMessage === "string") {
        return record.rawMessage;
      }
      let msg = "";
      for (let i = 0; i < record.rawMessage.length; i++) {
        msg += i % 2 < 1 ? record.rawMessage[i] : "{}";
      }
      return msg;
    };
  } else {
    getMessage = (record: LogRecord): string => {
      const msgLen = record.message.length;

      if (msgLen === 1) {
        return record.message[0] as string;
      }

      let msg = "";
      for (let i = 0; i < msgLen; i++) {
        msg += (i % 2 < 1)
          ? record.message[i]
          : JSON.stringify(record.message[i]);
      }
      return msg;
    };
  }

  return (record: LogRecord): string => {
    return JSON.stringify({
      "@timestamp": new Date(record.timestamp).toISOString(),
      level: record.level === "warning" ? "WARN" : record.level.toUpperCase(),
      message: getMessage(record),
      logger: joinCategory(record.category),
      ...getProperties(record.properties),
    }) + "\n";
  };
}

/**
 * The default [JSON Lines] formatter.  This formatter formats log records
 * as JSON objects, one per line, which is a common format for log files.
 * It looks like this:
 *
 * ```json
 * {"@timestamp":"2023-11-14T22:13:20.000Z","level":"INFO","message":"Hello, world!","logger":"my.logger","properties":{"key":"value"}}
 * ```
 *
 * You can customize the output by passing options to
 * {@link getJsonLinesFormatter}.  For example, you can change the category
 * separator, the message format, and how the properties are formatted.
 *
 * [JSON Lines]: https://jsonlines.org/
 * @since 0.11.0
 */
export const jsonLinesFormatter: TextFormatter = getJsonLinesFormatter();

/**
 * A console formatter is a function that accepts a log record and returns
 * an array of arguments to pass to {@link console.log}.
 *
 * @param record The log record to format.
 * @returns The formatted log record, as an array of arguments for
 *          {@link console.log}.
 */
export type ConsoleFormatter = (record: LogRecord) => readonly unknown[];

/**
 * The styles for the log level in the console.
 */
const logLevelStyles: Record<LogLevel, string> = {
  "trace": "background-color: gray; color: white;",
  "debug": "background-color: gray; color: white;",
  "info": "background-color: white; color: black;",
  "warning": "background-color: orange; color: black;",
  "error": "background-color: red; color: white;",
  "fatal": "background-color: maroon; color: white;",
};

/**
 * The default console formatter.
 *
 * @param record The log record to format.
 * @returns The formatted log record, as an array of arguments for
 *          {@link console.log}.
 */
export function defaultConsoleFormatter(record: LogRecord): readonly unknown[] {
  let msg = "";
  const values: unknown[] = [];
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) msg += record.message[i];
    else {
      msg += "%o";
      values.push(record.message[i]);
    }
  }
  const date = new Date(record.timestamp);
  const time = `${date.getUTCHours().toString().padStart(2, "0")}:${
    date.getUTCMinutes().toString().padStart(2, "0")
  }:${date.getUTCSeconds().toString().padStart(2, "0")}.${
    date.getUTCMilliseconds().toString().padStart(3, "0")
  }`;
  return [
    `%c${time} %c${levelAbbreviations[record.level]}%c %c${
      record.category.join("\xb7")
    } %c${msg}`,
    "color: gray;",
    logLevelStyles[record.level],
    "background-color: default;",
    "color: gray;",
    "color: default;",
    ...values,
  ];
}
