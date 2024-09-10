import util from "node:util";
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
    : "inspect" in util && typeof util.inspect === "function"
    // @ts-ignore: Node.js global
    // dnt-shim-ignore
    ? util.inspect.bind(util)
    : (v) => JSON.stringify(v);

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
export function defaultTextFormatter(record: LogRecord): string {
  const ts = new Date(record.timestamp);
  let msg = "";
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) msg += record.message[i];
    else msg += inspect(record.message[i]);
  }
  const category = record.category.join("\xb7");
  return `${ts.toISOString().replace("T", " ").replace("Z", " +00:00")} [${
    levelAbbreviations[record.level]
  }] ${category}: ${msg}\n`;
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const levelColors: Record<LogLevel, string> = {
  debug: "\x1b[34m", // Blue
  info: "\x1b[32m", // Green
  warning: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  fatal: "\x1b[35m", // Magenta
};

/**
 * A text formatter that uses ANSI colors to format log records.
 *
 * ![A preview of ansiColorFormatter.](https://i.imgur.com/I8LlBUf.png)
 *
 * @param record The log record to format.
 * @returns The formatted log record.
 * @since 0.5.0
 */
export const ansiColorFormatter: TextFormatter = (
  record: LogRecord,
): string => {
  const ts = new Date(record.timestamp);
  const timeString = ts.toISOString().replace("T", " ").replace("Z", " +00");
  const category = record.category.join("·");
  const levelColor = levelColors[record.level];
  const levelAbbr = levelAbbreviations[record.level];

  let message = "";
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) {
      message += record.message[i];
    } else {
      message += inspect(record.message[i], { colors: true });
    }
  }

  return `${DIM}${timeString}${RESET} ` +
    `${BOLD}${levelColor}${levelAbbr}${RESET} ` +
    `${DIM}${category}:${RESET} ${message}\n`;
};

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
