import type { Sink } from "@logtape/logtape";
import { WindowsEventLogDenoFFI } from "./ffi.deno.ts";
import { getWindowsEventLogSinkForFFI } from "./sink.ts";
import type { WindowsEventLogSinkOptions } from "./types.ts";

/**
 * Creates a Windows Event Log sink for Deno environments using FFI.
 *
 * This implementation uses Deno's Foreign Function Interface to directly
 * call Windows Event Log APIs, providing reliable Event Log integration
 * without depending on external packages.
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
  const ffi = new WindowsEventLogDenoFFI();
  return getWindowsEventLogSinkForFFI(ffi, options);
}
