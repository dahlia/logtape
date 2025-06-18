/// <reference types="@types/bun" />
import type { FileSinkOptions } from "./filesink.base.ts";
import type { FileWriteStream } from "./worker_factory.deno.ts";

export function createWriteStream(
  path: string,
  _options: FileSinkOptions,
): Promise<FileWriteStream> {
  const file = Bun.file(path);
  const writer = file.writer();
  return Promise.resolve({
    write(chunk) {
      writer.write(chunk);
    },
    async flush() {
      await writer.flush();
    },
    close() {
      writer.end();
      return Promise.resolve();
    },
  });
}
