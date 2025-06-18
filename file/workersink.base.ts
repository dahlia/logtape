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
   * @default 100
   */
  bufferSize?: number;

  /**
   * Maximum time in milliseconds to wait before flushing the buffer.
   * @default 100
   */
  flushInterval?: number;

  /**
   * Maximum buffer size before forcing a flush regardless of timing.
   * @default 1000
   */
  maxBufferSize?: number;
}

export function getWorkerFileSink(
  path: string,
  options: WorkerFileSinkOptions = {},
): Sink & AsyncDisposable {
  const {
    formatter = defaultTextFormatter,
    bufferSize = 100,
    flushInterval = 100,
    maxBufferSize = 1000,
    ...workerOptions
  } = options;

  const worker = spawnWorker();
  const encoder = new TextEncoder();
  let buffer: LogRecord[] = [];
  let flushTimer: number | undefined;
  let isInitialized = false;

  const initPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Worker initialization timeout"));
    }, 5000);

    const messageHandler = (e: MessageEvent) => {
      if (e.data.type === "inited") {
        clearTimeout(timeout);
        isInitialized = true;
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

    if (buffer.length === 0 || !isInitialized) return;

    // Swap buffer to allow new logs while flushing
    const toFlush = buffer;
    buffer = [];

    // Convert to chunks and send as batch
    const chunks = toFlush.map((record) => encoder.encode(formatter(record)));
    worker.postMessage({ type: "logBatch", chunks });
  };

  const scheduleFlush = () => {
    if (flushTimer) return;

    flushTimer = setTimeout(flushBuffer, flushInterval);
  };

  const sink = (record: LogRecord) => {
    // Add to buffer immediately (very fast)
    buffer.push(record);

    // Flush immediately if buffer is full
    if (buffer.length >= maxBufferSize) {
      flushBuffer();
    } else if (buffer.length >= bufferSize) {
      // Schedule flush for next tick
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
        const chunks = buffer.map((record) =>
          encoder.encode(formatter(record))
        );
        worker.postMessage({ type: "logBatch", chunks });
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
