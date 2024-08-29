import type { FileSinkOptions, RotatingFileSinkOptions, Sink } from "./sink.ts";

const filesink: Omit<typeof import("./filesink.deno.ts"), "denoDriver"> =
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
 *          object that closes the file when disposed.
 */
export function getFileSink(
  path: string,
  options: FileSinkOptions = {},
): Sink & Disposable {
  return filesink.getFileSink(path, options);
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
  return filesink.getRotatingFileSink(path, options);
}

// cSpell: ignore filesink
