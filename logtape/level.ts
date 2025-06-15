const logLevels = [
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
] as const;

/**
 * The severity level of a {@link LogRecord}.
 */
export type LogLevel = typeof logLevels[number];

/**
 * Lists all available log levels with the order of their severity.
 * The `"trace"` level goes first, and the `"fatal"` level goes last.
 * @returns A new copy of the array of log levels.
 * @since 1.0.0
 */
export function getLogLevels(): readonly LogLevel[] {
  return [...logLevels];
}

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
    case "trace":
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
    case "trace":
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

/**
 * Compares two log levels.
 * @param a The first log level.
 * @param b The second log level.
 * @returns A negative number if `a` is less than `b`, a positive number if `a`
 *          is greater than `b`, or zero if they are equal.
 * @since 0.8.0
 */
export function compareLogLevel(a: LogLevel, b: LogLevel): number {
  const aIndex = logLevels.indexOf(a);
  if (aIndex < 0) {
    throw new TypeError(`Invalid log level: ${JSON.stringify(a)}.`);
  }
  const bIndex = logLevels.indexOf(b);
  if (bIndex < 0) {
    throw new TypeError(`Invalid log level: ${JSON.stringify(b)}.`);
  }
  return aIndex - bIndex;
}
