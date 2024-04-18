import type { FileSinkDriver } from "./sink.ts";

function notImplemented() {
  throw new Error("File sink is not available in the browser.");
}

/**
 * A browser-specific file sink driver.  All methods throw an error.
 */
export const webDriver: FileSinkDriver<void> = {
  openSync: notImplemented,
  writeSync: notImplemented,
  flushSync: notImplemented,
  closeSync: notImplemented,
};
