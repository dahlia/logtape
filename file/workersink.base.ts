import { spawnWorker } from "#worker_spawn";
import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type { FileSinkOptions } from "./filesink.base.ts";

export interface WorkerFileSinkOptions extends FileSinkOptions {
  /**
   * Buffer size for batching log records before sending to worker.
   * @default 1000
   */
  bufferSize?: number;

  /**
   * Maximum time in milliseconds to wait before flushing the buffer.
   * @default 10
   */
  flushInterval?: number;

  /**
   * Maximum buffer size before forcing a flush regardless of timing.
   * @default 5000
   */
  maxBufferSize?: number;
}

export function getWorkerFileSink(
  path: string,
  options: WorkerFileSinkOptions = {},
): Sink & AsyncDisposable {
  const {
    formatter = defaultTextFormatter,
    bufferSize = 1000,
    flushInterval = 10,
    maxBufferSize = 5000,
    ...workerOptions
  } = options;

  const worker = spawnWorker();
  const encoder = new TextEncoder();
  let buffer: Uint8Array[] = []; // Pre-encoded chunks for better performance
  let flushTimer: number | undefined;
  let isInitialized = false;
  let pendingFlushes: Uint8Array[][] = []; // Store flushes during initialization

  const initPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Worker initialization timeout"));
    }, 5000);

    const messageHandler = (e: MessageEvent) => {
      if (e.data.type === "inited") {
        clearTimeout(timeout);
        isInitialized = true;

        // Send any pending flushes
        pendingFlushes.forEach((chunks) => {
          worker.postMessage({ type: "logBatch", chunks });
        });
        pendingFlushes = [];

        resolve();
      } else if (e.data.type === "error") {
        clearTimeout(timeout);
        reject(new Error(e.data.error));
      }
    };

    worker.onmessage = messageHandler;
    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timeout);
      reject(e);
    };
  });

  worker.postMessage({
    type: "init",
    options: { ...workerOptions, path },
  });

  const flushBuffer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }

    if (buffer.length === 0) return;

    // Swap buffer to allow new logs while flushing
    const toFlush = buffer;
    buffer = [];

    // Send immediately if initialized, otherwise queue it
    if (isInitialized) {
      worker.postMessage({ type: "logBatch", chunks: toFlush });
    } else {
      pendingFlushes.push(toFlush);
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;

    flushTimer = setTimeout(flushBuffer, flushInterval);
  };

  const sink = (record: LogRecord) => {
    // Pre-encode immediately to avoid repeated encoding
    const chunk = encoder.encode(formatter(record));
    buffer.push(chunk);

    // Always buffer, even during initialization for maximum performance
    // Flush immediately if buffer is full
    if (buffer.length >= maxBufferSize) {
      flushBuffer();
    } else if (
      buffer.length >= bufferSize && buffer.length % bufferSize === 0
    ) {
      // Only schedule flush at exact buffer size intervals to reduce timer overhead
      scheduleFlush();
    }
  };

  (sink as Sink & AsyncDisposable)[Symbol.asyncDispose] = async () => {
    try {
      await initPromise;

      // Clear any pending flush timer
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }

      // Flush any remaining buffer
      if (buffer.length > 0) {
        worker.postMessage({ type: "logBatch", chunks: buffer });
        buffer = [];
      }

      // Use a separate promise for flush confirmation
      const flushPromise = new Promise<void>((resolve) => {
        const originalHandler = worker.onmessage;
        worker.onmessage = (e: MessageEvent) => {
          if (e.data.type === "flushed") {
            worker.onmessage = originalHandler; // restore original handler
            resolve();
          } else if (originalHandler) {
            originalHandler.call(worker, e); // forward other messages with proper context
          }
        };
      });

      worker.postMessage({ type: "flush" });
      await flushPromise;
      worker.postMessage({ type: "close" });
    } catch {
      // Worker failed to initialize, do nothing.
    }
  };

  return sink as Sink & AsyncDisposable;
}
