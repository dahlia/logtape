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
 * An async sink is a function that accepts a log record and asynchronously
 * processes it. This type is used with {@link fromAsyncSink} to create
 * a regular sink that properly handles asynchronous operations.
 *
 * @param record The log record to process asynchronously.
 * @returns A promise that resolves when the record has been processed.
 * @since 1.0.0
 */
export type AsyncSink = (record: LogRecord) => Promise<void>;

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

  /**
   * Enable non-blocking mode with optional buffer configuration.
   * When enabled, log records are buffered and flushed in the background.
   *
   * @example Simple non-blocking mode
   * ```typescript
   * getStreamSink(stream, { nonBlocking: true });
   * ```
   *
   * @example Custom buffer configuration
   * ```typescript
   * getStreamSink(stream, {
   *   nonBlocking: {
   *     bufferSize: 1000,
   *     flushInterval: 50
   *   }
   * });
   * ```
   *
   * @default `false`
   * @since 1.0.0
   */
  nonBlocking?: boolean | {
    /**
     * Maximum number of records to buffer before flushing.
     * @default `100`
     */
    bufferSize?: number;

    /**
     * Interval in milliseconds between automatic flushes.
     * @default `100`
     */
    flushInterval?: number;
  };
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

  if (!options.nonBlocking) {
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

  // Non-blocking mode implementation
  const nonBlockingConfig = options.nonBlocking === true
    ? {}
    : options.nonBlocking;
  const bufferSize = nonBlockingConfig.bufferSize ?? 100;
  const flushInterval = nonBlockingConfig.flushInterval ?? 100;

  const buffer: LogRecord[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let activeFlush: Promise<void> | null = null;
  const maxBufferSize = bufferSize * 2; // Overflow protection

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    const records = buffer.splice(0);
    for (const record of records) {
      try {
        const bytes = encoder.encode(formatter(record));
        await writer.ready;
        await writer.write(bytes);
      } catch {
        // Silently ignore errors in non-blocking mode to avoid disrupting the application
      }
    }
  }

  function scheduleFlush(): void {
    if (activeFlush) return;

    activeFlush = flush().finally(() => {
      activeFlush = null;
    });
  }

  function startFlushTimer(): void {
    if (flushTimer !== null || disposed) return;

    flushTimer = setInterval(() => {
      scheduleFlush();
    }, flushInterval);
  }

  const nonBlockingSink: Sink & AsyncDisposable = (record: LogRecord) => {
    if (disposed) return;

    // Buffer overflow protection: drop oldest records if buffer is too large
    if (buffer.length >= maxBufferSize) {
      buffer.shift(); // Remove oldest record
    }

    buffer.push(record);

    if (buffer.length >= bufferSize) {
      scheduleFlush();
    } else if (flushTimer === null) {
      startFlushTimer();
    }
  };

  nonBlockingSink[Symbol.asyncDispose] = async () => {
    disposed = true;
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    await flush();
    try {
      await writer.close();
    } catch {
      // Writer might already be closed or errored
    }
  };

  return nonBlockingSink;
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
   *   trace: "trace",
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

  /**
   * Enable non-blocking mode with optional buffer configuration.
   * When enabled, log records are buffered and flushed in the background.
   *
   * @example Simple non-blocking mode
   * ```typescript
   * getConsoleSink({ nonBlocking: true });
   * ```
   *
   * @example Custom buffer configuration
   * ```typescript
   * getConsoleSink({
   *   nonBlocking: {
   *     bufferSize: 1000,
   *     flushInterval: 50
   *   }
   * });
   * ```
   *
   * @default `false`
   * @since 1.0.0
   */
  nonBlocking?: boolean | {
    /**
     * Maximum number of records to buffer before flushing.
     * @default `100`
     */
    bufferSize?: number;

    /**
     * Interval in milliseconds between automatic flushes.
     * @default `100`
     */
    flushInterval?: number;
  };
}

/**
 * A console sink factory that returns a sink that logs to the console.
 *
 * @param options The options for the sink.
 * @returns A sink that logs to the console. If `nonBlocking` is enabled,
 *          returns a sink that also implements {@link Disposable}.
 */
export function getConsoleSink(
  options: ConsoleSinkOptions = {},
): Sink | (Sink & Disposable) {
  const formatter = options.formatter ?? defaultConsoleFormatter;
  const levelMap: Record<LogLevel, ConsoleMethod> = {
    trace: "debug",
    debug: "debug",
    info: "info",
    warning: "warn",
    error: "error",
    fatal: "error",
    ...(options.levelMap ?? {}),
  };
  const console = options.console ?? globalThis.console;

  const baseSink = (record: LogRecord) => {
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

  if (!options.nonBlocking) {
    return baseSink;
  }

  // Non-blocking mode implementation
  const nonBlockingConfig = options.nonBlocking === true
    ? {}
    : options.nonBlocking;
  const bufferSize = nonBlockingConfig.bufferSize ?? 100;
  const flushInterval = nonBlockingConfig.flushInterval ?? 100;

  const buffer: LogRecord[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let flushScheduled = false;
  const maxBufferSize = bufferSize * 2; // Overflow protection

  function flush(): void {
    if (buffer.length === 0) return;

    const records = buffer.splice(0);
    for (const record of records) {
      try {
        baseSink(record);
      } catch {
        // Silently ignore errors in non-blocking mode to avoid disrupting the application
      }
    }
  }

  function scheduleFlush(): void {
    if (flushScheduled) return;

    flushScheduled = true;
    setTimeout(() => {
      flushScheduled = false;
      flush();
    }, 0);
  }

  function startFlushTimer(): void {
    if (flushTimer !== null || disposed) return;

    flushTimer = setInterval(() => {
      flush();
    }, flushInterval);
  }

  const nonBlockingSink: Sink & Disposable = (record: LogRecord) => {
    if (disposed) return;

    // Buffer overflow protection: drop oldest records if buffer is too large
    if (buffer.length >= maxBufferSize) {
      buffer.shift(); // Remove oldest record
    }

    buffer.push(record);

    if (buffer.length >= bufferSize) {
      scheduleFlush();
    } else if (flushTimer === null) {
      startFlushTimer();
    }
  };

  nonBlockingSink[Symbol.dispose] = () => {
    disposed = true;
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    flush();
  };

  return nonBlockingSink;
}

/**
 * Converts an async sink into a regular sink with proper async handling.
 * The returned sink chains async operations to ensure proper ordering and
 * implements AsyncDisposable to wait for all pending operations on disposal.
 *
 * @example Create a sink that asynchronously posts to a webhook
 * ```typescript
 * const asyncSink: AsyncSink = async (record) => {
 *   await fetch("https://example.com/logs", {
 *     method: "POST",
 *     body: JSON.stringify(record),
 *   });
 * };
 * const sink = fromAsyncSink(asyncSink);
 * ```
 *
 * @param asyncSink The async sink function to convert.
 * @returns A sink that properly handles async operations and disposal.
 * @since 1.0.0
 */
export function fromAsyncSink(asyncSink: AsyncSink): Sink & AsyncDisposable {
  let lastPromise = Promise.resolve();
  const sink: Sink & AsyncDisposable = (record: LogRecord) => {
    lastPromise = lastPromise
      .then(() => asyncSink(record))
      .catch(() => {
        // Errors are handled by the sink infrastructure
      });
  };
  sink[Symbol.asyncDispose] = async () => {
    await lastPromise;
  };
  return sink;
}
