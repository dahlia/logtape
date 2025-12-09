import type { LogRecord, Sink } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { defaultWindowsEventlogFormatter } from "./formatter.ts";
import type { WindowsEventLogSinkOptions } from "./types.ts";
import { DEFAULT_EVENT_ID_MAPPING, mapLogLevelToEventType } from "./types.ts";
import { validateWindowsPlatform } from "./platform.ts";
import { WindowsEventLogFFI } from "./ffi.bun.ts";

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
  // Validate platform early
  validateWindowsPlatform();

  const {
    sourceName,
    eventIdMapping = {},
  } = options;

  // Merge with default event ID mapping
  const eventIds = { ...DEFAULT_EVENT_ID_MAPPING, ...eventIdMapping };

  let ffi: WindowsEventLogFFI | null = null;
  const metaLogger = getLogger(["logtape", "meta", "windows-eventlog"]);

  const sink: Sink & Disposable = (record: LogRecord) => {
    if (!ffi) {
      ffi = new WindowsEventLogFFI(sourceName);
      try {
        ffi.initialize();
      } catch (error) {
        metaLogger.error(
          "Failed to initialize Windows Event Log FFI: {error}",
          { error },
        );
        ffi = null; // Reset FFI on error
        return;
      }
    }

    // Format the complete message
    const formatter = options.formatter ?? defaultWindowsEventlogFormatter;
    const fullMessage = [formatter(record)];

    // Get event type and ID for this log level
    const eventType = mapLogLevelToEventType(record.level);
    const eventId = eventIds[record.level];

    // Write to Event Log using FFI (synchronously since Bun FFI initializes synchronously)
    if (ffi) {
      try {
        ffi.writeEvent(eventType, eventId, fullMessage);
      } catch (error) {
        metaLogger.error(
          "Failed to write to Windows Event Log: {error}",
          { error },
        );
      }
    }
  };

  // Implement Disposable for cleanup
  sink[Symbol.dispose] = () => {
    if (ffi) {
      ffi.dispose();
      ffi = null;
    }
  };

  return sink;
}
