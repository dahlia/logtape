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
 * @param formatter The text formatter to use.  Defaults to
 *                  {@link defaultTextFormatter}.
 * @param encoder The text encoder to use.  Defaults to an instance of
 *                {@link TextEncoder}.
 * @returns A sink that writes to the stream.
 */
export function getStreamSink(
  stream: WritableStream,
  formatter: TextFormatter = defaultTextFormatter,
  encoder: { encode(text: string): Uint8Array } = new TextEncoder(),
): Sink {
  const writer = stream.getWriter();
  return (record: LogRecord) => {
    const bytes = encoder.encode(formatter(record));
    writer.ready.then(() => writer.write(bytes));
  };
}

/**
 * A console sink factory that returns a sink that logs to the console.
 *
 * @param formatter A console formatter.  Defaults to
 *                  {@link defaultConsoleFormatter}.
 * @param console The console to log to.  Defaults to {@link console}.
 * @returns A sink that logs to the console.
 */
export function getConsoleSink(
  formatter: ConsoleFormatter = defaultConsoleFormatter,
  console: Console = globalThis.console,
): Sink {
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
