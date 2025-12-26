import type { Sink } from "@logtape/logtape";
import { WindowsEventLogBunFFI } from "./ffi.bun.ts";
import { getWindowsEventLogSinkForFFI } from "./sink.ts";
import type { WindowsEventLogSinkOptions } from "./types.ts";

/**
 * Creates a Windows Event Log sink for Bun environments using FFI.
 *
 * This implementation uses Bun's native Foreign Function Interface to directly
 * call Windows Event Log APIs, providing high performance logging optimized
 * for the Bun runtime.
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
  const ffi = new WindowsEventLogBunFFI();
  return getWindowsEventLogSinkForFFI(ffi, options);
}
