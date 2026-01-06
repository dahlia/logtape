import { getLogger, type LogLevel } from "@logtape/logtape";

export type { LogLevel } from "@logtape/logtape";

/**
 * Minimal Koa Context interface for compatibility across Koa 2.x and 3.x.
 *
 * This interface includes common aliases available on the Koa context object.
 * See https://koajs.com/#context for the full API.
 *
 * @since 1.3.0
 */
export interface KoaContext {
  /** HTTP request method (alias for ctx.request.method) */
  method: string;
  /** Request URL (alias for ctx.request.url) */
  url: string;
  /** Request pathname (alias for ctx.request.path) */
  path: string;
  /** HTTP response status code (alias for ctx.response.status) */
  status: number;
  /** Remote client IP address (alias for ctx.request.ip) */
  ip: string;
  /** Koa Response object */
  response: {
    length?: number;
  };
  /**
   * Get a request header field value (case-insensitive).
   * @param field The header field name.
   * @returns The header value, or an empty string if not present.
   */
  get(field: string): string;
}

/**
 * Koa middleware function type.
 * @since 1.3.0
 */
export type KoaMiddleware = (
  ctx: KoaContext,
  next: () => Promise<void>,
) => Promise<void>;

/**
 * Predefined log format names compatible with Morgan.
 * @since 1.3.0
 */
export type PredefinedFormat = "combined" | "common" | "dev" | "short" | "tiny";

/**
 * Custom format function for request logging.
 *
 * @param ctx The Koa context object.
 * @param responseTime The response time in milliseconds.
 * @returns A string message or an object with structured properties.
 * @since 1.3.0
 */
export type FormatFunction = (
  ctx: KoaContext,
  responseTime: number,
) => string | Record<string, unknown>;

/**
 * Structured log properties for HTTP requests.
 * @since 1.3.0
 */
export interface RequestLogProperties {
  /** HTTP request method */
  method: string;
  /** Request URL */
  url: string;
  /** Request path */
  path: string;
  /** HTTP response status code */
  status: number;
  /** Response time in milliseconds */
  responseTime: number;
  /** Response content-length */
  contentLength: number | undefined;
  /** Remote client address */
  remoteAddr: string | undefined;
  /** User-Agent header value */
  userAgent: string | undefined;
  /** Referrer header value */
  referrer: string | undefined;
}

/**
 * Options for configuring the Koa LogTape middleware.
 * @since 1.3.0
 */
export interface KoaLogTapeOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["koa"]
   */
  readonly category?: string | readonly string[];

  /**
   * The log level to use for request logging.
   * @default "info"
   */
  readonly level?: LogLevel;

  /**
   * The format for log output.
   * Can be a predefined format name or a custom format function.
   *
   * Predefined formats:
   * - `"combined"` - Apache Combined Log Format (structured, default)
   * - `"common"` - Apache Common Log Format (structured, no referrer/userAgent)
   * - `"dev"` - Concise colored output for development (string)
   * - `"short"` - Shorter than common (string)
   * - `"tiny"` - Minimal output (string)
   *
   * @default "combined"
   */
  readonly format?: PredefinedFormat | FormatFunction;

  /**
   * Function to determine whether logging should be skipped.
   * Return `true` to skip logging for a request.
   *
   * @example Skip logging for health check endpoint
   * ```typescript
   * app.use(koaLogger({
   *   skip: (ctx) => ctx.path === "/health",
   * }));
   * ```
   *
   * @default () => false
   */
  readonly skip?: (ctx: KoaContext) => boolean;

  /**
   * If `true`, logs are written immediately when the request is received.
   * If `false` (default), logs are written after the response is sent.
   *
   * Note: When `logRequest` is `true`, response-related properties
   * (status, responseTime, contentLength) will not be available.
   *
   * @default false
   */
  readonly logRequest?: boolean;
}

/**
 * Get referrer from request headers.
 * Returns undefined if the header is not present or empty.
 */
function getReferrer(ctx: KoaContext): string | undefined {
  const referrer = ctx.get("referrer") || ctx.get("referer");
  return referrer !== "" ? referrer : undefined;
}

/**
 * Get user agent from request headers.
 * Returns undefined if the header is not present or empty.
 */
function getUserAgent(ctx: KoaContext): string | undefined {
  const userAgent = ctx.get("user-agent");
  return userAgent !== "" ? userAgent : undefined;
}

/**
 * Get remote address from context.
 * Returns undefined if not available.
 */
function getRemoteAddr(ctx: KoaContext): string | undefined {
  return ctx.ip !== "" ? ctx.ip : undefined;
}

/**
 * Get content length from response.
 */
function getContentLength(ctx: KoaContext): number | undefined {
  return ctx.response.length;
}

/**
 * Build structured log properties from context.
 */
function buildProperties(
  ctx: KoaContext,
  responseTime: number,
): RequestLogProperties {
  return {
    method: ctx.method,
    url: ctx.url,
    path: ctx.path,
    status: ctx.status,
    responseTime,
    contentLength: getContentLength(ctx),
    remoteAddr: getRemoteAddr(ctx),
    userAgent: getUserAgent(ctx),
    referrer: getReferrer(ctx),
  };
}

/**
 * Combined format (Apache Combined Log Format).
 * Returns all structured properties.
 */
function formatCombined(
  ctx: KoaContext,
  responseTime: number,
): Record<string, unknown> {
  return { ...buildProperties(ctx, responseTime) };
}

/**
 * Common format (Apache Common Log Format).
 * Like combined but without referrer and userAgent.
 */
function formatCommon(
  ctx: KoaContext,
  responseTime: number,
): Record<string, unknown> {
  const props = buildProperties(ctx, responseTime);
  const { referrer: _referrer, userAgent: _userAgent, ...rest } = props;
  return rest;
}

/**
 * Dev format (colored output for development).
 * :method :path :status :response-time ms - :res[content-length]
 */
function formatDev(
  ctx: KoaContext,
  responseTime: number,
): string {
  const contentLength = getContentLength(ctx) ?? "-";
  return `${ctx.method} ${ctx.path} ${ctx.status} ${
    responseTime.toFixed(3)
  } ms - ${contentLength}`;
}

/**
 * Short format.
 * :remote-addr :method :url :status :res[content-length] - :response-time ms
 */
function formatShort(
  ctx: KoaContext,
  responseTime: number,
): string {
  const remoteAddr = getRemoteAddr(ctx) ?? "-";
  const contentLength = getContentLength(ctx) ?? "-";
  return `${remoteAddr} ${ctx.method} ${ctx.url} ${ctx.status} ${contentLength} - ${
    responseTime.toFixed(3)
  } ms`;
}

/**
 * Tiny format (minimal output).
 * :method :path :status :res[content-length] - :response-time ms
 */
function formatTiny(
  ctx: KoaContext,
  responseTime: number,
): string {
  const contentLength = getContentLength(ctx) ?? "-";
  return `${ctx.method} ${ctx.path} ${ctx.status} ${contentLength} - ${
    responseTime.toFixed(3)
  } ms`;
}

/**
 * Map of predefined format functions.
 */
const predefinedFormats: Record<PredefinedFormat, FormatFunction> = {
  combined: formatCombined,
  common: formatCommon,
  dev: formatDev,
  short: formatShort,
  tiny: formatTiny,
};

/**
 * Normalize category to array format.
 */
function normalizeCategory(
  category: string | readonly string[],
): readonly string[] {
  return typeof category === "string" ? [category] : category;
}

/**
 * Creates Koa middleware for HTTP request logging using LogTape.
 *
 * This middleware provides Morgan-compatible request logging with LogTape
 * as the backend, supporting structured logging and customizable formats.
 * It serves as an alternative to koa-logger with structured logging support.
 *
 * @example Basic usage
 * ```typescript
 * import Koa from "koa";
 * import { configure, getConsoleSink } from "@logtape/logtape";
 * import { koaLogger } from "@logtape/koa";
 *
 * await configure({
 *   sinks: { console: getConsoleSink() },
 *   loggers: [
 *     { category: ["koa"], sinks: ["console"], lowestLevel: "info" }
 *   ],
 * });
 *
 * const app = new Koa();
 * app.use(koaLogger());
 *
 * app.use((ctx) => {
 *   ctx.body = { hello: "world" };
 * });
 *
 * app.listen(3000);
 * ```
 *
 * @example With custom options
 * ```typescript
 * app.use(koaLogger({
 *   category: ["myapp", "http"],
 *   level: "debug",
 *   format: "dev",
 *   skip: (ctx) => ctx.path === "/health",
 * }));
 * ```
 *
 * @example With custom format function
 * ```typescript
 * app.use(koaLogger({
 *   format: (ctx, responseTime) => ({
 *     method: ctx.method,
 *     path: ctx.path,
 *     status: ctx.status,
 *     duration: responseTime,
 *   }),
 * }));
 * ```
 *
 * @param options Configuration options for the middleware.
 * @returns Koa middleware function.
 * @since 1.3.0
 */
export function koaLogger(
  options: KoaLogTapeOptions = {},
): KoaMiddleware {
  const category = normalizeCategory(options.category ?? ["koa"]);
  const logger = getLogger(category);
  const level = options.level ?? "info";
  const formatOption = options.format ?? "combined";
  const skip = options.skip ?? (() => false);
  const logRequest = options.logRequest ?? false;

  // Resolve format function
  const formatFn: FormatFunction = typeof formatOption === "string"
    ? predefinedFormats[formatOption]
    : formatOption;

  const logMethod = logger[level].bind(logger);

  return async (ctx: KoaContext, next: () => Promise<void>): Promise<void> => {
    const startTime = Date.now();

    // For immediate logging, log when request arrives
    if (logRequest) {
      if (!skip(ctx)) {
        const result = formatFn(ctx, 0);
        if (typeof result === "string") {
          logMethod(result);
        } else {
          logMethod("{method} {url}", result);
        }
      }
      await next();
      return;
    }

    // Log after response is sent
    await next();

    if (skip(ctx)) return;

    const responseTime = Date.now() - startTime;
    const result = formatFn(ctx, responseTime);

    if (typeof result === "string") {
      logMethod(result);
    } else {
      logMethod("{method} {url} {status} - {responseTime} ms", result);
    }
  };
}
