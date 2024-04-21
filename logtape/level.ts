/**
 * The severity level of a {@link LogRecord}.
 */
export type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

/**
 * Parses a log level from a string.
 *
 * @param level The log level as a string.  This is case-insensitive.
 * @returns The log level.
 * @throws {TypeError} If the log level is invalid.
 */
export function parseLogLevel(level: string): LogLevel {
  level = level.toLowerCase();
  switch (level) {
    case "debug":
    case "info":
    case "warning":
    case "error":
    case "fatal":
      return level;
    default:
      throw new TypeError(`Invalid log level: ${level}.`);
  }
}

/**
 * Checks if a string is a valid log level.  This function can be used as
 * as a type guard to narrow the type of a string to a {@link LogLevel}.
 *
 * @param level The log level as a string.  This is case-sensitive.
 * @returns `true` if the string is a valid log level.
 */
export function isLogLevel(level: string): level is LogLevel {
  switch (level) {
    case "debug":
    case "info":
    case "warning":
    case "error":
    case "fatal":
      return true;
    default:
      return false;
  }
}
