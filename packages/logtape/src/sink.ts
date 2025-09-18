import { type FilterLike, toFilter } from "./filter.ts";
import {
  type ConsoleFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
  type TextFormatter,
} from "./formatter.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";
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

/**
 * Options for the {@link fingersCrossed} function.
 * @since 1.1.0
 */
export interface FingersCrossedOptions {
  /**
   * Minimum log level that triggers buffer flush.
   * When a log record at or above this level is received, all buffered
   * records are flushed to the wrapped sink.
   * @default `"error"`
   */
  readonly triggerLevel?: LogLevel;

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
 * Metadata for context-based buffer tracking.
 * Used internally by {@link fingersCrossed} to manage buffer lifecycle with LRU support.
 * @since 1.2.0
 */
interface BufferMetadata {
  /**
   * The actual log records buffer.
   */
  readonly buffer: LogRecord[];

  /**
   * Timestamp of the last access to this buffer (in milliseconds).
   * Used for LRU-based eviction when {@link FingersCrossedOptions.isolateByContext.maxContexts} is set.
   */
  lastAccess: number;
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
  sink: Sink,
  options: FingersCrossedOptions = {},
): Sink | (Sink & Disposable) {
  const triggerLevel = options.triggerLevel ?? "error";
  const maxBufferSize = Math.max(0, options.maxBufferSize ?? 1000);
  const isolateByCategory = options.isolateByCategory;
  const isolateByContext = options.isolateByContext;

  // TTL and LRU configuration
  const bufferTtlMs = isolateByContext?.bufferTtlMs;
  const cleanupIntervalMs = isolateByContext?.cleanupIntervalMs ?? 30000;
  const maxContexts = isolateByContext?.maxContexts;
  const hasTtl = bufferTtlMs != null && bufferTtlMs > 0;
  const hasLru = maxContexts != null && maxContexts > 0;

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

  function parseCategoryKey(key: string): string[] {
    return JSON.parse(key);
  }

  // Helper function to extract context values from properties
  function getContextKey(properties: Record<string, unknown>): string {
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
  function getBufferKey(
    category: readonly string[],
    properties: Record<string, unknown>,
  ): string {
    const categoryKey = getCategoryKey(category);
    if (!isolateByContext) {
      return categoryKey;
    }
    const contextKey = getContextKey(properties);
    return `${categoryKey}:${contextKey}`;
  }

  // Helper function to parse buffer key
  function parseBufferKey(key: string): {
    category: string[];
    context: string;
  } {
    if (!isolateByContext) {
      return { category: parseCategoryKey(key), context: "" };
    }
    // Find the separator between category and context
    // The category part is JSON-encoded, so we need to find where it ends
    // We look for "]:" which indicates end of category array and start of context
    const separatorIndex = key.indexOf("]:");
    if (separatorIndex === -1) {
      // No context part, entire key is category
      return { category: parseCategoryKey(key), context: "" };
    }
    const categoryPart = key.substring(0, separatorIndex + 1); // Include the ]
    const contextPart = key.substring(separatorIndex + 2); // Skip ]:
    return { category: parseCategoryKey(categoryPart), context: contextPart };
  }

  // TTL-based cleanup function
  function cleanupExpiredBuffers(buffers: Map<string, BufferMetadata>): void {
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

    return (record: LogRecord) => {
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
      } else {
        // Buffer the record
        buffer.push(record);

        // Enforce max buffer size
        while (buffer.length > maxBufferSize) {
          buffer.shift();
        }
      }
    };
  } else {
    // Category and/or context-isolated buffers
    const buffers = new Map<string, BufferMetadata>();
    const triggered = new Set<string>();

    // Set up TTL cleanup timer if enabled
    let cleanupTimer: ReturnType<typeof setInterval> | null = null;
    if (hasTtl) {
      cleanupTimer = setInterval(() => {
        cleanupExpiredBuffers(buffers);
      }, cleanupIntervalMs);
    }

    const fingersCrossedSink = (record: LogRecord) => {
      const bufferKey = getBufferKey(record.category, record.properties);

      // Check if this buffer is already triggered
      if (triggered.has(bufferKey)) {
        sink(record);
        return;
      }

      // Check if this record triggers flush
      if (compareLogLevel(record.level, triggerLevel) >= 0) {
        // Find all buffers that should be flushed
        const keysToFlush = new Set<string>();

        for (const [bufferedKey] of buffers) {
          if (bufferedKey === bufferKey) {
            keysToFlush.add(bufferedKey);
          } else {
            const { category: bufferedCategory, context: bufferedContext } =
              parseBufferKey(bufferedKey);
            const { context: triggerContext } = parseBufferKey(bufferKey);

            // Check context match
            let contextMatches = true;
            if (isolateByContext) {
              contextMatches = bufferedContext === triggerContext;
            }

            // Check category match
            let categoryMatches = false;
            if (!isolateByCategory) {
              // No category isolation, so all categories match if context matches
              categoryMatches = contextMatches;
            } else if (shouldFlushBuffer) {
              try {
                categoryMatches = shouldFlushBuffer(
                  record.category,
                  bufferedCategory,
                );
              } catch {
                // Ignore errors from custom matcher
              }
            } else {
              // Same category only
              categoryMatches = getCategoryKey(record.category) ===
                getCategoryKey(bufferedCategory);
            }

            // Both must match for the buffer to be flushed
            if (contextMatches && categoryMatches) {
              keysToFlush.add(bufferedKey);
            }
          }
        }

        // Flush matching buffers
        const allRecordsToFlush: LogRecord[] = [];
        for (const key of keysToFlush) {
          const metadata = buffers.get(key);
          if (metadata) {
            allRecordsToFlush.push(...metadata.buffer);
            buffers.delete(key);
            triggered.add(key);
          }
        }

        // Sort by timestamp to maintain chronological order
        allRecordsToFlush.sort((a, b) => a.timestamp - b.timestamp);

        // Flush all records
        for (const bufferedRecord of allRecordsToFlush) {
          sink(bufferedRecord);
        }

        // Mark trigger buffer as triggered and send trigger record
        triggered.add(bufferKey);
        sink(record);
      } else {
        // Buffer the record
        const now = Date.now();
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
            lastAccess: now,
          };
          buffers.set(bufferKey, metadata);
        } else {
          // Update last access time for LRU
          metadata.lastAccess = now;
        }

        metadata.buffer.push(record);

        // Enforce max buffer size per buffer
        while (metadata.buffer.length > maxBufferSize) {
          metadata.buffer.shift();
        }
      }
    };

    // Add disposal functionality to clean up timer
    if (cleanupTimer !== null) {
      (fingersCrossedSink as Sink & Disposable)[Symbol.dispose] = () => {
        if (cleanupTimer !== null) {
          clearInterval(cleanupTimer);
          cleanupTimer = null;
        }
      };
    }

    return fingersCrossedSink;
  }
}
