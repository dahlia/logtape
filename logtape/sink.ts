import {
  type ConsoleFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
  type TextFormatter,
} from "./formatter.ts";
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
): Sink {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const writer = stream.getWriter();
  return (record: LogRecord) => {
    const bytes = encoder.encode(formatter(record));
    writer.ready.then(() => writer.write(bytes));
  };
}

/**
 * Options for the {@link getConsoleSink} function.
 */
export interface ConsoleSinkOptions {
  /**
   * The console formatter to use.  Defaults to {@link defaultConsoleFormatter}.
   */
  formatter?: ConsoleFormatter;

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
  const console = options.console ?? globalThis.console;
  return (record: LogRecord) => {
    const args = formatter(record);
    if (record.level === "debug") console.debug(...args);
    else if (record.level === "info") console.info(...args);
    else if (record.level === "warning") console.warn(...args);
    else if (record.level === "error" || record.level === "fatal") {
      console.error(...args);
    } else throw new TypeError(`Invalid log level: ${record.level}.`);
  };
}

/**
 * Options for the {@link getFileSink} function.
 */
export type FileSinkOptions = StreamSinkOptions;

/**
 * A platform-specific file sink driver.
 * @typeParam TFile The type of the file descriptor.
 */
export interface FileSinkDriver<TFile> {
  /**
   * Open a file for appending and return a file descriptor.
   * @param path A path to the file to open.
   */
  openSync(path: string): TFile;

  /**
   * Write a chunk of data to the file.
   * @param fd The file descriptor.
   * @param chunk The data to write.
   */
  writeSync(fd: TFile, chunk: Uint8Array): void;

  /**
   * Flush the file to ensure that all data is written to the disk.
   * @param fd The file descriptor.
   */
  flushSync(fd: TFile): void;

  /**
   * Close the file.
   * @param fd The file descriptor.
   */
  closeSync(fd: TFile): void;
}

/**
 * Get a platform-independent file sink.
 * @typeParam TFile The type of the file descriptor.
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.
 */
export function getFileSink<TFile>(
  path: string,
  options: FileSinkOptions & FileSinkDriver<TFile>,
): Sink & { close: () => void } {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const fd = options.openSync(path);
  const sink = (record: LogRecord) => {
    options.writeSync(fd, encoder.encode(formatter(record)));
    options.flushSync(fd);
  };
  sink.close = () => options.closeSync(fd);
  return sink;
}
