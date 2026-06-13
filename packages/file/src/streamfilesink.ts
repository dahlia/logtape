import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
  type TextFormatter,
} from "@logtape/logtape";
import { once } from "node:events";
import { createWriteStream } from "node:fs";

/**
 * Options for the {@link getStreamFileSink} function.
 *
 * This interface configures the high-performance stream-based file sink that
 * writes directly to Node.js file streams for optimal I/O performance with
 * native stream buffering.
 *
 * @since 1.0.0
 */
export interface StreamFileSinkOptions {
  /**
   * High water mark for the file stream buffer in bytes.
   *
   * This controls the internal buffer size of the underlying file stream.
   * Higher values can improve performance for high-volume logging but use more
   * memory. Lower values reduce memory usage but may impact performance.
   *
   * @default 16384
   * @since 1.0.0
   */
  readonly highWaterMark?: number;

  /**
   * A custom formatter for log records.
   *
   * If not specified, the default text formatter will be used, which formats
   * records in the standard LogTape format with timestamp, level, category,
   * and message.
   *
   * @default defaultTextFormatter
   * @since 1.0.0
   */
  readonly formatter?: TextFormatter;
}

/**
 * Create a high-performance stream-based file sink that writes log records to a file.
 *
 * This sink writes formatted records directly to a Node.js `WriteStream`. It
 * leverages Node.js stream buffering for efficient asynchronous writes without
 * blocking the main thread.
 *
 * ## Performance Characteristics
 *
 * - **High Performance**: Optimized for high-volume logging scenarios
 * - **Non-blocking**: Uses asynchronous I/O that doesn't block the main thread
 * - **Memory Efficient**: Uses the file stream buffer directly
 * - **Stream-based**: Leverages Node.js native stream optimizations
 *
 * ## When to Use
 *
 * Use this sink when you need:
 * - High-performance file logging for production applications
 * - Non-blocking I/O behavior for real-time applications
 * - Stream-buffered writes for high-volume scenarios
 * - Simple file output without complex buffering configuration
 *
 * For more control over buffering behavior, consider using {@link getFileSink}
 * instead, which provides options for buffer size, flush intervals, and
 * non-blocking modes.
 *
 * ## Example
 *
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getStreamFileSink } from "@logtape/file";
 *
 * await configure({
 *   sinks: {
 *     file: getStreamFileSink("app.log", {
 *       highWaterMark: 32768  // 32KB buffer for high-volume logging
 *     })
 *   },
 *   loggers: [
 *     { category: ["myapp"], sinks: ["file"] }
 *   ]
 * });
 * ```
 *
 * @param path The path to the file to write logs to. The file will be created
 *             if it doesn't exist, or appended to if it does exist.
 * @param options Configuration options for the stream-based sink.
 * @returns A sink that writes formatted log records to the specified file.
 *          The returned sink implements `AsyncDisposable` for proper resource cleanup
 *          that waits for all data to be flushed to disk.
 *
 * @since 1.0.0
 */
export function getStreamFileSink(
  path: string,
  options: StreamFileSinkOptions = {},
): Sink & AsyncDisposable {
  const highWaterMark = options.highWaterMark ?? 16384;
  const formatter = options.formatter ?? defaultTextFormatter;

  const writeStream = createWriteStream(path, {
    flags: "a",
    highWaterMark,
  });

  let disposed = false;
  let streamError: Error | undefined;
  const handleStreamError = (error: Error) => {
    streamError = error;
  };
  writeStream.on("error", handleStreamError);

  const sink: Sink & AsyncDisposable = (record: LogRecord) => {
    if (disposed) return;

    // The hot path writes straight to the file stream.  We intentionally avoid
    // awaiting backpressure here; async disposal below is the synchronization
    // point that waits for buffered records to reach the filesystem.
    writeStream.write(formatter(record));
  };

  sink[Symbol.asyncDispose] = async () => {
    if (disposed) return;
    disposed = true;

    try {
      if (streamError != null) throw streamError;

      if (writeStream.writableNeedDrain && !writeStream.writableEnded) {
        await once(writeStream, "drain");
      }
      if (streamError != null) throw streamError;

      if (writeStream.closed || writeStream.destroyed) return;

      const closePromise = once(writeStream, "close");
      writeStream.end();
      await closePromise;

      if (streamError != null) throw streamError;
    } finally {
      writeStream.off("error", handleStreamError);
    }
  };

  return sink;
}
