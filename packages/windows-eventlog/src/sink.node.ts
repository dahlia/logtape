import type { Sink } from "@logtape/logtape";
import { WindowsEventLogNodeFFI } from "./ffi.node.ts";
import { getWindowsEventLogSinkForFFI } from "./sink.ts";
import type { WindowsEventLogSinkOptions } from "./types.ts";

/**
 * Creates a Windows Event Log sink for Node.js environments using FFI.
 *
 * This implementation uses koffi to call Windows Event Log API directly,
 * providing high performance logging without external dependencies.
 *
 * @param options Configuration options for the sink
 * @returns A LogTape sink that writes to Windows Event Log
 * @throws {WindowsPlatformError} If not running on Windows
 * @throws {WindowsEventLogError} If Event Log operations fail
 *
 * @example
 * ```typescript
 * import { getWindowsEventLogSink } from "@logtape/windows-eventlog";
 *
 * const sink = getWindowsEventLogSink({
 *   sourceName: "MyApp"
 * });
 * ```
 *
 * @since 1.0.0
 */
export function getWindowsEventLogSink(
  options: WindowsEventLogSinkOptions,
): Sink & Disposable {
  const ffi = new WindowsEventLogNodeFFI();
  return getWindowsEventLogSinkForFFI(ffi, options);
}
