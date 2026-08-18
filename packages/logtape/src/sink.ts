import { type FilterLike, toFilter } from "./filter.ts";
import {
  type ConsoleFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
  type TextFormatter,
} from "./formatter.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";
import { LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";

const immediateSinkSymbol = Symbol.for(
  "LogTape.sinkSnapshotPolicy.immediate",
);

function markSinkAsImmediate<T extends Sink>(sink: T): T {
  Object.defineProperty(sink, immediateSinkSymbol, {
    value: true,
  });
  return sink;
}

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
  const filtered: Sink & Partial<Disposable & AsyncDisposable> = (
    record: LogRecord,
  ) => {
    if (filterFunc(record)) sink(record);
  };
  const disposableSink = sink as Sink & Partial<Disposable & AsyncDisposable>;
  if (Symbol.dispose in disposableSink) {
    filtered[Symbol.dispose] = disposableSink[Symbol.dispose]?.bind(sink);
  }
  if (Symbol.asyncDispose in disposableSink) {
    filtered[Symbol.asyncDispose] = disposableSink[Symbol.asyncDispose]?.bind(
      sink,
    );
  }
  return filtered;
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
   * Whether to close the stream when the sink is disposed.  Set this to
   * `false` for caller-owned streams that need to remain open after disposal.
   * The sink still waits for pending writes and releases its writer lock.
   *
   * @default `true`
   * @since 2.4.0
   */
  closeStream?: boolean;

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
  const closeStream = options.closeStream ?? true;
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
      try {
        await lastPromise;
        if (closeStream) await writer.close();
      } finally {
        writer.releaseLock();
      }
    };
    return markSinkAsImmediate(sink);
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
    try {
      await activeFlush;
      await flush();
      if (closeStream) {
        try {
          await writer.close();
        } catch {
          // Writer might already be closed or errored
        }
      }
    } finally {
      writer.releaseLock();
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
  let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null;
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
    scheduledFlushTimer = setTimeout(() => {
      scheduledFlushTimer = null;
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
    if (scheduledFlushTimer !== null) {
      clearTimeout(scheduledFlushTimer);
      scheduledFlushTimer = null;
      flushScheduled = false;
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
      .catch((error) => {
        try {
          if (_asyncSinkError in record) return;

          const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
          const errorRecord = {
            category: ["logtape", "meta"],
            level: "error",
            timestamp: Date.now(),
            rawMessage: "Async sink error: {error}",
            message: ["Async sink error: ", error, ""],
            properties: { error, sink: asyncSink, record },
            [_asyncSinkError]: true,
          } as LogRecord;
          metaLogger.emit(errorRecord, new Set([sink]));
        } catch {
          // Last resort – cannot log at all
        }
      });
  };
  sink[Symbol.asyncDispose] = async () => {
    // Drain the promise chain until it settles – catch handlers
    // may enqueue additional async work (e.g., meta-logger writes)
    for (;;) {
      const promise = lastPromise;
      await promise;
      if (promise === lastPromise) break;
    }
  };
  return sink;
}

const _asyncSinkError = Symbol.for("logtape.asyncSinkError");

/**
 * An action returned by {@link FingersCrossedOptions.bufferAction}.
 *
 * Both actions end the matching buffer lifecycle.  `"flush"` emits the
 * buffered records and the action record, while `"discard"` drops them.
 * @since 2.4.0
 */
export type FingersCrossedBufferAction = "flush" | "discard";

/**
 * Selects buffers controlled by a {@link FingersCrossedSink}.
 * @since 2.4.0
 */
export interface FingersCrossedBufferSelector {
  /**
   * Context values to match.  Every key configured by
   * {@link FingersCrossedOptions.isolateByContext} must be present.
   * When omitted, buffers from every context are selected.
   */
  readonly context?: Readonly<Record<string, unknown>>;

  /**
   * Category to match.  When category isolation is enabled, its configured
   * matcher also applies to descendant or ancestor buffers.  When omitted,
   * buffers from every category are selected.
   */
  readonly category?: readonly string[];
}

/**
 * A sink returned by {@link fingersCrossed} with manual buffer controls.
 * @since 2.4.0
 */
export interface FingersCrossedSink {
  /**
   * Processes a log record.
   * @param record The log record to process.
   */
  (record: LogRecord): void;

  /**
   * Emits the selected buffered records, then releases their buffered and
   * triggered state.  With no selector, every buffer is flushed.
   *
   * @param selector The buffers to flush.
   */
  flush(selector?: FingersCrossedBufferSelector): void;

  /**
   * Drops the selected buffered records, then releases their buffered and
   * triggered state.  With no selector, every buffer is discarded.
   *
   * @param selector The buffers to discard.
   */
  discard(selector?: FingersCrossedBufferSelector): void;
}

/**
 * Options for the {@link fingersCrossed} function.
 * @since 1.1.0
 */
export interface FingersCrossedOptions {
  /**
   * Chooses a terminal action for a log record and its matching buffer.
   * Returning `undefined` applies the regular {@link triggerLevel} and
   * {@link bufferLevel} behavior.
   *
   * The callback runs before checking whether the matching buffer has already
   * been triggered.  This lets a final request or job record release both
   * buffered and triggered state.
   *
   * @example Flush failed requests and discard successful requests
   * ```typescript
   * fingersCrossed(sink, {
   *   isolateByContext: { keys: ["requestId"] },
   *   bufferAction(record) {
   *     const status = record.properties.status;
   *     if (typeof status !== "number") return undefined;
   *     return status >= 500 ? "flush" : "discard";
   *   },
   * });
   * ```
   *
   * @since 2.4.0
   */
  readonly bufferAction?: (
    record: LogRecord,
  ) => FingersCrossedBufferAction | undefined;

  /**
   * Minimum log level that triggers buffer flush.
   * When a log record at or above this level is received, all buffered
   * records are flushed to the wrapped sink.
   * @default `"error"`
   */
  readonly triggerLevel?: LogLevel;

  /**
   * Maximum log level that will be buffered.
   * Log records at or below this level are buffered, while records above
   * this level (but below {@link triggerLevel}) pass through immediately
   * without buffering.
   *
   * When `undefined` (default), all records below {@link triggerLevel} are
   * buffered (equivalent to setting this to the level just below triggerLevel).
   *
   * When `null`, all records below {@link triggerLevel} are buffered
   * (same as `undefined`, but explicit).
   *
   * @example Buffer only trace and debug, pass through info immediately
   * ```typescript
   * fingersCrossed(sink, {
   *   bufferLevel: "debug",     // trace, debug → buffered
   *   triggerLevel: "warning",  // warning+ → trigger flush
   *   // info → passes through immediately (not buffered, not trigger)
   * })
   * ```
   *
   * @default `undefined` (buffer all levels below triggerLevel)
   * @since 2.0.0
   */
  readonly bufferLevel?: LogLevel | null;

  /**
   * Maximum buffer size before oldest records are dropped.
   * When the buffer exceeds this size, the oldest records are removed
   * to prevent unbounded memory growth.
   * @default `1000`
   */
  readonly maxBufferSize?: number;

  /**
   * Category isolation mode or custom matcher function.
   *
   * When `undefined` (default), all log records share a single buffer.
   *
   * When set to a mode string:
   *
   * - `"descendant"`: Flush child category buffers when parent triggers
   * - `"ancestor"`: Flush parent category buffers when child triggers
   * - `"both"`: Flush both parent and child category buffers
   *
   * When set to a function, it receives the trigger category and buffered
   * category and should return true if the buffered category should be flushed.
   *
   * @default `undefined` (no isolation, single global buffer)
   */
  readonly isolateByCategory?:
    | "descendant"
    | "ancestor"
    | "both"
    | ((
      triggerCategory: readonly string[],
      bufferedCategory: readonly string[],
    ) => boolean);

  /**
   * Enable context-based buffer isolation.
   * When enabled, buffers are isolated based on specified context keys.
   * This is useful for scenarios like HTTP request tracing where logs
   * should be isolated per request.
   *
   * @example
   * ```typescript
   * fingersCrossed(sink, {
   *   isolateByContext: { keys: ['requestId'] }
   * })
   * ```
   *
   * @example Combined with category isolation
   * ```typescript
   * fingersCrossed(sink, {
   *   isolateByCategory: 'descendant',
   *   isolateByContext: { keys: ['requestId', 'sessionId'] }
   * })
   * ```
   *
   * @example With TTL-based buffer cleanup
   * ```typescript
   * fingersCrossed(sink, {
   *   isolateByContext: {
   *     keys: ['requestId'],
   *     bufferTtlMs: 30000,        // 30 seconds
   *     cleanupIntervalMs: 10000   // cleanup every 10 seconds
   *   }
   * })
   * ```
   *
   * @default `undefined` (no context isolation)
   * @since 1.2.0
   */
  readonly isolateByContext?: {
    /**
     * Context keys to use for isolation.
     * Buffers will be separate for different combinations of these context values.
     */
    readonly keys: readonly string[];

    /**
     * Maximum number of context buffers to maintain simultaneously.
     * When this limit is exceeded, the least recently used (LRU) buffers
     * will be evicted to make room for new ones.
     *
     * This provides memory protection in high-concurrency scenarios where
     * many different context values might be active simultaneously.
     *
     * When set to 0 or undefined, no limit is enforced.
     *
     * @default `undefined` (no limit)
     * @since 1.2.0
     */
    readonly maxContexts?: number;

    /**
     * Time-to-live for context buffers in milliseconds.
     * Buffers that haven't been accessed for this duration will be automatically
     * cleaned up to prevent memory leaks in long-running applications.
     *
     * When set to 0 or undefined, buffers will never expire based on time.
     *
     * @default `undefined` (no TTL)
     * @since 1.2.0
     */
    readonly bufferTtlMs?: number;

    /**
     * Interval in milliseconds for running cleanup operations.
     * The cleanup process removes expired buffers based on {@link bufferTtlMs}.
     *
     * This option is ignored if {@link bufferTtlMs} is not set.
     *
     * @default `30000` (30 seconds)
     * @since 1.2.0
     */
    readonly cleanupIntervalMs?: number;
  };
}

/**
 * Metadata for isolated buffer tracking.
 * Used internally by {@link fingersCrossed} to manage buffer lifecycle with
 * LRU support.
 * @since 1.2.0
 */
interface BufferIdentity {
  /**
   * The category associated with this buffer.
   */
  readonly category: readonly string[];

  /**
   * The serialized context associated with this buffer.
   */
  readonly context: string;
}

interface BufferMetadata extends BufferIdentity {
  /**
   * The actual log records buffer.
   */
  readonly buffer: LogRecord[];

  /**
   * Monotonically increasing order of the last access to this buffer.
   * Used for LRU-based eviction when {@link FingersCrossedOptions.isolateByContext.maxContexts} is set.
   */
  lastAccess: number;
}

/**
 * Metadata for a buffer that has already been triggered.
 */
interface TriggeredBufferMetadata extends BufferIdentity {
  /**
   * The time when this buffer was most recently triggered or accessed.
   */
  triggeredAt: number;
}

/**
 * Creates a sink that buffers log records until a trigger level is reached.
 * This pattern, known as "fingers crossed" logging, keeps detailed debug logs
 * in memory and only outputs them when an error or other significant event occurs.
 *
 * @example Basic usage with default settings
 * ```typescript
 * const sink = fingersCrossed(getConsoleSink());
 * // Debug and info logs are buffered
 * // When an error occurs, all buffered logs + the error are output
 * ```
 *
 * @example Custom trigger level and buffer size
 * ```typescript
 * const sink = fingersCrossed(getConsoleSink(), {
 *   triggerLevel: "warning",  // Trigger on warning or higher
 *   maxBufferSize: 500        // Keep last 500 records
 * });
 * ```
 *
 * @example Category isolation
 * ```typescript
 * const sink = fingersCrossed(getConsoleSink(), {
 *   isolateByCategory: "descendant"  // Separate buffers per category
 * });
 * // Error in ["app"] triggers flush of ["app"] and ["app", "module"] buffers
 * // But not ["other"] buffer
 * ```
 *
 * @param sink The sink to wrap. Buffered records are sent to this sink when
 *             triggered.
 * @param options Configuration options for the fingers crossed behavior.
 * @returns A sink that buffers records until the trigger level is reached.
 * @since 1.1.0
 */
export function fingersCrossed(
  sink: Sink & Disposable & AsyncDisposable,
  options?: FingersCrossedOptions,
): FingersCrossedSink & Disposable & AsyncDisposable;
export function fingersCrossed(
  sink: Sink & AsyncDisposable,
  options?: FingersCrossedOptions,
): FingersCrossedSink & AsyncDisposable & Partial<Disposable>;
export function fingersCrossed(
  sink: Sink & Disposable,
  options?: FingersCrossedOptions,
): FingersCrossedSink & Disposable;
export function fingersCrossed(
  sink: Sink,
  options?: FingersCrossedOptions,
): FingersCrossedSink & Partial<Disposable>;
export function fingersCrossed(
  sink: Sink,
  options: FingersCrossedOptions = {},
): FingersCrossedSink & Partial<Disposable & AsyncDisposable> {
  const triggerLevel = options.triggerLevel ?? "error";
  const bufferLevel = options.bufferLevel;
  const maxBufferSize = Math.max(0, options.maxBufferSize ?? 1000);
  const isolateByCategory = options.isolateByCategory;
  const isolateByContext = options.isolateByContext;

  // TTL and LRU configuration
  const bufferTtlMs = isolateByContext?.bufferTtlMs;
  const cleanupIntervalMs = isolateByContext?.cleanupIntervalMs ?? 30000;
  const maxContexts = isolateByContext?.maxContexts;
  const hasTtl = bufferTtlMs != null && bufferTtlMs > 0;
  const hasLru = maxContexts != null && maxContexts > 0;

  function wrapSink<TSink extends Sink>(
    wrapped: TSink,
    disposeSelf?: () => void,
  ): TSink & Partial<Disposable & AsyncDisposable> {
    const disposableSink = sink as
      & Sink
      & Partial<Disposable & AsyncDisposable>;
    const disposableWrapped = wrapped as
      & TSink
      & Partial<Disposable & AsyncDisposable>;
    const disposeSink = disposableSink[Symbol.dispose];
    const asyncDisposeSink = disposableSink[Symbol.asyncDispose];

    if (disposeSelf != null || disposeSink != null) {
      disposableWrapped[Symbol.dispose] = () => {
        disposeSelf?.();
        disposeSink?.call(sink);
      };
    }
    if (asyncDisposeSink != null) {
      disposableWrapped[Symbol.asyncDispose] = async () => {
        disposeSelf?.();
        await asyncDisposeSink.call(sink);
      };
    }
    return disposableWrapped;
  }

  // Validate trigger level early
  try {
    compareLogLevel("trace", triggerLevel); // Test with any valid level
  } catch (error) {
    throw new TypeError(
      `Invalid triggerLevel: ${JSON.stringify(triggerLevel)}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Validate buffer level if provided
  if (bufferLevel != null) {
    try {
      compareLogLevel("trace", bufferLevel); // Test with any valid level
    } catch (error) {
      throw new TypeError(
        `Invalid bufferLevel: ${JSON.stringify(bufferLevel)}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // bufferLevel must be strictly less than triggerLevel
    if (compareLogLevel(bufferLevel, triggerLevel) >= 0) {
      throw new RangeError(
        `bufferLevel (${JSON.stringify(bufferLevel)}) must be lower than ` +
          `triggerLevel (${JSON.stringify(triggerLevel)}).`,
      );
    }
  }

  function getBufferAction(
    record: LogRecord,
  ): FingersCrossedBufferAction | undefined {
    const action = options.bufferAction?.(record);
    if (action !== undefined && action !== "flush" && action !== "discard") {
      throw new TypeError(
        `Invalid buffer action: ${JSON.stringify(action)}. ` +
          'Expected "flush", "discard", or undefined.',
      );
    }
    return action;
  }

  // Helper functions for category matching
  function isDescendant(
    parent: readonly string[],
    child: readonly string[],
  ): boolean {
    if (parent.length === 0 || child.length === 0) return false; // Empty categories are isolated
    if (parent.length > child.length) return false;
    return parent.every((p, i) => p === child[i]);
  }

  function isAncestor(
    child: readonly string[],
    parent: readonly string[],
  ): boolean {
    if (child.length === 0 || parent.length === 0) return false; // Empty categories are isolated
    if (child.length < parent.length) return false;
    return parent.every((p, i) => p === child[i]);
  }

  // Determine matcher function based on isolation mode
  let shouldFlushBuffer:
    | ((
      triggerCategory: readonly string[],
      bufferedCategory: readonly string[],
    ) => boolean)
    | null = null;

  if (isolateByCategory) {
    if (typeof isolateByCategory === "function") {
      shouldFlushBuffer = isolateByCategory;
    } else {
      switch (isolateByCategory) {
        case "descendant":
          shouldFlushBuffer = (trigger, buffered) =>
            isDescendant(trigger, buffered);
          break;
        case "ancestor":
          shouldFlushBuffer = (trigger, buffered) =>
            isAncestor(trigger, buffered);
          break;
        case "both":
          shouldFlushBuffer = (trigger, buffered) =>
            isDescendant(trigger, buffered) || isAncestor(trigger, buffered);
          break;
      }
    }
  }

  // Helper functions for category serialization
  function getCategoryKey(category: readonly string[]): string {
    return JSON.stringify(category);
  }

  // Helper function to extract context values from properties
  function getContextKey(
    properties: Readonly<Record<string, unknown>>,
  ): string {
    if (!isolateByContext || isolateByContext.keys.length === 0) {
      return "";
    }
    const contextValues: Record<string, unknown> = {};
    for (const key of isolateByContext.keys) {
      if (key in properties) {
        contextValues[key] = properties[key];
      }
    }
    return JSON.stringify(contextValues);
  }

  // Helper function to generate buffer key
  function getBufferKey(identity: BufferIdentity): string {
    const categoryKey = getCategoryKey(identity.category);
    if (!isolateByContext) {
      return categoryKey;
    }
    return `${categoryKey}:${identity.context}`;
  }

  // Helper function to capture the original buffer identity
  function getBufferIdentity(record: LogRecord): BufferIdentity {
    return {
      category: record.category,
      context: getContextKey(record.properties),
    };
  }

  // TTL-based cleanup function
  function cleanupExpiredBuffers(
    buffers: Map<string, BufferMetadata>,
    triggered: Map<string, TriggeredBufferMetadata>,
  ): void {
    if (!hasTtl) return;

    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, metadata] of buffers) {
      if (metadata.buffer.length === 0) continue;

      // Use the timestamp of the last (most recent) record in the buffer
      const lastRecordTimestamp =
        metadata.buffer[metadata.buffer.length - 1].timestamp;
      if (now - lastRecordTimestamp > bufferTtlMs!) {
        expiredKeys.push(key);
      }
    }

    // Remove expired buffers
    for (const key of expiredKeys) {
      buffers.delete(key);
      triggered.delete(key);
    }

    // Triggered buffers no longer have buffer metadata, so they must be
    // expired separately to avoid unbounded growth for dynamic contexts.
    for (const [key, metadata] of triggered) {
      if (now - metadata.triggeredAt > bufferTtlMs!) {
        triggered.delete(key);
      }
    }
  }

  // LRU-based eviction function
  function evictLruBuffers(
    buffers: Map<string, BufferMetadata>,
    numToEvict?: number,
  ): void {
    if (!hasLru) return;

    // Use provided numToEvict or calculate based on current size vs limit
    const toEvict = numToEvict ?? Math.max(0, buffers.size - maxContexts!);
    if (toEvict <= 0) return;

    // Sort by lastAccess timestamp (oldest first)
    const sortedEntries = Array.from(buffers.entries())
      .sort(([, a], [, b]) => a.lastAccess - b.lastAccess);

    // Remove the oldest buffers
    for (let i = 0; i < toEvict; i++) {
      const [key] = sortedEntries[i];
      buffers.delete(key);
    }
  }

  // Buffer management
  if (!isolateByCategory && !isolateByContext) {
    // Single global buffer
    const buffer: LogRecord[] = [];
    let triggered = false;

    const validateGlobalSelector = (
      selector: FingersCrossedBufferSelector | undefined,
    ): void => {
      if (selector?.context != null || selector?.category != null) {
        throw new TypeError(
          "A buffer selector cannot be used without buffer isolation.",
        );
      }
    };

    const flush = (
      selector?: FingersCrossedBufferSelector,
    ): void => {
      validateGlobalSelector(selector);
      const bufferedRecords = buffer.splice(0);
      triggered = false;
      for (const bufferedRecord of bufferedRecords) sink(bufferedRecord);
    };

    const discard = (
      selector?: FingersCrossedBufferSelector,
    ): void => {
      validateGlobalSelector(selector);
      buffer.length = 0;
      triggered = false;
    };

    const fingersCrossedSink = ((record: LogRecord) => {
      const action = getBufferAction(record);
      if (action === "flush") {
        flush();
        sink(record);
        return;
      }
      if (action === "discard") {
        discard();
        return;
      }

      if (triggered) {
        // Already triggered, pass through directly
        sink(record);
        return;
      }

      // Check if this record triggers flush
      if (compareLogLevel(record.level, triggerLevel) >= 0) {
        triggered = true;

        // Flush buffer
        for (const bufferedRecord of buffer) {
          sink(bufferedRecord);
        }
        buffer.length = 0;

        // Send trigger record
        sink(record);
      } else if (
        bufferLevel != null &&
        compareLogLevel(record.level, bufferLevel) > 0
      ) {
        // Record is above bufferLevel but below triggerLevel: pass through
        sink(record);
      } else {
        // Buffer the record
        buffer.push(record);

        // Enforce max buffer size
        while (buffer.length > maxBufferSize) {
          buffer.shift();
        }
      }
    }) as FingersCrossedSink;
    fingersCrossedSink.flush = flush;
    fingersCrossedSink.discard = discard;
    return wrapSink(fingersCrossedSink);
  } else {
    // Category and/or context-isolated buffers
    const buffers = new Map<string, BufferMetadata>();
    const triggered = new Map<string, TriggeredBufferMetadata>();
    let accessCounter = 0;

    interface BufferSelection {
      readonly category?: readonly string[];
      readonly context?: string;
    }

    const getRecordSelection = (
      identity: BufferIdentity,
    ): BufferSelection => {
      return {
        category: isolateByCategory ? identity.category : undefined,
        context: isolateByContext ? identity.context : undefined,
      };
    };

    const getManualSelection = (
      selector: FingersCrossedBufferSelector | undefined,
    ): BufferSelection => {
      let context: string | undefined;
      if (selector?.context != null) {
        if (!isolateByContext) {
          throw new TypeError(
            "A context selector requires isolateByContext.",
          );
        }
        const missingKeys = isolateByContext.keys.filter(
          (key) => !(key in selector.context!),
        );
        if (missingKeys.length > 0) {
          throw new TypeError(
            `Missing context selector keys: ${missingKeys.join(", ")}.`,
          );
        }
        context = getContextKey(selector.context);
      }
      return { category: selector?.category, context };
    };

    const matchesSelection = (
      identity: BufferIdentity,
      selection: BufferSelection,
    ): boolean => {
      if (
        selection.context != null && selection.context !== identity.context
      ) {
        return false;
      }
      if (selection.category == null) return true;
      if (
        getCategoryKey(selection.category) ===
          getCategoryKey(identity.category)
      ) {
        return true;
      }
      if (!isolateByCategory || shouldFlushBuffer == null) return false;
      try {
        return shouldFlushBuffer(selection.category, identity.category);
      } catch {
        return false;
      }
    };

    const takeBufferedRecords = (selection: BufferSelection): {
      readonly selectedBuffers: readonly {
        readonly key: string;
        readonly identity: BufferIdentity;
      }[];
      readonly records: readonly LogRecord[];
    } => {
      const selectedBuffers: {
        readonly key: string;
        readonly identity: BufferIdentity;
      }[] = [];
      const records: LogRecord[] = [];
      for (const [key, metadata] of buffers) {
        if (!matchesSelection(metadata, selection)) continue;
        selectedBuffers.push({ key, identity: metadata });
        records.push(...metadata.buffer);
        buffers.delete(key);
      }
      records.sort((a, b) => a.timestamp - b.timestamp);
      return { selectedBuffers, records };
    };

    const releaseTriggeredState = (selection: BufferSelection): void => {
      for (const [key, metadata] of triggered) {
        if (matchesSelection(metadata, selection)) triggered.delete(key);
      }
    };

    const flushSelection = (selection: BufferSelection): void => {
      const { records } = takeBufferedRecords(selection);
      releaseTriggeredState(selection);
      for (const record of records) sink(record);
    };

    const discardSelection = (selection: BufferSelection): void => {
      for (const [key, metadata] of buffers) {
        if (matchesSelection(metadata, selection)) buffers.delete(key);
      }
      releaseTriggeredState(selection);
    };

    // Set up TTL cleanup timer if enabled
    let cleanupTimer: ReturnType<typeof setInterval> | null = null;
    if (hasTtl) {
      cleanupTimer = setInterval(() => {
        cleanupExpiredBuffers(buffers, triggered);
      }, cleanupIntervalMs);
    }

    const fingersCrossedSink = ((record: LogRecord) => {
      const identity = getBufferIdentity(record);
      const bufferKey = getBufferKey(identity);
      const selection = getRecordSelection(identity);
      const action = getBufferAction(record);

      if (action === "flush") {
        flushSelection(selection);
        sink(record);
        return;
      }
      if (action === "discard") {
        discardSelection(selection);
        return;
      }

      // Check if this buffer is already triggered
      const triggeredMetadata = triggered.get(bufferKey);
      if (triggeredMetadata != null) {
        triggeredMetadata.triggeredAt = Date.now();
        sink(record);
        return;
      }

      // Check if this record triggers flush
      if (compareLogLevel(record.level, triggerLevel) >= 0) {
        const { selectedBuffers, records } = takeBufferedRecords(selection);
        const triggeredAt = Date.now();
        for (const { key, identity } of selectedBuffers) {
          triggered.set(key, {
            category: identity.category,
            context: identity.context,
            triggeredAt,
          });
        }

        // Flush all records
        for (const bufferedRecord of records) sink(bufferedRecord);

        // Mark trigger buffer as triggered and send trigger record
        triggered.set(bufferKey, {
          category: identity.category,
          context: identity.context,
          triggeredAt,
        });
        sink(record);
      } else if (
        bufferLevel != null &&
        compareLogLevel(record.level, bufferLevel) > 0
      ) {
        // Record is above bufferLevel but below triggerLevel: pass through
        sink(record);
      } else {
        // Buffer the record
        let metadata = buffers.get(bufferKey);
        if (!metadata) {
          // Apply LRU eviction if adding new buffer would exceed capacity
          if (hasLru && buffers.size >= maxContexts!) {
            // Calculate how many buffers to evict to make room for the new one
            const numToEvict = buffers.size - maxContexts! + 1;
            evictLruBuffers(buffers, numToEvict);
          }

          metadata = {
            buffer: [],
            ...identity,
            lastAccess: ++accessCounter,
          };
          buffers.set(bufferKey, metadata);
        } else {
          // Update last access order for LRU
          metadata.lastAccess = ++accessCounter;
        }

        metadata.buffer.push(record);

        // Enforce max buffer size per buffer
        while (metadata.buffer.length > maxBufferSize) {
          metadata.buffer.shift();
        }
      }
    }) as FingersCrossedSink;

    fingersCrossedSink.flush = (selector) => {
      flushSelection(getManualSelection(selector));
    };
    fingersCrossedSink.discard = (selector) => {
      discardSelection(getManualSelection(selector));
    };

    return wrapSink(
      fingersCrossedSink,
      cleanupTimer === null ? undefined : () => {
        if (cleanupTimer !== null) {
          clearInterval(cleanupTimer);
          cleanupTimer = null;
        }
      },
    );
  }
}
