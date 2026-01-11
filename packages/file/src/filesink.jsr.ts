import type { Sink } from "@logtape/logtape";
import type {
  FileSinkOptions,
  RotatingFileSinkOptions,
} from "./filesink.base.ts";
import type { TimeRotatingFileSinkOptions } from "./timefilesink.ts";

const filesink: Omit<
  typeof import("./filesink.deno.ts"),
  | "denoDriver"
  | "denoAsyncDriver"
  | "denoTimeDriver"
  | "denoAsyncTimeDriver"
> =
  // dnt-shim-ignore
  await ("Deno" in globalThis
    ? import("./filesink.deno.ts")
    : import("./filesink.node.ts"));

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
  return filesink.getFileSink(path, options) as
    & Sink
    & (Disposable | AsyncDisposable);
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
  return filesink.getRotatingFileSink(path, options) as
    & Sink
    & (Disposable | AsyncDisposable);
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
 *          object that closes the file when disposed.  If `nonBlocking` is
 *          enabled, returns a sink that also implements {@link AsyncDisposable}.
 * @since 2.0.0
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
  return filesink.getTimeRotatingFileSink(options) as
    & Sink
    & (Disposable | AsyncDisposable);
}

// cSpell: ignore filesink
