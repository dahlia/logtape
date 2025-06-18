import { spawnWorker } from "#worker_spawn";
import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type { FileSinkOptions } from "./filesink.base.ts";

export type WorkerFileSinkOptions = FileSinkOptions;

export async function getWorkerFileSink(
  path: string,
  options: WorkerFileSinkOptions = {},
): Promise<Sink & AsyncDisposable> {
  const {
    formatter = defaultTextFormatter,
    ...workerOptions
  } = options;
  const worker = spawnWorker();

  // Wait for worker initialization to complete
  await new Promise<void>((resolve, reject) => {
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

    worker.postMessage({
      type: "init",
      options: { ...workerOptions, path },
    });
  });

  const sink = (record: LogRecord) => {
    const chunk = new TextEncoder().encode(formatter(record));
    // Worker is already initialized at this point
    worker.postMessage({ type: "log", chunk });
  };

  (sink as Sink & AsyncDisposable)[Symbol.asyncDispose] = async () => {
    // Use a separate promise for flush confirmation
    const flushPromise = new Promise<void>((resolve) => {
      const messageHandler = (e: MessageEvent) => {
        if (e.data.type === "flushed") {
          resolve();
        }
      };
      worker.onmessage = messageHandler;
    });

    worker.postMessage({ type: "flush" });
    await flushPromise;
    worker.postMessage({ type: "close" });
  };

  return sink as Sink & AsyncDisposable;
}
