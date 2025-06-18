import { createWriteStream, type FileWriteStream } from "#worker_factory";
import type { FileSinkOptions } from "./filesink.base.ts";

const { parentPort } = require("node:worker_threads");

interface LogMessage {
  type: "log";
  chunk: Uint8Array;
}

interface LogBatchMessage {
  type: "logBatch";
  chunks: Uint8Array[];
}

interface InitMessage {
  type: "init";
  options: FileSinkOptions & { path: string };
}

interface FlushMessage {
  type: "flush";
}

interface CloseMessage {
  type: "close";
}

type WorkerMessage =
  | InitMessage
  | LogMessage
  | LogBatchMessage
  | FlushMessage
  | CloseMessage;

let writer: FileWriteStream | undefined;
const writePromises: Promise<unknown>[] = [];

async function handleMessage(message: WorkerMessage) {
  switch (message.type) {
    case "init":
      try {
        writer = await createWriteStream(message.options.path, message.options);
        parentPort!.postMessage({ type: "inited" });
      } catch (err) {
        parentPort!.postMessage({
          type: "error",
          error: (err as Error).message,
        });
      }
      break;
    case "log":
      if (writer) {
        const promise = Promise.resolve(writer.write(message.chunk)).catch(
          (err) => {
            parentPort!.postMessage({
              type: "error",
              error: (err as Error).message,
            });
          },
        );
        writePromises.push(promise);
        promise.finally(() => {
          const index = writePromises.indexOf(promise);
          if (index > -1) {
            writePromises.splice(index, 1);
          }
        });
      }
      break;
    case "logBatch":
      if (writer) {
        // Process batch more efficiently - create all promises first
        const batchPromises = message.chunks.map((chunk) =>
          Promise.resolve(writer!.write(chunk)).catch((err) => {
            parentPort!.postMessage({
              type: "error",
              error: (err as Error).message,
            });
          })
        );

        writePromises.push(...batchPromises);

        // Clean up completed promises in batch
        Promise.allSettled(batchPromises).then(() => {
          batchPromises.forEach((promise) => {
            const index = writePromises.indexOf(promise);
            if (index > -1) {
              writePromises.splice(index, 1);
            }
          });
        });
      }
      break;
    case "flush":
      if (writer) {
        await Promise.allSettled(writePromises);
        await writer.flush();
      }
      parentPort!.postMessage({ type: "flushed" });
      break;
    case "close":
      if (writer) {
        await Promise.allSettled(writePromises);
        await writer.flush();
        await writer.close();
      }
      parentPort!.close();
      break;
  }
}

// Set up Node.js Worker Threads message listener
parentPort!.on("message", async (data: WorkerMessage) => {
  await handleMessage(data);
});
