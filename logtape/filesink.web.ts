import type { RotatingFileSinkDriver } from "./sink.ts";

function notImplemented<T>(): T {
  throw new Error("File sink is not available in the browser.");
}

/**
 * A browser-specific file sink driver.  All methods throw an error.
 */
export const webDriver: RotatingFileSinkDriver<void> = {
  openSync: notImplemented,
  writeSync: notImplemented,
  flushSync: notImplemented,
  closeSync: notImplemented,
  statSync: notImplemented,
  renameSync: notImplemented,
};
