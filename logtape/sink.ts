import { type FilterLike, toFilter } from "./filter.ts";
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
 *
 * @typeParam TFile The type of the file descriptor.
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.
 */
export function getFileSink<TFile>(
  path: string,
  options: FileSinkOptions & FileSinkDriver<TFile>,
): Sink & Disposable {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const fd = options.openSync(path);
  const sink: Sink & Disposable = (record: LogRecord) => {
    options.writeSync(fd, encoder.encode(formatter(record)));
    options.flushSync(fd);
  };
  sink[Symbol.dispose] = () => options.closeSync(fd);
  return sink;
}

/**
 * Options for the {@link getRotatingFileSink} function.
 */
export interface RotatingFileSinkOptions extends FileSinkOptions {
  /**
   * The maximum bytes of the file before it is rotated.  1 MiB by default.
   */
  maxSize?: number;

  /**
   * The maximum number of files to keep.  5 by default.
   */
  maxFiles?: number;
}

/**
 * A platform-specific rotating file sink driver.
 */
export interface RotatingFileSinkDriver<TFile> extends FileSinkDriver<TFile> {
  /**
   * Get the size of the file.
   * @param path A path to the file.
   * @returns The `size` of the file in bytes, in an object.
   */
  statSync(path: string): { size: number };

  /**
   * Rename a file.
   * @param oldPath A path to the file to rename.
   * @param newPath A path to be renamed to.
   */
  renameSync(oldPath: string, newPath: string): void;
}

/**
 * Get a platform-independent rotating file sink.
 *
 * This sink writes log records to a file, and rotates the file when it reaches
 * the `maxSize`.  The rotated files are named with the original file name
 * followed by a dot and a number, starting from 1.  The number is incremented
 * for each rotation, and the maximum number of files to keep is `maxFiles`.
 *
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.
 */
export function getRotatingFileSink<TFile>(
  path: string,
  options: RotatingFileSinkOptions & RotatingFileSinkDriver<TFile>,
): Sink & Disposable {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const maxSize = options.maxSize ?? 1024 * 1024;
  const maxFiles = options.maxFiles ?? 5;
  let { size: offset } = options.statSync(path);
  let fd = options.openSync(path);
  function shouldRollover(bytes: Uint8Array): boolean {
    return offset + bytes.length > maxSize;
  }
  function performRollover(): void {
    options.closeSync(fd);
    for (let i = maxFiles - 1; i > 0; i--) {
      const oldPath = `${path}.${i}`;
      const newPath = `${path}.${i + 1}`;
      try {
        options.renameSync(oldPath, newPath);
      } catch (_) {
        // Continue if the file does not exist.
      }
    }
    options.renameSync(path, `${path}.1`);
    offset = 0;
    fd = options.openSync(path);
  }
  const sink: Sink & Disposable = (record: LogRecord) => {
    const bytes = encoder.encode(formatter(record));
    if (shouldRollover(bytes)) performRollover();
    options.writeSync(fd, bytes);
    options.flushSync(fd);
    offset += bytes.length;
  };
  sink[Symbol.dispose] = () => options.closeSync(fd);
  return sink;
}
