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
  const category: readonly string[] = normalizeCategory(
    options.category ?? ["graphql-yoga"],
  );
  const logger: LogTapeLogger = getLogTapeLogger(category);
  const levelsMap: Readonly<Record<YogaLogLevel, LogLevel>> = {
    debug: options.levelsMap?.debug ?? defaultLevelsMap.debug,
    info: options.levelsMap?.info ?? defaultLevelsMap.info,
    warn: options.levelsMap?.warn ?? defaultLevelsMap.warn,
    error: options.levelsMap?.error ?? defaultLevelsMap.error,
  };

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
    logWithMessage(logger, level, "{message}", {
      message: first,
      ...properties,
    });
  } else if (isPlainRecord(first)) {
    logWithMessage(logger, level, "{*}", mergeRestArgs(first, rest));
  } else {
    logWithMessage(logger, level, "{*}", { args });
  }
}

function mergeRestArgs(
  properties: Record<string, unknown>,
  rest: readonly unknown[],
): Record<string, unknown> {
  if (rest.length < 1) return properties;
  const restKey = Object.hasOwn(properties, "args") ? "additionalArgs" : "args";
  return { ...properties, [restKey]: rest };
}

function logError(
  logger: LogTapeLogger,
  level: LogLevel,
  error: Error,
  properties?: Record<string, unknown>,
): void {
  if (level === "warning" || level === "error" || level === "fatal") {
    switch (level) {
      case "warning":
        logger.warning(error, properties);
        break;
      case "error":
        logger.error(error, properties);
        break;
      case "fatal":
        logger.fatal(error, properties);
        break;
    }
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
  switch (level) {
    case "trace":
      logger.trace(message, properties);
      break;
    case "debug":
      logger.debug(message, properties);
      break;
    case "info":
      logger.info(message, properties);
      break;
    case "warning":
      logger.warning(message, properties);
      break;
    case "error":
      logger.error(message, properties);
      break;
    case "fatal":
      logger.fatal(message, properties);
      break;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (value instanceof Error) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
