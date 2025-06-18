import { spawnWorker } from "#worker_spawn";
import {
  defaultTextFormatter,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type { Worker as NodeWorker } from "node:worker_threads";
import type { FileSinkOptions } from "./filesink.base.ts";

export type WorkerFileSinkOptions = FileSinkOptions;

interface WorkerMessage {
  type: string;
  error?: string;
}

export async function getWorkerFileSink(
  path: string,
  options: WorkerFileSinkOptions = {},
): Promise<Sink & AsyncDisposable> {
  const {
    formatter = defaultTextFormatter,
    ...workerOptions
  } = options;
  const worker = spawnWorker() as unknown as NodeWorker; // Type assertion for Node.js Worker

  // Wait for worker initialization to complete
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Worker initialization timeout"));
    }, 5000);

    const messageHandler = (data: WorkerMessage) => {
      if (data.type === "inited") {
        clearTimeout(timeout);
        worker.off("message", messageHandler);
        resolve();
      } else if (data.type === "error") {
        clearTimeout(timeout);
        worker.off("message", messageHandler);
        reject(new Error(data.error));
      }
    };

    // Node.js Worker Threads API
    worker.on("message", messageHandler);
    worker.on("error", (e: Error) => {
      clearTimeout(timeout);
      worker.off("message", messageHandler);
      reject(e);
    });

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
      const tempHandler = (data: WorkerMessage) => {
        if (data.type === "flushed") {
          worker.off("message", tempHandler); // remove temp handler
          resolve();
        }
      };
      worker.on("message", tempHandler);
    });

    worker.postMessage({ type: "flush" });
    await flushPromise;
    worker.postMessage({ type: "close" });
  };

  return sink as Sink & AsyncDisposable;
}
