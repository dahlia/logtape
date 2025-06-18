import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
  type StreamSinkOptions,
} from "@logtape/logtape";

/**
 * High-performance byte buffer for batching log records.
 * Eliminates string concatenation overhead by storing pre-encoded bytes.
 */
class ByteRingBuffer {
  private buffers: Uint8Array[] = [];
  private totalSize: number = 0;

  /**
   * Append pre-encoded log record bytes to the buffer.
   * @param data The encoded log record as bytes.
   */
  append(data: Uint8Array): void {
    this.buffers.push(data);
    this.totalSize += data.length;
  }

  /**
   * Get the current total size of buffered data in bytes.
   * @returns The total size in bytes.
   */
  size(): number {
    return this.totalSize;
  }

  /**
   * Get the number of buffered records.
   * @returns The number of records in the buffer.
   */
  count(): number {
    return this.buffers.length;
  }

  /**
   * Flush all buffered data and return it as an array of byte arrays.
   * This clears the internal buffer.
   * @returns Array of buffered byte arrays ready for writev() operations.
   */
  flush(): Uint8Array[] {
    const result = [...this.buffers];
    this.clear();
    return result;
  }

  /**
   * Clear the buffer without returning data.
   */
  clear(): void {
    this.buffers.length = 0;
    this.totalSize = 0;
  }

  /**
   * Check if the buffer is empty.
   * @returns True if the buffer contains no data.
   */
  isEmpty(): boolean {
    return this.buffers.length === 0;
  }
}

/**
 * Options for the {@link getBaseFileSink} function.
 */
export type FileSinkOptions = StreamSinkOptions & {
  /**
   * If `true`, the file is not opened until the first write.  Defaults to `false`.
   */
  lazy?: boolean;

  /**
   * The size of the buffer to use when writing to the file.  If not specified,
   * a default buffer size will be used.  If it is less or equal to 0,
   * the file will be written directly without buffering.
   * @default 8192
   * @since 0.12.0
   */
  bufferSize?: number;

  /**
   * The maximum time interval in milliseconds between flushes.  If this time
   * passes since the last flush, the buffer will be flushed regardless of size.
   * This helps prevent log loss during unexpected process termination.
   * @default 5000
   * @since 0.12.0
   */
  flushInterval?: number;

  /**
   * Enable non-blocking mode with background flushing.
   * When enabled, flush operations are performed asynchronously to prevent
   * blocking the main thread during file I/O operations.
   *
   * @default `false`
   * @since 1.0.0
   */
  nonBlocking?: boolean;
};

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
   * Write multiple chunks of data to the file in a single operation.
   * This is optional - if not implemented, falls back to multiple writeSync calls.
   * @param fd The file descriptor.
   * @param chunks Array of data chunks to write.
   */
  writeManySync?(fd: TFile, chunks: Uint8Array[]): void;

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
 * A platform-specific async file sink driver.
 * @typeParam TFile The type of the file descriptor.
 * @since 1.0.0
 */
export interface AsyncFileSinkDriver<TFile> extends FileSinkDriver<TFile> {
  /**
   * Asynchronously write multiple chunks of data to the file in a single operation.
   * This is optional - if not implemented, falls back to multiple writeSync calls.
   * @param fd The file descriptor.
   * @param chunks Array of data chunks to write.
   */
  writeMany?(fd: TFile, chunks: Uint8Array[]): Promise<void>;

  /**
   * Asynchronously flush the file to ensure that all data is written to the disk.
   * @param fd The file descriptor.
   */
  flush(fd: TFile): Promise<void>;

  /**
   * Asynchronously close the file.
   * @param fd The file descriptor.
   */
  close(fd: TFile): Promise<void>;
}

/**
 * Get a platform-independent file sink.
 *
 * @typeParam TFile The type of the file descriptor.
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed. If `nonBlocking` is enabled,
 *          returns a sink that also implements {@link AsyncDisposable}.
 */
export function getBaseFileSink<TFile>(
  path: string,
  options: FileSinkOptions & FileSinkDriver<TFile>,
): Sink & Disposable;
export function getBaseFileSink<TFile>(
  path: string,
  options: FileSinkOptions & AsyncFileSinkDriver<TFile>,
): Sink & AsyncDisposable;
export function getBaseFileSink<TFile>(
  path: string,
  options:
    & FileSinkOptions
    & (FileSinkDriver<TFile> | AsyncFileSinkDriver<TFile>),
): Sink & (Disposable | AsyncDisposable) {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const bufferSize = options.bufferSize ?? 1024 * 8; // Default buffer size of 8192 bytes
  const flushInterval = options.flushInterval ?? 5000; // Default flush interval of 5 seconds
  let fd = options.lazy ? null : options.openSync(path);
  const byteBuffer = new ByteRingBuffer();
  let lastFlushTimestamp: number = Date.now();

  if (!options.nonBlocking) {
    // Blocking mode implementation
    // deno-lint-ignore no-inner-declarations
    function flushBuffer(): void {
      if (fd == null || byteBuffer.isEmpty()) return;

      const chunks = byteBuffer.flush();
      if (options.writeManySync && chunks.length > 1) {
        // Use batch write if available
        options.writeManySync(fd, chunks);
      } else {
        // Fallback to individual writes
        for (const chunk of chunks) {
          options.writeSync(fd, chunk);
        }
      }
      options.flushSync(fd);
      lastFlushTimestamp = Date.now();
    }

    const sink: Sink & Disposable = (record: LogRecord) => {
      if (fd == null) fd = options.openSync(path);

      // Immediately encode and buffer the log record
      const formattedRecord = formatter(record);
      const encodedRecord = encoder.encode(formattedRecord);
      byteBuffer.append(encodedRecord);

      const shouldFlushBySize = byteBuffer.size() >= bufferSize;
      const shouldFlushByTime = flushInterval > 0 &&
        (record.timestamp - lastFlushTimestamp) >= flushInterval;

      if (shouldFlushBySize || shouldFlushByTime) {
        flushBuffer();
      }
    };
    sink[Symbol.dispose] = () => {
      if (fd !== null) {
        flushBuffer();
        options.closeSync(fd);
      }
    };
    return sink;
  }

  // Non-blocking mode implementation
  const asyncOptions = options as AsyncFileSinkDriver<TFile>;
  let disposed = false;
  let activeFlush: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function flushBuffer(): Promise<void> {
    if (fd == null || byteBuffer.isEmpty()) return;

    const chunks = byteBuffer.flush();
    try {
      if (asyncOptions.writeMany && chunks.length > 1) {
        // Use async batch write if available
        await asyncOptions.writeMany(fd, chunks);
      } else {
        // Fallback to individual writes
        for (const chunk of chunks) {
          asyncOptions.writeSync(fd, chunk);
        }
      }
      await asyncOptions.flush(fd);
      lastFlushTimestamp = Date.now();
    } catch {
      // Silently ignore errors in non-blocking mode
    }
  }

  function scheduleFlush(): void {
    if (activeFlush || disposed) return;

    activeFlush = flushBuffer().finally(() => {
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
    if (fd == null) fd = asyncOptions.openSync(path);

    // Immediately encode and buffer the log record
    const formattedRecord = formatter(record);
    const encodedRecord = encoder.encode(formattedRecord);
    byteBuffer.append(encodedRecord);

    const shouldFlushBySize = byteBuffer.size() >= bufferSize;
    const shouldFlushByTime = flushInterval > 0 &&
      (record.timestamp - lastFlushTimestamp) >= flushInterval;

    if (shouldFlushBySize || shouldFlushByTime) {
      scheduleFlush();
    } else if (flushTimer === null && flushInterval > 0) {
      startFlushTimer();
    }
  };

  nonBlockingSink[Symbol.asyncDispose] = async () => {
    disposed = true;
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    await flushBuffer();
    if (fd !== null) {
      try {
        await asyncOptions.close(fd);
      } catch {
        // Writer might already be closed or errored
      }
    }
  };

  return nonBlockingSink;
}

/**
 * Options for the {@link getBaseRotatingFileSink} function.
 */
export interface RotatingFileSinkOptions extends Omit<FileSinkOptions, "lazy"> {
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
 * A platform-specific async rotating file sink driver.
 * @since 1.0.0
 */
export interface AsyncRotatingFileSinkDriver<TFile>
  extends AsyncFileSinkDriver<TFile> {
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
 *          object that closes the file when disposed. If `nonBlocking` is enabled,
 *          returns a sink that also implements {@link AsyncDisposable}.
 */
export function getBaseRotatingFileSink<TFile>(
  path: string,
  options: RotatingFileSinkOptions & RotatingFileSinkDriver<TFile>,
): Sink & Disposable;
export function getBaseRotatingFileSink<TFile>(
  path: string,
  options: RotatingFileSinkOptions & AsyncRotatingFileSinkDriver<TFile>,
): Sink & AsyncDisposable;
export function getBaseRotatingFileSink<TFile>(
  path: string,
  options:
    & RotatingFileSinkOptions
    & (RotatingFileSinkDriver<TFile> | AsyncRotatingFileSinkDriver<TFile>),
): Sink & (Disposable | AsyncDisposable) {
  const formatter = options.formatter ?? defaultTextFormatter;
  const encoder = options.encoder ?? new TextEncoder();
  const maxSize = options.maxSize ?? 1024 * 1024;
  const maxFiles = options.maxFiles ?? 5;
  const bufferSize = options.bufferSize ?? 1024 * 8; // Default buffer size of 8192 chars
  const flushInterval = options.flushInterval ?? 5000; // Default flush interval of 5 seconds
  let offset: number = 0;
  try {
    const stat = options.statSync(path);
    offset = stat.size;
  } catch {
    // Continue as the offset is already 0.
  }
  let fd = options.openSync(path);
  let lastFlushTimestamp: number = Date.now();
  let buffer: string = "";

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

  if (!options.nonBlocking) {
    // Blocking mode implementation
    // deno-lint-ignore no-inner-declarations
    function flushBuffer(): void {
      if (buffer.length > 0) {
        const bytes = encoder.encode(buffer);
        buffer = "";
        if (shouldRollover(bytes)) performRollover();
        options.writeSync(fd, bytes);
        options.flushSync(fd);
        offset += bytes.length;
        lastFlushTimestamp = Date.now();
      }
    }

    const sink: Sink & Disposable = (record: LogRecord) => {
      buffer += formatter(record);

      const shouldFlushBySize = buffer.length >= bufferSize;
      const shouldFlushByTime = flushInterval > 0 &&
        (record.timestamp - lastFlushTimestamp) >= flushInterval;

      if (shouldFlushBySize || shouldFlushByTime) {
        flushBuffer();
      }
    };
    sink[Symbol.dispose] = () => {
      flushBuffer();
      options.closeSync(fd);
    };
    return sink;
  }

  // Non-blocking mode implementation
  const asyncOptions = options as AsyncRotatingFileSinkDriver<TFile>;
  let disposed = false;
  let activeFlush: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;

    const data = buffer;
    buffer = "";
    try {
      const bytes = encoder.encode(data);
      if (shouldRollover(bytes)) performRollover();
      asyncOptions.writeSync(fd, bytes);
      await asyncOptions.flush(fd);
      offset += bytes.length;
      lastFlushTimestamp = Date.now();
    } catch {
      // Silently ignore errors in non-blocking mode
    }
  }

  function scheduleFlush(): void {
    if (activeFlush || disposed) return;

    activeFlush = flushBuffer().finally(() => {
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
    buffer += formatter(record);

    const shouldFlushBySize = buffer.length >= bufferSize;
    const shouldFlushByTime = flushInterval > 0 &&
      (record.timestamp - lastFlushTimestamp) >= flushInterval;

    if (shouldFlushBySize || shouldFlushByTime) {
      scheduleFlush();
    } else if (flushTimer === null && flushInterval > 0) {
      startFlushTimer();
    }
  };

  nonBlockingSink[Symbol.asyncDispose] = async () => {
    disposed = true;
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    await flushBuffer();
    try {
      await asyncOptions.close(fd);
    } catch {
      // Writer might already be closed or errored
    }
  };

  return nonBlockingSink;
}
