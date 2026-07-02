import {
  getLogger as getLogTapeLogger,
  type Logger as LogTapeLogger,
  type LogLevel,
} from "@logtape/logtape";

export type { LogLevel } from "@logtape/logtape";

/**
 * GraphQL Yoga log levels.
 * @since 2.3.0
 */
export type YogaLogLevel = "debug" | "info" | "warn" | "error";

/**
 * A GraphQL Yoga-compatible logger that wraps LogTape.
 * @since 2.3.0
 */
export interface YogaLogger {
  /** Log at Yoga's debug level. */
  debug(...args: readonly unknown[]): void;

  /** Log at Yoga's info level. */
  info(...args: readonly unknown[]): void;

  /** Log at Yoga's warning level. */
  warn(...args: readonly unknown[]): void;

  /** Log at Yoga's error level. */
  error(...args: readonly unknown[]): void;
}

/**
 * Options for configuring the GraphQL Yoga LogTape logger.
 * @since 2.3.0
 */
export interface YogaLoggerOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["graphql-yoga"]
   */
  readonly category?: string | readonly string[];

  /**
   * Mapping between GraphQL Yoga log levels and LogTape log levels.
   *
   * By default, Yoga levels are mapped as follows:
   *
   * - `debug` -> `debug`
   * - `info` -> `info`
   * - `warn` -> `warning`
   * - `error` -> `error`
   */
  readonly levelsMap?: Partial<Readonly<Record<YogaLogLevel, LogLevel>>>;
}

const defaultLevelsMap: Readonly<Record<YogaLogLevel, LogLevel>> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

/**
 * Creates a GraphQL Yoga-compatible logger that wraps LogTape.
 *
 * @example Basic usage
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getYogaLogger } from "@logtape/graphql-yoga";
 * import { createYoga } from "graphql-yoga";
 *
 * await configure({
 *   // ... LogTape configuration
 * });
 *
 * const yoga = createYoga({
 *   schema,
 *   logging: getYogaLogger(),
 * });
 * ```
 *
 * @example With custom category and level mapping
 * ```typescript
 * const yoga = createYoga({
 *   schema,
 *   logging: getYogaLogger({
 *     category: ["myapp", "graphql"],
 *     levelsMap: { warn: "error" },
 *   }),
 * });
 * ```
 *
 * @param options Configuration options for the logger.
 * @returns A GraphQL Yoga-compatible logger wrapping LogTape.
 * @since 2.3.0
 */
export function getYogaLogger(options: YogaLoggerOptions = {}): YogaLogger {
  const category = normalizeCategory(options.category ?? ["graphql-yoga"]);
  const logger = getLogTapeLogger(category);
  const levelsMap = { ...defaultLevelsMap, ...options.levelsMap };

  return {
    debug: (...args) => logYogaArgs(logger, levelsMap.debug, args),
    info: (...args) => logYogaArgs(logger, levelsMap.info, args),
    warn: (...args) => logYogaArgs(logger, levelsMap.warn, args),
    error: (...args) => logYogaArgs(logger, levelsMap.error, args),
  };
}

function normalizeCategory(
  category: string | readonly string[],
): readonly string[] {
  return typeof category === "string" ? [category] : category;
}

function logYogaArgs(
  logger: LogTapeLogger,
  level: LogLevel,
  args: readonly unknown[],
): void {
  const [first, ...rest] = args;
  const properties = rest.length > 0 ? { args: rest } : undefined;

  if (args.length < 1) {
    logWithMessage(logger, level, "GraphQL Yoga log");
  } else if (first instanceof Error) {
    logError(logger, level, first, properties);
  } else if (typeof first === "string") {
    logWithMessage(logger, level, first, properties);
  } else if (args.length === 1 && isPlainRecord(first)) {
    logWithMessage(logger, level, "{*}", first);
  } else {
    logWithMessage(logger, level, "{*}", { args });
  }
}

function logError(
  logger: LogTapeLogger,
  level: LogLevel,
  error: Error,
  properties?: Record<string, unknown>,
): void {
  if (level === "warning" || level === "error" || level === "fatal") {
    const logMethod = logger[level].bind(logger) as (
      error: Error,
      properties?: Record<string, unknown>,
    ) => void;
    logMethod(error, properties);
    return;
  }

  logWithMessage(logger, level, "{error.message}", {
    ...properties,
    error,
  });
}

function logWithMessage(
  logger: LogTapeLogger,
  level: LogLevel,
  message: string,
  properties?: Record<string, unknown>,
): void {
  const logMethod = logger[level].bind(logger) as (
    message: string,
    properties?: Record<string, unknown>,
  ) => void;
  logMethod(message, properties);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (value instanceof Error) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
