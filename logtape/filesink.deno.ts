import { webDriver } from "./filesink.web.ts";
import {
  type FileSinkOptions,
  getFileSink as getBaseFileSink,
  getRotatingFileSink as getBaseRotatingFileSink,
  type RotatingFileSinkDriver,
  type RotatingFileSinkOptions,
  type Sink,
} from "./sink.ts";

/**
 * A Deno-specific file sink driver.
 */
export const denoDriver: RotatingFileSinkDriver<Deno.FsFile> = {
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
  statSync: Deno.statSync,
  renameSync: Deno.renameSync,
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

/**
 * Get a rotating file sink.
 *
 * This sink writes log records to a file, and rotates the file when it reaches
 * the `maxSize`.  The rotated files are named with the original file name
 * followed by a dot and a number, starting from 1.  The number is incremented
 * for each rotation, and the maximum number of files to keep is `maxFiles`.
 *
 * Note that this function is unavailable in the browser.
 *
 * @param path A path to the file to write to.
 * @param options The options for the sink and the file driver.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed.
 */
export function getRotatingFileSink(
  path: string,
  options: RotatingFileSinkOptions = {},
): Sink & Disposable {
  if ("document" in globalThis) {
    return getBaseRotatingFileSink(path, { ...options, ...webDriver });
  }
  return getBaseRotatingFileSink(path, { ...options, ...denoDriver });
}

// cSpell: ignore filesink
