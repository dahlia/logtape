import type { Sink } from "@logtape/logtape";
import fs from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type AsyncRotatingFileSinkDriver,
  type FileSinkOptions,
  getBaseFileSink,
  getBaseRotatingFileSink,
  type RotatingFileSinkDriver,
  type RotatingFileSinkOptions,
} from "./filesink.base.ts";
import {
  type AsyncTimeRotatingFileSinkDriver,
  getBaseTimeRotatingFileSink,
  type TimeRotatingFileSinkDriver,
  type TimeRotatingFileSinkOptions,
} from "./timefilesink.ts";

/**
 * A Node.js-specific file sink driver.
 */
export const nodeDriver: RotatingFileSinkDriver<number | void> = {
  openSync(path: string) {
    return fs.openSync(path, "a");
  },
  writeSync: fs.writeSync,
  writeManySync(fd: number, chunks: Uint8Array[]): void {
    if (chunks.length === 0) return;
    if (chunks.length === 1) {
      fs.writeSync(fd, chunks[0]);
      return;
    }
    // Use writev for multiple chunks
    fs.writevSync(fd, chunks);
  },
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
  async writeMany(fd: number, chunks: Uint8Array[]): Promise<void> {
    if (chunks.length === 0) return;
    if (chunks.length === 1) {
      await promisify(fs.write)(fd, chunks[0]);
      return;
    }
    // Use async writev for multiple chunks
    await promisify(fs.writev)(fd, chunks);
  },
  flush: promisify(fs.fsync),
  close: promisify(fs.close),
};

/**
 * A Node.js-specific time-rotating file sink driver.
 * @since 1.4.0
 */
export const nodeTimeDriver: TimeRotatingFileSinkDriver<number | void> = {
  ...nodeDriver,
  readdirSync: fs.readdirSync as (path: string) => string[],
  unlinkSync: fs.unlinkSync,
  mkdirSync: fs.mkdirSync,
  joinPath: join,
};

/**
 * A Node.js-specific async time-rotating file sink driver.
 * @since 1.4.0
 */
export const nodeAsyncTimeDriver: AsyncTimeRotatingFileSinkDriver<
  number | void
> = {
  ...nodeAsyncDriver,
  readdirSync: fs.readdirSync as (path: string) => string[],
  unlinkSync: fs.unlinkSync,
  mkdirSync: fs.mkdirSync,
  joinPath: join,
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

/**
 * Get a time-rotating file sink.
 *
 * This sink writes log records to a file in a directory, rotating to a new
 * file based on time intervals.  The filename is generated based on the
 * current date/time and the configured interval.
 *
 * Note that this function is unavailable in the browser.
 *
 * @param options The options for the sink.
 * @returns A sink that writes to the file.  The sink is also a disposable
 *          object that closes the file when disposed. If `nonBlocking` is
 *          enabled, returns a sink that also implements {@link AsyncDisposable}.
 * @since 1.4.0
 */
export function getTimeRotatingFileSink(
  options: TimeRotatingFileSinkOptions,
): Sink & Disposable;
export function getTimeRotatingFileSink(
  options: TimeRotatingFileSinkOptions & { nonBlocking: true },
): Sink & AsyncDisposable;
export function getTimeRotatingFileSink(
  options: TimeRotatingFileSinkOptions,
): Sink & (Disposable | AsyncDisposable) {
  if (options.nonBlocking) {
    return getBaseTimeRotatingFileSink({ ...options, ...nodeAsyncTimeDriver });
  }
  return getBaseTimeRotatingFileSink({ ...options, ...nodeTimeDriver });
}

// cSpell: ignore filesink
