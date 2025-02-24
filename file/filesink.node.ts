import type { Sink } from "@logtape/logtape";
import fs from "node:fs";
import {
  type FileSinkOptions,
  getBaseFileSink,
  getBaseRotatingFileSink,
  type RotatingFileSinkDriver,
  type RotatingFileSinkOptions,
} from "./filesink.base.ts";

/**
 * A Node.js-specific file sink driver.
 */
export const nodeDriver: RotatingFileSinkDriver<number | void> = {
  openSync(path: string) {
    return fs.openSync(path, "a");
  },
  writeSync: fs.writeSync,
  flushSync: fs.fsyncSync,
  closeSync: fs.closeSync,
  statSync: fs.statSync,
  renameSync: fs.renameSync,
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
  return getBaseFileSink(path, { ...options, ...nodeDriver });
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
  return getBaseRotatingFileSink(path, { ...options, ...nodeDriver });
}

// cSpell: ignore filesink
