import path from "node:path";
import { Worker } from "node:worker_threads";

export function spawnWorker(): Worker {
  // TODO: This is not ideal, but it works for now.
  // We should probably find a better way to resolve the worker script path.
  const dirname = path.dirname(new URL(import.meta.url).pathname);
  const workerPath = path.resolve(dirname, "worker.node.js");
  return new Worker(workerPath, {});
}
