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
 * and in Node.js/Bun it is {@link util.inspect}.  If neither is available, it
 * falls back to {@link JSON.stringify}.
 *
 * @param value The value to inspect.
 * @returns The string representation of the value.
 */
const inspect: (value: unknown) => string = eval(`(
  "Deno" in globalThis && "inspect" in globalThis.Deno &&
    typeof globalThis.Deno.inspect === "function"
    ? globalThis.Deno.inspect
    : "util" in globalThis && "inspect" in globalThis.util &&
        globalThis.util.inspect === "function"
    ? globalThis.util.inspect
    : JSON.stringify
)`);

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
