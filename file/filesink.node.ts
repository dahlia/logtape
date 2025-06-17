import type { Sink } from "@logtape/logtape";
import fs from "node:fs";
import { promisify } from "node:util";
import {
  type AsyncRotatingFileSinkDriver,
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
 * A Node.js-specific async file sink driver.
 * @since 1.0.0
 */
export const nodeAsyncDriver: AsyncRotatingFileSinkDriver<number | void> = {
  ...nodeDriver,
  flush: promisify(fs.fsync),
  close: promisify(fs.close),
};

/**
 * Get a file sink.
 *
 * Note that this function is unavailable in the browser.
 *
 * @param path A path to the file to write to.
 * @param options The options for the sink.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed. If `nonBlocking` is enabled,
 *          returns a sink that also implements {@link AsyncDisposable}.
 */
export function getFileSink(
  path: string,
  options?: FileSinkOptions,
): Sink & Disposable;
export function getFileSink(
  path: string,
  options: FileSinkOptions & { nonBlocking: true },
): Sink & AsyncDisposable;
export function getFileSink(
  path: string,
  options: FileSinkOptions = {},
): Sink & (Disposable | AsyncDisposable) {
  if (options.nonBlocking) {
    return getBaseFileSink(path, { ...options, ...nodeAsyncDriver });
  }
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
 *          object that closes the file when disposed. If `nonBlocking` is enabled,
 *          returns a sink that also implements {@link AsyncDisposable}.
 */
export function getRotatingFileSink(
  path: string,
  options?: RotatingFileSinkOptions,
): Sink & Disposable;
export function getRotatingFileSink(
  path: string,
  options: RotatingFileSinkOptions & { nonBlocking: true },
): Sink & AsyncDisposable;
export function getRotatingFileSink(
  path: string,
  options: RotatingFileSinkOptions = {},
): Sink & (Disposable | AsyncDisposable) {
  if (options.nonBlocking) {
    return getBaseRotatingFileSink(path, { ...options, ...nodeAsyncDriver });
  }
  return getBaseRotatingFileSink(path, { ...options, ...nodeDriver });
}

// cSpell: ignore filesink
