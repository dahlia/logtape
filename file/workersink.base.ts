import { spawnWorker } from "#worker_spawn";
import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type { FileSinkOptions } from "./filesink.base.ts";

export interface WorkerFileSinkOptions extends FileSinkOptions {
  /**
   * Buffer size in bytes for batching log messages before sending to worker.
   * @default 65536
   */
  bufferSize?: number;

  /**
   * Maximum time in milliseconds to wait before flushing the buffer.
   * @default 100
   */
  flushInterval?: number;

  /**
   * Maximum buffer size in bytes before forcing a flush regardless of timing.
   * @default 262144
   */
  maxBufferSize?: number;
}

export function getWorkerFileSink(
  path: string,
  options: WorkerFileSinkOptions = {},
): Sink & AsyncDisposable {
  const {
    formatter = defaultTextFormatter,
    bufferSize = 8192, // 8KB for more frequent flushing
    flushInterval = 50, // 50ms for faster response
    maxBufferSize = 32768, // 32KB max buffer
    ...workerOptions
  } = options;

  const worker = spawnWorker();
  let buffer: string[] = []; // Store formatted strings to send to worker
  let bufferLength = 0; // Track total length of strings in buffer
  let flushTimer: number | undefined;
  let isInitialized = false;
  let pendingFlushes: string[][] = []; // Store flushes during initialization

  const initPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Worker initialization timeout"));
    }, 5000);

    const messageHandler = (e: MessageEvent) => {
      if (e.data.type === "inited") {
        clearTimeout(timeout);
        isInitialized = true;

        // Send any pending flushes
        pendingFlushes.forEach((messages) => {
          worker.postMessage({ type: "logBatch", messages });
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
    bufferLength = 0;

    // Send immediately if initialized, otherwise queue it
    if (isInitialized) {
      worker.postMessage({ type: "logBatch", messages: toFlush });
    } else {
      pendingFlushes.push(toFlush);
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;

    flushTimer = setTimeout(flushBuffer, flushInterval);
  };

  const sink = (record: LogRecord) => {
    // Format to string in main thread, let worker handle encoding
    const formatted = formatter(record);
    buffer.push(formatted);
    bufferLength += formatted.length;

    // Always buffer, even during initialization for maximum performance
    // Flush immediately if buffer size exceeds maximum
    if (bufferLength >= maxBufferSize) {
      flushBuffer();
    } else if (bufferLength >= bufferSize && !flushTimer) {
      // Schedule flush only if no timer is already set
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
        worker.postMessage({ type: "logBatch", messages: buffer });
        buffer = [];
        bufferLength = 0;
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
