import type { LogRecord, Sink } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import {
  EVENTLOG_ERROR_TYPE,
  EVENTLOG_INFORMATION_TYPE,
  EVENTLOG_WARNING_TYPE,
  WindowsEventLogDenoFFI,
} from "./ffi.deno.ts";
import { defaultWindowsEventlogFormatter } from "./formatter.ts";
import { validateWindowsPlatform } from "./platform.ts";
import type { WindowsEventLogSinkOptions } from "./types.ts";
import { DEFAULT_EVENT_ID_MAPPING } from "./types.ts";

/**
 * Maps LogTape log levels to Windows Event Log types.
 */
function getEventType(level: string): number {
  switch (level) {
    case "fatal":
    case "error":
      return EVENTLOG_ERROR_TYPE;
    case "warning":
      return EVENTLOG_WARNING_TYPE;
    case "info":
    case "debug":
    case "trace":
    default:
      return EVENTLOG_INFORMATION_TYPE;
  }
}

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
  // Validate platform early
  validateWindowsPlatform();

  const {
    sourceName,
    eventIdMapping = {},
  } = options;

  // Merge with default event ID mapping
  const eventIds = { ...DEFAULT_EVENT_ID_MAPPING, ...eventIdMapping };

  let ffi: WindowsEventLogDenoFFI | null = null;
  const metaLogger = getLogger(["logtape", "meta", "windows-eventlog"]);

  const sink: Sink & Disposable = (record: LogRecord) => {
    // Initialize FFI if needed
    if (!ffi) {
      try {
        ffi = new WindowsEventLogDenoFFI();
        ffi.initialize(sourceName);
      } catch (error) {
        metaLogger.error(
          "Failed to initialize Windows Event Log FFI: {error}",
          { error },
        );
        return; // Skip this log record
      }
    }

    // Format the complete message
    const formatter = options.formatter ?? defaultWindowsEventlogFormatter;
    const fullMessage = [formatter(record)];

    // Get event type and ID for this log level
    const eventType = getEventType(record.level);
    const eventId = eventIds[record.level];

    // Write to Event Log
    try {
      ffi.writeEvent(eventType, eventId, fullMessage);
    } catch (error) {
      metaLogger.error(
        "Failed to write {level} message to Windows Event Log: {error}",
        { level: record.level, error },
      );
    }
  };

  // Implement Disposable for cleanup
  sink[Symbol.dispose] = () => {
    // Clean up FFI resources
    if (ffi) {
      ffi.dispose();
      ffi = null;
    }
  };

  return sink;
}
