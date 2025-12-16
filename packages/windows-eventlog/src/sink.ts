import type { LogRecord, Sink } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import type { WindowsEventLogFFI } from "./ffi.ts";
import { defaultWindowsEventlogFormatter } from "./formatter.ts";
import { validateWindowsPlatform } from "./platform.ts";
import type { WindowsEventLogSinkOptions } from "./types.ts";
import { DEFAULT_EVENT_ID_MAPPING, mapLogLevelToEventType } from "./types.ts";

/**
 * Creates a Windows Event Log sink, parameterized on the FFI implementation.
 *
 * @param {WindowsEventLogFFI} ffi Actual FFI implementation to use
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
export function getWindowsEventLogSinkForFFI(
  ffi: WindowsEventLogFFI,
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

  const metaLogger = getLogger(["logtape", "meta", "windows-eventlog"]);

  const sink: Sink & Disposable = (record: LogRecord) => {
    try {
      ffi.initialize(sourceName);
    } catch (error) {
      metaLogger.error(
        "Failed to initialize Windows Event Log FFI: {error}",
        { error },
      );
      return;
    }

    // Format the complete message
    const formatter = options.formatter ?? defaultWindowsEventlogFormatter;
    const fullMessage = [formatter(record)];

    // Get event type and ID for this log level
    const eventType = mapLogLevelToEventType(record.level);
    const eventId = eventIds[record.level];

    // Write to Event Log using FFI
    try {
      ffi.writeEvent(eventType, eventId, fullMessage);
    } catch (error) {
      metaLogger.error(
        "Failed to write to Windows Event Log: {error}",
        { error },
      );
    }
  };

  // Implement Disposable for cleanup
  sink[Symbol.dispose] = () => {
    ffi.dispose();
  };

  return sink;
}
