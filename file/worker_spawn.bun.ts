export function spawnWorker(): Worker {
  return new Worker(new URL("./worker.bun.js", import.meta.url).href, {
    type: "module",
  });
}
