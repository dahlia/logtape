/**
 * LogTape Windows Event Log Sink
 *
 * A cross-runtime Windows Event Log sink for LogTape that provides native
 * integration with the Windows Event Log system. Works with Deno, Node.js,
 * and Bun on Windows platforms.
 *
 * @example Basic usage
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getWindowsEventLogSink } from "@logtape/windows-eventlog";
 *
 * await configure({
 *   sinks: {
 *     eventlog: getWindowsEventLogSink({
 *       sourceName: "MyApplication"
 *     }),
 *   },
 *   loggers: [
 *     { category: [], sinks: ["eventlog"], lowestLevel: "info" },
 *   ],
 * });
 * ```
 *
 * @example Advanced configuration
 * ```typescript
 * import { getWindowsEventLogSink } from "@logtape/windows-eventlog";
 *
 * const sink = getWindowsEventLogSink({
 *   sourceName: "MyApp",
 *   logName: "Application",
 *   eventIdMapping: {
 *     error: 1001,
 *     warning: 2001,
 *     info: 3001,
 *   }
 * });
 * ```
 *
 * @module
 * @since 1.0.0
 */

// Re-export main functionality
export { getWindowsEventLogSink } from "#wineventlog";

// Re-export types
export type { WindowsEventLogSinkOptions, WindowsLogName } from "./types.ts";

// Re-export errors for error handling
export { WindowsEventLogError, WindowsPlatformError } from "./types.ts";
