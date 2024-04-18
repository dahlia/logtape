import { webDriver } from "./filesink.web.ts";
import {
  type FileSinkDriver,
  type FileSinkOptions,
  getFileSink as getBaseFileSink,
  type Sink,
} from "./sink.ts";

/**
 * A Deno-specific file sink driver.
 */
export const denoDriver: FileSinkDriver<Deno.FsFile> = {
  openSync(path: string) {
    return Deno.openSync(path, { create: true, append: true });
  },
  writeSync(fd, chunk) {
    fd.writeSync(chunk);
  },
  flushSync(fd) {
    fd.syncSync();
  },
  closeSync(fd) {
    fd.close();
  },
};

/**
 * Get a file sink.
 *
 * Note that this function is unavailable in the browser.
 *
 * @param path A path to the file to write to.
 * @param options The options for the sink.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.
 */
export function getFileSink(
  path: string,
  options: FileSinkOptions = {},
): Sink & Disposable {
  if ("document" in globalThis) {
    return getBaseFileSink(path, { ...options, ...webDriver });
  }
  return getBaseFileSink(path, { ...options, ...denoDriver });
}

// cSpell: ignore filesink
