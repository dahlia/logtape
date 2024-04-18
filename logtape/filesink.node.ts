import fs from "node:fs";
import { webDriver } from "./filesink.web.ts";
import {
  type FileSinkDriver,
  type FileSinkOptions,
  getFileSink as getBaseFileSink,
  type Sink,
} from "./sink.ts";

/**
 * A Node.js-specific file sink driver.
 */
export const nodeDriver: FileSinkDriver<number> = {
  openSync(path: string) {
    return fs.openSync(path, "a");
  },
  writeSync: fs.writeSync,
  flushSync: fs.fsyncSync,
  closeSync: fs.closeSync,
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
  return getBaseFileSink(path, { ...options, ...nodeDriver });
}

// cSpell: ignore filesink
