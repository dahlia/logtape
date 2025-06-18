export function spawnWorker(): Worker {
  return new Worker(new URL("./worker.deno.ts", import.meta.url).href, {
    type: "module",
  });
}
