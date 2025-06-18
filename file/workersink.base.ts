import { spawnWorker } from "#worker_spawn";
import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type { FileSinkOptions } from "./filesink.base.ts";

export type WorkerFileSinkOptions = FileSinkOptions;

export function getWorkerFileSink(
  path: string,
  options: WorkerFileSinkOptions = {},
): Sink & AsyncDisposable {
  const {
    formatter = defaultTextFormatter,
    ...workerOptions
  } = options;
  const worker = spawnWorker();
  const initPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Worker initialization timeout"));
    }, 5000);

    const messageHandler = (e: MessageEvent) => {
      if (e.data.type === "inited") {
        clearTimeout(timeout);
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

  const sink = (record: LogRecord) => {
    const chunk = new TextEncoder().encode(formatter(record));
    initPromise.then(() => {
      worker.postMessage({ type: "log", chunk });
    }).catch(() => {
      // Worker failed to initialize, do nothing.
    });
  };

  (sink as Sink & AsyncDisposable)[Symbol.asyncDispose] = async () => {
    try {
      await initPromise;

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
