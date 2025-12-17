import type { LogLevel, TextFormatter } from "@logtape/logtape";

/**
 * Configuration options for the Windows Event Log sink.
 * @since 1.0.0
 */
export interface WindowsEventLogSinkOptions {
  /**
   * The name of the event source. This is typically your application name
   * and will appear as the "Source" in Windows Event Viewer.
   *
   * @example "MyApplication"
   */
  readonly sourceName: string;

  /**
   * The server name to write logs to. Use this for remote logging.
   *
   * @default undefined (local machine)
   */
  readonly serverName?: string;

  /**
   * Custom mapping of LogTape log levels to Windows Event IDs.
   * Event IDs are numeric identifiers that can be used for filtering
   * and automation in Windows Event Log.
   *
   * @default
   * ```typescript
   * {
   *   fatal: 1,
   *   error: 2,
   *   warning: 3,
   *   info: 4,
   *   debug: 5,
   *   trace: 6
   * }
   * ```
   */
  readonly eventIdMapping?: Partial<Record<LogLevel, number>>;

  /**
   * The text formatter to use.
   * Defaults to {@link defaultWindowsEventlogFormatter}.
   */
  formatter?: TextFormatter;
}

/**
 * Windows Event Log entry types mapped to LogTape levels.
 * These correspond to the event types visible in Windows Event Viewer.
 * @since 1.0.0
 */
export const WINDOWS_EVENT_TYPES: Record<LogLevel, number> = {
  fatal: 1, // Error
  error: 1, // Error
  warning: 2, // Warning
  info: 4, // Information
  debug: 4, // Information
  trace: 4, // Information
} as const;

/**
 * Generic event message defined in netmsg.dll which consists only of
 * placeholders and no extra text. This value is defined in LMErrlog.h
 */
export const NELOG_OEM_Code = 3299;

/**
 * Default Event ID mapping for LogTape levels. The event ID is used to look up
 * a string resource in a configured dynamic link library, which is then used
 * as a formatting string, passing the log text as parameters. The default is
 * to use an event ID which only writes the text supplied into the log.
 * @since 1.0.0
 */
export const DEFAULT_EVENT_ID_MAPPING: Record<LogLevel, number> = {
  fatal: NELOG_OEM_Code,
  error: NELOG_OEM_Code,
  warning: NELOG_OEM_Code,
  info: NELOG_OEM_Code,
  debug: NELOG_OEM_Code,
  trace: NELOG_OEM_Code,
} as const;

/**
 * Windows Event Log event type constants
 */
export type EventType = 1 | 2 | 4; // Error, Warning, Information

/**
 * Maps LogTape log levels to Windows Event Log event types
 */
export function mapLogLevelToEventType(level: LogLevel): EventType {
  switch (level) {
    case "fatal":
    case "error":
      return 1; // EVENTLOG_ERROR_TYPE
    case "warning":
      return 2; // EVENTLOG_WARNING_TYPE
    case "info":
    case "debug":
    case "trace":
    default:
      return 4; // EVENTLOG_INFORMATION_TYPE
  }
}

/**
 * Platform validation error thrown when trying to use the sink on non-Windows platforms.
 * @since 1.0.0
 */
export class WindowsPlatformError extends Error {
  constructor(platform: string) {
    super(
      `Windows Event Log sink can only be used on Windows platforms. ` +
        `Current platform: ${platform}. ` +
        `This package is designed specifically for Windows Event Log integration.`,
    );
    this.name = "WindowsPlatformError";
  }
}

/**
 * Error thrown when Windows Event Log operations fail.
 * @since 1.0.0
 */
export class WindowsEventLogError extends Error {
  constructor(message: string, cause?: Error) {
    super(`Windows Event Log error: ${message}`);
    this.name = "WindowsEventLogError";
    if (cause) {
      this.cause = cause;
    }
  }
}
