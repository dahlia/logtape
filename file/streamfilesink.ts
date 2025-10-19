import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
  type TextFormatter,
} from "@logtape/logtape";
import { createWriteStream } from "node:fs";
import { PassThrough } from "node:stream";

/**
 * Options for the {@link getStreamFileSink} function.
 *
 * This interface configures the high-performance stream-based file sink that
 * uses Node.js PassThrough streams for optimal I/O performance with automatic
 * backpressure management.
 *
 * @since 1.0.0
 */
export interface StreamFileSinkOptions {
  /**
   * High water mark for the PassThrough stream buffer in bytes.
   *
   * This controls the internal buffer size of the PassThrough stream.
   * Higher values can improve performance for high-volume logging but use
   * more memory. Lower values reduce memory usage but may impact performance.
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
 * This sink uses Node.js PassThrough streams piped to WriteStreams for optimal
 * I/O performance. It leverages the Node.js stream infrastructure to provide
 * automatic backpressure management, efficient buffering, and asynchronous writes
 * without blocking the main thread.
 *
 * ## Performance Characteristics
 *
 * - **High Performance**: Optimized for high-volume logging scenarios
 * - **Non-blocking**: Uses asynchronous I/O that doesn't block the main thread
 * - **Memory Efficient**: Automatic backpressure prevents memory buildup
 * - **Stream-based**: Leverages Node.js native stream optimizations
 *
 * ## When to Use
 *
 * Use this sink when you need:
 * - High-performance file logging for production applications
 * - Non-blocking I/O behavior for real-time applications
 * - Automatic backpressure handling for high-volume scenarios
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

  // Create PassThrough stream for optimal performance
  const passThrough = new PassThrough({
    highWaterMark,
    objectMode: false,
  });

  // Create WriteStream immediately (not lazy)
  const writeStream = createWriteStream(path, { flags: "a" });

  // Pipe PassThrough to WriteStream for automatic backpressure handling
  passThrough.pipe(writeStream);

  let disposed = false;

  // Stream-based sink function for high performance
  const sink: Sink & AsyncDisposable = (record: LogRecord) => {
    if (disposed) return;

    // Direct write to PassThrough stream
    passThrough.write(formatter(record));
  };

  // Async disposal that waits for streams to finish
  sink[Symbol.asyncDispose] = async () => {
    if (disposed) return;
    disposed = true;

    // End the PassThrough stream
    passThrough.end();

    // Wait for both finish (data flushed) and close (file handle closed) events
    await new Promise<void>((resolve) => {
      writeStream.once("finish", () => {
        writeStream.close(() => {
          resolve();
        });
      });
    });
  };

  return sink;
}
