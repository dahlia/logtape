import { type FilterLike, toFilter } from "./filter.ts";
import {
  type ConsoleFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
  type TextFormatter,
} from "./formatter.ts";
import type { LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";

/**
 * A sink is a function that accepts a log record and prints it somewhere.
 * Thrown exceptions will be suppressed and then logged to the meta logger,
 * a {@link Logger} with the category `["logtape", "meta"]`.  (In that case,
 * the meta log record will not be passed to the sink to avoid infinite
 * recursion.)
 *
 * @param record The log record to sink.
 */
export type Sink = (record: LogRecord) => void;

/**
 * Turns a sink into a filtered sink.  The returned sink only logs records that
 * pass the filter.
 *
 * @example Filter a console sink to only log records with the info level
 * ```typescript
 * const sink = withFilter(getConsoleSink(), "info");
 * ```
 *
 * @param sink A sink to be filtered.
 * @param filter A filter to apply to the sink.  It can be either a filter
 *               function or a {@link LogLevel} string.
 * @returns A sink that only logs records that pass the filter.
 */
export function withFilter(sink: Sink, filter: FilterLike): Sink {
  const filterFunc = toFilter(filter);
  return (record: LogRecord) => {
    if (filterFunc(record)) sink(record);
  };
}

/**
 * Options for the {@link getStreamSink} function.
 */
export interface StreamSinkOptions {
  /**
   * The text formatter to use.  Defaults to {@link defaultTextFormatter}.
   */
  formatter?: TextFormatter;

  /**
   * The text encoder to use.  Defaults to an instance of {@link TextEncoder}.
   */
  encoder?: { encode(text: string): Uint8Array };
}

/**
 * A factory that returns a sink that writes to a {@link WritableStream}.
 *
 * Note that the `stream` is of Web Streams API, which is different from
 * Node.js streams.  You can convert a Node.js stream to a Web Streams API
 * stream using [`stream.Writable.toWeb()`] method.
 *
 * [`stream.Writable.toWeb()`]: https://nodejs.org/api/stream.html#streamwritabletowebstreamwritable
 *
 * @example Sink to the standard error in Deno
 * ```typescript
 * const stderrSink = getStreamSink(Deno.stderr.writable);
 * ```
 *
 * @example Sink to the standard error in Node.js
 * ```typescript
 * import stream from "node:stream";
 * const stderrSink = getStreamSink(stream.Writable.toWeb(process.stderr));
 * ```
 *
 * @param stream The stream to write to.
 * @param options The options for the sink.
 * @returns A sink that writes to the stream.
 */
export function getStreamSink(
  stream: WritableStream,
  options: StreamSinkOptions = {},
): Sink & AsyncDisposable {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const writer = stream.getWriter();
  let lastPromise = Promise.resolve();
  const sink: Sink & AsyncDisposable = (record: LogRecord) => {
    const bytes = encoder.encode(formatter(record));
    lastPromise = lastPromise
      .then(() => writer.ready)
      .then(() => writer.write(bytes));
  };
  sink[Symbol.asyncDispose] = async () => {
    await lastPromise;
    await writer.close();
  };
  return sink;
}

type ConsoleMethod = "debug" | "info" | "log" | "warn" | "error";

/**
 * Options for the {@link getConsoleSink} function.
 */
export interface ConsoleSinkOptions {
  /**
   * The console formatter or text formatter to use.
   * Defaults to {@link defaultConsoleFormatter}.
   */
  formatter?: ConsoleFormatter | TextFormatter;

  /**
   * The mapping from log levels to console methods.  Defaults to:
   *
   * ```typescript
   * {
   *   debug: "debug",
   *   info: "info",
   *   warning: "warn",
   *   error: "error",
   *   fatal: "error",
   * }
   * ```
   * @since 0.9.0
   */
  levelMap?: Record<LogLevel, ConsoleMethod>;

  /**
   * The console to log to.  Defaults to {@link console}.
   */
  console?: Console;
}

/**
 * A console sink factory that returns a sink that logs to the console.
 *
 * @param options The options for the sink.
 * @returns A sink that logs to the console.
 */
export function getConsoleSink(options: ConsoleSinkOptions = {}): Sink {
  const formatter = options.formatter ?? defaultConsoleFormatter;
  const levelMap: Record<LogLevel, ConsoleMethod> = {
    debug: "debug",
    info: "info",
    warning: "warn",
    error: "error",
    fatal: "error",
    ...(options.levelMap ?? {}),
  };
  const console = options.console ?? globalThis.console;
  return (record: LogRecord) => {
    const args = formatter(record);
    const method = levelMap[record.level];
    if (method === undefined) {
      throw new TypeError(`Invalid log level: ${record.level}.`);
    }
    if (typeof args === "string") {
      const msg = args.replace(/\r?\n$/, "");
      console[method](msg);
    } else {
      console[method](...args);
    }
  };
}
