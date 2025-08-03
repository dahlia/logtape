import type { LogRecord, Sink } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import type { WindowsEventLogSinkOptions } from "./types.ts";
import { DEFAULT_EVENT_ID_MAPPING, mapLogLevelToEventType } from "./types.ts";
import { validateWindowsPlatform } from "./platform.ts";
import { WindowsEventLogFFI } from "./ffi.bun.ts";

/**
 * Formats a log record message into a string suitable for Windows Event Log.
 * Combines the template and arguments into a readable message.
 */
function formatMessage(record: LogRecord): string {
  let message = "";

  // Combine template parts with arguments
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) {
      // Template part
      message += record.message[i];
    } else {
      // Argument - serialize it
      const arg = record.message[i];
      if (typeof arg === "string") {
        message += arg;
      } else {
        message += JSON.stringify(arg);
      }
    }
  }

  return message;
}

/**
 * Formats additional context information for the log entry.
 * Includes category, properties, and other metadata.
 */
function formatContext(record: LogRecord): string {
  const context: string[] = [];

  // Add category if present
  if (record.category && record.category.length > 0) {
    context.push(`Category: ${record.category.join(".")}`);
  }

  // Add properties if present
  if (record.properties && Object.keys(record.properties).length > 0) {
    context.push(`Properties: ${JSON.stringify(record.properties)}`);
  }

  // Add timestamp
  context.push(`Timestamp: ${new Date(record.timestamp).toISOString()}`);

  return context.length > 0 ? `\n\n${context.join("\n")}` : "";
}

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
    const message = formatMessage(record);
    const context = formatContext(record);
    const fullMessage = message + context;

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
