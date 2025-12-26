import { getLogger, type Logger } from "@logtape/logtape";

/**
 * Pino log levels as strings.
 * @since 1.3.0
 */
export type PinoLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

/**
 * Options for configuring the Fastify LogTape logger.
 * @since 1.3.0
 */
export interface FastifyLogTapeOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["fastify"]
   */
  readonly category?: string | readonly string[];

  /**
   * The initial log level. This is tracked internally to satisfy
   * Pino's level property requirement.
   * Note: Actual filtering is controlled by LogTape configuration.
   * @default "info"
   */
  readonly level?: PinoLevel;
}

/**
 * Pino-style log method supporting multiple signatures.
 *
 * Supports the following calling conventions:
 * - `logger.info("message")` - Simple message
 * - `logger.info("message %s", arg)` - Printf-style interpolation
 * - `logger.info({ key: "value" }, "message")` - Object with message
 * - `logger.info({ key: "value" })` - Object only
 * - `logger.info({ msg: "message", key: "value" })` - Object with msg property
 *
 * @since 1.3.0
 */
export interface PinoLogMethod {
  /** Log with object and optional message */
  (obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  /** Log with just a message and optional interpolation args */
  (msg: string, ...args: unknown[]): void;
}

/**
 * A Pino-compatible logger interface that wraps LogTape.
 * This interface satisfies Fastify's `loggerInstance` (v5) or `logger` (v4) requirements.
 *
 * @example Fastify v5
 * ```typescript
 * import Fastify from "fastify";
 * import { getLogTapeFastifyLogger } from "@logtape/fastify";
 *
 * const fastify = Fastify({
 *   loggerInstance: getLogTapeFastifyLogger(),
 * });
 * ```
 *
 * @example Fastify v4
 * ```typescript
 * import Fastify from "fastify";
 * import { getLogTapeFastifyLogger } from "@logtape/fastify";
 *
 * const fastify = Fastify({
 *   logger: getLogTapeFastifyLogger(),
 * });
 * ```
 *
 * @since 1.3.0
 */
export interface PinoLikeLogger {
  /** Log at trace level */
  trace: PinoLogMethod;
  /** Log at debug level */
  debug: PinoLogMethod;
  /** Log at info level */
  info: PinoLogMethod;
  /** Log at warn level */
  warn: PinoLogMethod;
  /** Log at error level */
  error: PinoLogMethod;
  /** Log at fatal level */
  fatal: PinoLogMethod;
  /** No-op silent method for Pino compatibility */
  silent: () => void;
  /** Create a child logger with additional bindings */
  child: (bindings: Record<string, unknown>) => PinoLikeLogger;
  /** Current log level (readable/writable for Pino compatibility) */
  level: string;
}

/**
 * Creates a Pino-compatible logger that wraps LogTape.
 * This logger can be used as Fastify's `loggerInstance` (v5) or `logger` (v4).
 *
 * @example Basic usage
 * ```typescript
 * import Fastify from "fastify";
 * import { configure } from "@logtape/logtape";
 * import { getLogTapeFastifyLogger } from "@logtape/fastify";
 *
 * await configure({
 *   // ... LogTape configuration
 * });
 *
 * const fastify = Fastify({
 *   loggerInstance: getLogTapeFastifyLogger(),
 * });
 * ```
 *
 * @example Basic usage (Fastify v4)
 * ```typescript
 * import Fastify from "fastify";
 * import { configure } from "@logtape/logtape";
 * import { getLogTapeFastifyLogger } from "@logtape/fastify";
 *
 * await configure({
 *   // ... LogTape configuration
 * });
 *
 * const fastify = Fastify({
 *   logger: getLogTapeFastifyLogger(),
 * });
 * ```
 *
 * @example With custom category
 * ```typescript
 * const fastify = Fastify({
 *   loggerInstance: getLogTapeFastifyLogger({
 *     category: ["myapp", "http"],
 *   }),
 * });
 * ```
 *
 * @param options Configuration options for the logger.
 * @returns A Pino-compatible logger wrapping LogTape.
 * @since 1.3.0
 */
export function getLogTapeFastifyLogger(
  options: FastifyLogTapeOptions = {},
): PinoLikeLogger {
  const category = normalizeCategory(options.category ?? ["fastify"]);
  const logger = getLogger(category);
  const initialLevel = options.level ?? "info";

  return createPinoLikeLogger(logger, initialLevel);
}

/**
 * Normalize category to array format.
 */
function normalizeCategory(
  category: string | readonly string[],
): readonly string[] {
  return typeof category === "string" ? [category] : category;
}

/**
 * Format message with printf-style interpolation.
 * Supports: %s (string), %d (number), %j (JSON), %o/%O (object), %% (escaped %)
 */
function formatMessage(template: string, ...args: unknown[]): string {
  let argIndex = 0;
  return template.replace(/%[sdjoO%]/g, (match) => {
    if (match === "%%") return "%";
    if (argIndex >= args.length) return match;

    const arg = args[argIndex++];
    switch (match) {
      case "%s":
        return String(arg);
      case "%d":
        return Number(arg).toString();
      case "%j":
      case "%o":
      case "%O":
        return JSON.stringify(arg);
      default:
        return match;
    }
  });
}

/**
 * Creates a Pino-like logger wrapper around a LogTape logger.
 */
function createPinoLikeLogger(
  logger: Logger,
  initialLevel: PinoLevel,
  bindings: Record<string, unknown> = {},
): PinoLikeLogger {
  // Track level internally for Pino compatibility
  let _level: string = initialLevel;

  // If there are bindings, create a contextual logger
  const contextLogger = Object.keys(bindings).length > 0
    ? logger.with(bindings)
    : logger;

  /**
   * Create a log method for a specific level.
   */
  function createLogMethod(
    logFn: (msg: string, props?: Record<string, unknown>) => void,
  ): PinoLogMethod {
    return function pinoLogMethod(
      objOrMsg: Record<string, unknown> | string,
      ...restArgs: unknown[]
    ): void {
      // Detect calling convention
      if (typeof objOrMsg === "string") {
        // Called as: logger.info("message") or logger.info("message %s", arg)
        const message = formatMessage(objOrMsg, ...restArgs);
        logFn(message);
      } else if (typeof objOrMsg === "object" && objOrMsg !== null) {
        // Called as: logger.info({ key: value }, "message") or logger.info({ key: value })
        const properties = { ...objOrMsg };
        const [msgOrArg, ...args] = restArgs;

        if (typeof msgOrArg === "string") {
          // Has message string: logger.info({ foo: 1 }, "message %s", arg)
          const message = formatMessage(msgOrArg, ...args);
          logFn(message, properties);
        } else if ("msg" in properties && typeof properties.msg === "string") {
          // Extract message from object: logger.info({ msg: "hello", foo: 1 })
          const message = properties.msg as string;
          delete properties.msg;
          logFn(message, properties);
        } else {
          // Object-only logging: logger.info({ foo: 1 })
          logFn("{*}", properties);
        }
      }
    } as PinoLogMethod;
  }

  const pinoLogger: PinoLikeLogger = {
    trace: createLogMethod((msg, props) => contextLogger.trace(msg, props)),
    debug: createLogMethod((msg, props) => contextLogger.debug(msg, props)),
    info: createLogMethod((msg, props) => contextLogger.info(msg, props)),
    warn: createLogMethod((msg, props) => contextLogger.warn(msg, props)),
    error: createLogMethod((msg, props) => contextLogger.error(msg, props)),
    fatal: createLogMethod((msg, props) => contextLogger.fatal(msg, props)),

    silent: () => {
      // No-op for silent level
    },

    child: (childBindings: Record<string, unknown>) => {
      // Merge parent bindings with child bindings
      const mergedBindings = { ...bindings, ...childBindings };
      return createPinoLikeLogger(logger, _level as PinoLevel, mergedBindings);
    },

    get level() {
      return _level;
    },

    set level(newLevel: string) {
      // Store level for Pino compatibility
      // Note: Actual filtering is handled by LogTape configuration
      _level = newLevel;
    },
  };

  return pinoLogger;
}
