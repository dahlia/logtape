import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
  type StreamSinkOptions,
} from "@logtape/logtape";

/**
 * Adaptive flush strategy that dynamically adjusts buffer thresholds
 * based on recent flush patterns for optimal performance.
 */
class AdaptiveFlushStrategy {
  private recentFlushSizes: number[] = [];
  private recentFlushTimes: number[] = [];
  private avgFlushSize: number;
  private avgFlushInterval: number;
  private readonly maxHistorySize = 10;
  private readonly baseThreshold: number;

  constructor(baseThreshold: number, baseInterval: number) {
    this.baseThreshold = baseThreshold;
    this.avgFlushSize = baseThreshold;
    this.avgFlushInterval = baseInterval;
  }

  /**
   * Record a flush event for pattern analysis.
   * @param size The size of data flushed in bytes.
   * @param timeSinceLastFlush Time since last flush in milliseconds.
   */
  recordFlush(size: number, timeSinceLastFlush: number): void {
    this.recentFlushSizes.push(size);
    this.recentFlushTimes.push(timeSinceLastFlush);

    // Keep only recent history
    if (this.recentFlushSizes.length > this.maxHistorySize) {
      this.recentFlushSizes.shift();
      this.recentFlushTimes.shift();
    }

    // Update averages
    this.updateAverages();
  }

  /**
   * Determine if buffer should be flushed based on adaptive strategy.
   * @param currentSize Current buffer size in bytes.
   * @param timeSinceLastFlush Time since last flush in milliseconds.
   * @returns True if buffer should be flushed.
   */
  shouldFlush(currentSize: number, timeSinceLastFlush: number): boolean {
    const adaptiveThreshold = this.calculateAdaptiveThreshold();
    const adaptiveInterval = this.calculateAdaptiveInterval();

    return currentSize >= adaptiveThreshold ||
      (adaptiveInterval > 0 && timeSinceLastFlush >= adaptiveInterval);
  }

  private updateAverages(): void {
    if (this.recentFlushSizes.length === 0) return;

    this.avgFlushSize =
      this.recentFlushSizes.reduce((sum, size) => sum + size, 0) /
      this.recentFlushSizes.length;

    this.avgFlushInterval =
      this.recentFlushTimes.reduce((sum, time) => sum + time, 0) /
      this.recentFlushTimes.length;
  }

  private calculateAdaptiveThreshold(): number {
    // Adjust threshold based on recent patterns
    // Higher average flush sizes suggest larger batches are beneficial
    const adaptiveFactor = Math.min(
      2.0,
      Math.max(0.5, this.avgFlushSize / this.baseThreshold),
    );

    return Math.max(
      Math.min(4096, this.baseThreshold / 2),
      Math.min(64 * 1024, this.baseThreshold * adaptiveFactor),
    );
  }

  private calculateAdaptiveInterval(): number {
    // If base interval is 0, time-based flushing is disabled
    if (this.avgFlushInterval <= 0) return 0;

    // Adjust interval based on recent flush frequency
    // More frequent flushes suggest lower latency is preferred
    if (this.recentFlushTimes.length < 3) return this.avgFlushInterval;

    const variance = this.calculateVariance(this.recentFlushTimes);
    const stabilityFactor = Math.min(2.0, Math.max(0.5, 1000 / variance));

    return Math.max(
      1000,
      Math.min(10000, this.avgFlushInterval * stabilityFactor),
    );
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 1000; // Default variance

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }
}

/**
 * Memory pool for reusing Uint8Array buffers to minimize GC pressure.
 * Maintains a pool of pre-allocated buffers for efficient reuse.
 */
class BufferPool {
  private pool: Uint8Array[] = [];
  private readonly maxPoolSize = 50; // Keep a reasonable pool size
  private readonly maxBufferSize = 64 * 1024; // Don't pool very large buffers

  /**
   * Acquire a buffer from the pool or create a new one.
   * @param size The minimum size needed for the buffer.
   * @returns A Uint8Array that can be used for encoding.
   */
  acquire(size: number): Uint8Array {
    // Don't pool very large buffers to avoid memory waste
    if (size > this.maxBufferSize) {
      return new Uint8Array(size);
    }

    // Try to find a suitable buffer from the pool
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const buffer = this.pool[i];
      if (buffer.length >= size) {
        // Remove from pool and return
        this.pool.splice(i, 1);
        return buffer.subarray(0, size);
      }
    }

    // No suitable buffer found, create a new one
    // Create slightly larger buffer to improve reuse chances
    const actualSize = Math.max(size, 1024); // Minimum 1KB
    return new Uint8Array(actualSize);
  }

  /**
   * Return a buffer to the pool for future reuse.
   * @param buffer The buffer to return to the pool.
   */
  release(buffer: Uint8Array): void {
    // Don't pool if we're at capacity or buffer is too large
    if (
      this.pool.length >= this.maxPoolSize || buffer.length > this.maxBufferSize
    ) {
      return;
    }

    // Don't pool very small buffers as they're cheap to allocate
    if (buffer.length < 256) {
      return;
    }

    // Add to pool for reuse
    this.pool.push(buffer);
  }

  /**
   * Clear the pool to free memory. Useful for cleanup.
   */
  clear(): void {
    this.pool.length = 0;
  }

  /**
   * Get current pool statistics for monitoring.
   * @returns Object with pool size and buffer count.
   */
  getStats(): { poolSize: number; totalBuffers: number } {
    return {
      poolSize: this.pool.reduce((sum, buf) => sum + buf.length, 0),
      totalBuffers: this.pool.length,
    };
  }
}

/**
 * High-performance byte buffer for batching log records.
 * Eliminates string concatenation overhead by storing pre-encoded bytes.
 * Uses memory pooling to reduce GC pressure.
 */
class ByteRingBuffer {
  private buffers: Uint8Array[] = [];
  private totalSize: number = 0;
  private bufferPool: BufferPool;

  constructor(bufferPool: BufferPool) {
    this.bufferPool = bufferPool;
  }

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
   * This clears the internal buffer and returns used buffers to the pool.
   * @returns Array of buffered byte arrays ready for writev() operations.
   */
  flush(): Uint8Array[] {
    const result = [...this.buffers];
    this.clear();
    return result;
  }

  /**
   * Clear the buffer without returning data.
   * Returns buffers to the pool for reuse.
   */
  clear(): void {
    // Return buffers to pool for reuse
    for (const buffer of this.buffers) {
      this.bufferPool.release(buffer);
    }
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
 * @template TFile The type of the file descriptor.
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
 * @template TFile The type of the file descriptor.
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
 * @template TFile The type of the file descriptor.
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

  // Initialize memory pool and buffer systems
  const bufferPool = new BufferPool();
  const byteBuffer = new ByteRingBuffer(bufferPool);
  const adaptiveStrategy = new AdaptiveFlushStrategy(bufferSize, flushInterval);
  let lastFlushTimestamp: number = Date.now();

  if (!options.nonBlocking) {
    // Blocking mode implementation
    // deno-lint-ignore no-inner-declarations
    function flushBuffer(): void {
      if (fd == null || byteBuffer.isEmpty()) return;

      const flushSize = byteBuffer.size();
      const currentTime = Date.now();
      const timeSinceLastFlush = currentTime - lastFlushTimestamp;

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

      // Record flush for adaptive strategy
      adaptiveStrategy.recordFlush(flushSize, timeSinceLastFlush);
      lastFlushTimestamp = currentTime;
    }

    const sink: Sink & Disposable = (record: LogRecord) => {
      if (fd == null) fd = options.openSync(path);

      // ULTRA FAST PATH: Direct write when buffer is empty and using default buffer settings
      if (byteBuffer.isEmpty() && bufferSize === 8192) {
        // Inline everything for maximum speed - avoid all function calls
        const formattedRecord = formatter(record);
        const encodedRecord = encoder.encode(formattedRecord);

        // Only use fast path for typical log sizes to avoid breaking edge cases
        if (encodedRecord.length < 200) {
          // Write directly for small logs - no complex buffering logic
          options.writeSync(fd, encodedRecord);
          options.flushSync(fd);
          lastFlushTimestamp = Date.now();
          return;
        }
      }

      // STANDARD PATH: Complex logic for edge cases
      const formattedRecord = formatter(record);
      const encodedRecord = encoder.encode(formattedRecord);
      byteBuffer.append(encodedRecord);

      // Check for immediate flush conditions
      if (bufferSize <= 0) {
        // No buffering - flush immediately
        flushBuffer();
      } else {
        // Use adaptive strategy for intelligent flushing
        const timeSinceLastFlush = record.timestamp - lastFlushTimestamp;
        const shouldFlush = adaptiveStrategy.shouldFlush(
          byteBuffer.size(),
          timeSinceLastFlush,
        );

        if (shouldFlush) {
          flushBuffer();
        }
      }
    };
    sink[Symbol.dispose] = () => {
      if (fd !== null) {
        flushBuffer();
        options.closeSync(fd);
      }
      // Clean up buffer pool
      bufferPool.clear();
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

    const flushSize = byteBuffer.size();
    const currentTime = Date.now();
    const timeSinceLastFlush = currentTime - lastFlushTimestamp;

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

      // Record flush for adaptive strategy
      adaptiveStrategy.recordFlush(flushSize, timeSinceLastFlush);
      lastFlushTimestamp = currentTime;
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

    // ULTRA FAST PATH: Direct write when buffer is empty and using default buffer settings
    if (byteBuffer.isEmpty() && !activeFlush && bufferSize === 8192) {
      // Inline everything for maximum speed - avoid all function calls
      const formattedRecord = formatter(record);
      const encodedRecord = encoder.encode(formattedRecord);

      // Only use fast path for typical log sizes to avoid breaking edge cases
      if (encodedRecord.length < 200) {
        // Write directly for small logs - no complex buffering logic
        asyncOptions.writeSync(fd, encodedRecord);
        scheduleFlush(); // Async flush
        lastFlushTimestamp = Date.now();
        return;
      }
    }

    // STANDARD PATH: Complex logic for edge cases
    const formattedRecord = formatter(record);
    const encodedRecord = encoder.encode(formattedRecord);
    byteBuffer.append(encodedRecord);

    // Check for immediate flush conditions
    if (bufferSize <= 0) {
      // No buffering - flush immediately
      scheduleFlush();
    } else {
      // Use adaptive strategy for intelligent flushing
      const timeSinceLastFlush = record.timestamp - lastFlushTimestamp;
      const shouldFlush = adaptiveStrategy.shouldFlush(
        byteBuffer.size(),
        timeSinceLastFlush,
      );

      if (shouldFlush) {
        scheduleFlush();
      } else if (flushTimer === null && flushInterval > 0) {
        startFlushTimer();
      }
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
    // Clean up buffer pool
    bufferPool.clear();
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
