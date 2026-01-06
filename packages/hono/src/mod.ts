import { getLogger, type LogLevel } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";

export type { LogLevel } from "@logtape/logtape";

/**
 * Minimal Hono Context interface for compatibility across Hono versions.
 * @since 1.3.0
 */
export interface HonoContext {
  req: {
    method: string;
    url: string;
    path: string;
    header(name: string): string | undefined;
  };
  res: {
    status: number;
    headers: {
      get(name: string): string | null;
    };
  };
}

/**
 * Predefined log format names compatible with Morgan.
 * @since 1.3.0
 */
export type PredefinedFormat = "combined" | "common" | "dev" | "short" | "tiny";

/**
 * Custom format function for request logging.
 *
 * @param c The Hono context object.
 * @param responseTime The response time in milliseconds.
 * @returns A string message or an object with structured properties.
 * @since 1.3.0
 */
export type FormatFunction = (
  c: HonoContext,
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
  /** Response content-length header value */
  contentLength: string | undefined;
  /** User-Agent header value */
  userAgent: string | undefined;
  /** Referrer header value */
  referrer: string | undefined;
}

/**
 * Options for configuring the Hono LogTape middleware.
 * @since 1.3.0
 */
export interface HonoLogTapeOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["hono"]
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
   * app.use(honoLogger({
   *   skip: (c) => c.req.path === "/health",
   * }));
   * ```
   *
   * @default () => false
   */
  readonly skip?: (c: HonoContext) => boolean;

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
 */
function getReferrer(c: HonoContext): string | undefined {
  return c.req.header("referrer") || c.req.header("referer");
}

/**
 * Get user agent from request headers.
 */
function getUserAgent(c: HonoContext): string | undefined {
  return c.req.header("user-agent");
}

/**
 * Get content length from response headers.
 */
function getContentLength(c: HonoContext): string | undefined {
  const contentLength = c.res.headers.get("content-length");
  if (contentLength === null) return undefined;
  return contentLength;
}

/**
 * Build structured log properties from context.
 */
function buildProperties(
  c: HonoContext,
  responseTime: number,
): RequestLogProperties {
  return {
    method: c.req.method,
    url: c.req.url,
    path: c.req.path,
    status: c.res.status,
    responseTime,
    contentLength: getContentLength(c),
    userAgent: getUserAgent(c),
    referrer: getReferrer(c),
  };
}

/**
 * Combined format (Apache Combined Log Format).
 * Returns all structured properties.
 */
function formatCombined(
  c: HonoContext,
  responseTime: number,
): Record<string, unknown> {
  return { ...buildProperties(c, responseTime) };
}

/**
 * Common format (Apache Common Log Format).
 * Like combined but without referrer and userAgent.
 */
function formatCommon(
  c: HonoContext,
  responseTime: number,
): Record<string, unknown> {
  const props = buildProperties(c, responseTime);
  const { referrer: _referrer, userAgent: _userAgent, ...rest } = props;
  return rest;
}

/**
 * Dev format (colored output for development).
 * :method :path :status :response-time ms - :res[content-length]
 */
function formatDev(
  c: HonoContext,
  responseTime: number,
): string {
  const contentLength = getContentLength(c) ?? "-";
  return `${c.req.method} ${c.req.path} ${c.res.status} ${
    responseTime.toFixed(3)
  } ms - ${contentLength}`;
}

/**
 * Short format.
 * :method :url :status :res[content-length] - :response-time ms
 */
function formatShort(
  c: HonoContext,
  responseTime: number,
): string {
  const contentLength = getContentLength(c) ?? "-";
  return `${c.req.method} ${c.req.url} ${c.res.status} ${contentLength} - ${
    responseTime.toFixed(3)
  } ms`;
}

/**
 * Tiny format (minimal output).
 * :method :path :status :res[content-length] - :response-time ms
 */
function formatTiny(
  c: HonoContext,
  responseTime: number,
): string {
  const contentLength = getContentLength(c) ?? "-";
  return `${c.req.method} ${c.req.path} ${c.res.status} ${contentLength} - ${
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
 * Creates Hono middleware for HTTP request logging using LogTape.
 *
 * This middleware provides Morgan-compatible request logging with LogTape
 * as the backend, supporting structured logging and customizable formats.
 *
 * @example Basic usage
 * ```typescript
 * import { Hono } from "hono";
 * import { configure, getConsoleSink } from "@logtape/logtape";
 * import { honoLogger } from "@logtape/hono";
 *
 * await configure({
 *   sinks: { console: getConsoleSink() },
 *   loggers: [
 *     { category: ["hono"], sinks: ["console"], lowestLevel: "info" }
 *   ],
 * });
 *
 * const app = new Hono();
 * app.use(honoLogger());
 *
 * app.get("/", (c) => c.json({ hello: "world" }));
 *
 * export default app;
 * ```
 *
 * @example With custom options
 * ```typescript
 * app.use(honoLogger({
 *   category: ["myapp", "http"],
 *   level: "debug",
 *   format: "dev",
 *   skip: (c) => c.req.path === "/health",
 * }));
 * ```
 *
 * @example With custom format function
 * ```typescript
 * app.use(honoLogger({
 *   format: (c, responseTime) => ({
 *     method: c.req.method,
 *     path: c.req.path,
 *     status: c.res.status,
 *     duration: responseTime,
 *   }),
 * }));
 * ```
 *
 * @param options Configuration options for the middleware.
 * @returns Hono middleware function.
 * @since 1.3.0
 */
export function honoLogger(
  options: HonoLogTapeOptions = {},
): MiddlewareHandler {
  const category = normalizeCategory(options.category ?? ["hono"]);
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

  return createMiddleware(async (c, next) => {
    const startTime = Date.now();

    // For immediate logging, log when request arrives
    if (logRequest) {
      if (!skip(c as unknown as HonoContext)) {
        const result = formatFn(c as unknown as HonoContext, 0);
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

    if (skip(c as unknown as HonoContext)) return;

    const responseTime = Date.now() - startTime;
    const result = formatFn(c as unknown as HonoContext, responseTime);

    if (typeof result === "string") {
      logMethod(result);
    } else {
      logMethod("{method} {url} {status} - {responseTime} ms", result);
    }
  });
}
