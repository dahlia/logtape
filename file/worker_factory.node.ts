import fs from "node:fs";
import type { FileSinkOptions } from "./filesink.base.ts";
import type { FileWriteStream } from "./worker_factory.deno.ts";

export function createWriteStream(
  path: string,
  _options: FileSinkOptions,
): FileWriteStream {
  const stream = fs.createWriteStream(path, {
    flags: "a",
  });
  const ready = new Promise<number>((resolve) =>
    stream.once("open", (fd) => resolve(fd))
  );
  return {
    write(chunk: Uint8Array) {
      return new Promise<void>((resolve, reject) => {
        stream.write(chunk, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },
    async flush() {
      const fd = await ready;
      return new Promise<void>((resolve, reject) => {
        fs.fsync(fd, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },
    close() {
      return new Promise<void>((resolve) => {
        stream.end(resolve);
      });
    },
  };
}
