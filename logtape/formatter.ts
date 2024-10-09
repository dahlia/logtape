import type { CategoryList } from "./category.ts";
import type { LogLevel } from "./level.ts";
import util from "./nodeUtil.ts";
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
  // @ts-ignore: Deno global
  // dnt-shim-ignore
  "Deno" in globalThis && "inspect" in globalThis.Deno &&
    // @ts-ignore: Deno global
    // dnt-shim-ignore
    typeof globalThis.Deno.inspect === "function"
    // @ts-ignore: Deno global
    // dnt-shim-ignore
    ? globalThis.Deno.inspect.bind(globalThis.Deno)
    // @ts-ignore: Node.js global
    // dnt-shim-ignore
    : util != null && "inspect" in util && typeof util.inspect === "function"
    // @ts-ignore: Node.js global
    // dnt-shim-ignore
    ? util.inspect.bind(util)
    : (v) => JSON.stringify(v);

/**
 * The formatted values for a log record.
 * @since 0.6.0
 */
export interface FormattedValues {
  /**
   * The formatted timestamp.
   */
  timestamp: string;

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
    | ((ts: number) => string);

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
  category?: string | ((category: CategoryList) => string);

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
  const timestampRenderer =
    options.timestamp == null || options.timestamp === "date-time-timezone"
      ? (ts: number): string =>
        new Date(ts).toISOString().replace("T", " ").replace("Z", " +00:00")
      : options.timestamp === "date-time-tz"
      ? (ts: number): string =>
        new Date(ts).toISOString().replace("T", " ").replace("Z", " +00")
      : options.timestamp === "date-time"
      ? (ts: number): string =>
        new Date(ts).toISOString().replace("T", " ").replace("Z", "")
      : options.timestamp === "time-timezone"
      ? (ts: number): string =>
        new Date(ts).toISOString().replace(/.*T/, "").replace("Z", " +00:00")
      : options.timestamp === "time-tz"
      ? (ts: number): string =>
        new Date(ts).toISOString().replace(/.*T/, "").replace("Z", " +00")
      : options.timestamp === "time"
      ? (ts: number): string =>
        new Date(ts).toISOString().replace(/.*T/, "").replace("Z", "")
      : options.timestamp === "date"
      ? (ts: number): string => new Date(ts).toISOString().replace(/T.*/, "")
      : options.timestamp === "rfc3339"
      ? (ts: number): string => new Date(ts).toISOString()
      : options.timestamp;
  const categorySeparator = options.category ?? "·";
  const valueRenderer = options.value ?? inspect;
  const levelRenderer = options.level == null || options.level === "ABBR"
    ? (level: LogLevel): string => levelAbbreviations[level]
    : options.level === "abbr"
    ? (level: LogLevel): string => levelAbbreviations[level].toLowerCase()
    : options.level === "FULL"
    ? (level: LogLevel): string => level.toUpperCase()
    : options.level === "full"
    ? (level: LogLevel): string => level
    : options.level === "L"
    ? (level: LogLevel): string => level.charAt(0).toUpperCase()
    : options.level === "l"
    ? (level: LogLevel): string => level.charAt(0)
    : options.level;
  const formatter: (values: FormattedValues) => string = options.format ??
    (({ timestamp, level, category, message }: FormattedValues) =>
      `${timestamp} [${level}] ${category}: ${message}`);
  return (record: LogRecord): string => {
    let message = "";
    for (let i = 0; i < record.message.length; i++) {
      if (i % 2 === 0) message += record.message[i];
      else message += valueRenderer(record.message[i]);
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
