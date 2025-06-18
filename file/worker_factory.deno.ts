import type { FileSinkOptions } from "./filesink.base.ts";

export interface FileWriteStream {
  write(chunk: Uint8Array): Promise<void> | void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export async function createWriteStream(
  path: string,
  _options: FileSinkOptions,
): Promise<FileWriteStream> {
  const file = await Deno.open(path, {
    write: true,
    create: true,
    append: true,
  });
  const streamWriter = file.writable.getWriter();
  return {
    write(chunk) {
      return streamWriter.write(chunk);
    },
    async flush() {
      await file.sync();
    },
    async close() {
      await streamWriter.close();
      try {
        file.close();
      } catch {
        // File might already be closed, ignore the error
      }
    },
  };
}
