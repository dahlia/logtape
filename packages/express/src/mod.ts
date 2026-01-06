import { getLogger, type LogLevel } from "@logtape/logtape";

export type { LogLevel } from "@logtape/logtape";

// Use minimal type definitions for Express compatibility across Express 4.x and 5.x
// These are compatible with both versions and avoid strict type checking issues

/**
 * Minimal Express Request interface for compatibility.
 * @since 1.3.0
 */
export interface ExpressRequest {
  method: string;
  url: string;
  originalUrl?: string;
  path?: string;
  httpVersion: string;
  ip?: string;
  socket?: { remoteAddress?: string };
  get(header: string): string | undefined;
}

/**
 * Minimal Express Response interface for compatibility.
 * @since 1.3.0
 */
export interface ExpressResponse {
  statusCode: number;
  on(event: string, listener: () => void): void;
  getHeader(name: string): string | number | string[] | undefined;
}

/**
 * Express NextFunction type.
 * @since 1.3.0
 */
export type ExpressNextFunction = (err?: unknown) => void;

/**
 * Express middleware function type.
 * @since 1.3.0
 */
export type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction,
) => void;

/**
 * Predefined log format names compatible with Morgan.
 * @since 1.3.0
 */
export type PredefinedFormat = "combined" | "common" | "dev" | "short" | "tiny";

/**
 * Custom format function for request logging.
 *
 * @param req The Express request object.
 * @param res The Express response object.
 * @param responseTime The response time in milliseconds.
 * @returns A string message or an object with structured properties.
 * @since 1.3.0
 */
export type FormatFunction = (
  req: ExpressRequest,
  res: ExpressResponse,
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
  /** HTTP response status code */
  status: number;
  /** Response time in milliseconds */
  responseTime: number;
  /** Response content-length header value */
  contentLength: string | undefined;
  /** Remote client address */
  remoteAddr: string | undefined;
  /** User-Agent header value */
  userAgent: string | undefined;
  /** Referrer header value */
  referrer: string | undefined;
  /** HTTP version (e.g., "1.1") */
  httpVersion: string;
}

/**
 * Options for configuring the Express LogTape middleware.
 * @since 1.3.0
 */
export interface ExpressLogTapeOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["express"]
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
   * @example Skip logging for successful requests
   * ```typescript
   * app.use(expressLogger({
   *   skip: (req, res) => res.statusCode < 400,
   * }));
   * ```
   *
   * @default () => false
   */
  readonly skip?: (req: ExpressRequest, res: ExpressResponse) => boolean;

  /**
   * If `true`, logs are written immediately when the request is received.
   * If `false` (default), logs are written after the response is sent.
   *
   * Note: When `immediate` is `true`, response-related properties
   * (status, responseTime, contentLength) will not be available.
   *
   * @default false
   */
  readonly immediate?: boolean;
}

/**
 * Get remote address from request.
 */
function getRemoteAddr(req: ExpressRequest): string | undefined {
  return req.ip || req.socket?.remoteAddress;
}

/**
 * Get content length from response headers.
 */
function getContentLength(res: ExpressResponse): string | undefined {
  const contentLength = res.getHeader("content-length");
  if (contentLength === undefined || contentLength === null) return undefined;
  return String(contentLength);
}

/**
 * Get referrer from request headers.
 */
function getReferrer(req: ExpressRequest): string | undefined {
  return req.get("referrer") || req.get("referer");
}

/**
 * Get user agent from request headers.
 */
function getUserAgent(req: ExpressRequest): string | undefined {
  return req.get("user-agent");
}

/**
 * Build structured log properties from request/response.
 */
function buildProperties(
  req: ExpressRequest,
  res: ExpressResponse,
  responseTime: number,
): RequestLogProperties {
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    status: res.statusCode,
    responseTime,
    contentLength: getContentLength(res),
    remoteAddr: getRemoteAddr(req),
    userAgent: getUserAgent(req),
    referrer: getReferrer(req),
    httpVersion: req.httpVersion,
  };
}

/**
 * Combined format (Apache Combined Log Format).
 * Returns all structured properties.
 */
function formatCombined(
  req: ExpressRequest,
  res: ExpressResponse,
  responseTime: number,
): Record<string, unknown> {
  return { ...buildProperties(req, res, responseTime) };
}

/**
 * Common format (Apache Common Log Format).
 * Like combined but without referrer and userAgent.
 */
function formatCommon(
  req: ExpressRequest,
  res: ExpressResponse,
  responseTime: number,
): Record<string, unknown> {
  const props = buildProperties(req, res, responseTime);
  const { referrer: _referrer, userAgent: _userAgent, ...rest } = props;
  return rest;
}

/**
 * Dev format (colored output for development).
 * :method :url :status :response-time ms - :res[content-length]
 */
function formatDev(
  req: ExpressRequest,
  res: ExpressResponse,
  responseTime: number,
): string {
  const contentLength = getContentLength(res) ?? "-";
  return `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${
    responseTime.toFixed(3)
  } ms - ${contentLength}`;
}

/**
 * Short format.
 * :remote-addr :method :url HTTP/:http-version :status :res[content-length] - :response-time ms
 */
function formatShort(
  req: ExpressRequest,
  res: ExpressResponse,
  responseTime: number,
): string {
  const remoteAddr = getRemoteAddr(req) ?? "-";
  const contentLength = getContentLength(res) ?? "-";
  return `${remoteAddr} ${req.method} ${
    req.originalUrl || req.url
  } HTTP/${req.httpVersion} ${res.statusCode} ${contentLength} - ${
    responseTime.toFixed(3)
  } ms`;
}

/**
 * Tiny format (minimal output).
 * :method :url :status :res[content-length] - :response-time ms
 */
function formatTiny(
  req: ExpressRequest,
  res: ExpressResponse,
  responseTime: number,
): string {
  const contentLength = getContentLength(res) ?? "-";
  return `${req.method} ${
    req.originalUrl || req.url
  } ${res.statusCode} ${contentLength} - ${responseTime.toFixed(3)} ms`;
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
 * Creates Express middleware for HTTP request logging using LogTape.
 *
 * This middleware provides Morgan-compatible request logging with LogTape
 * as the backend, supporting structured logging and customizable formats.
 *
 * @example Basic usage
 * ```typescript
 * import express from "express";
 * import { configure, getConsoleSink } from "@logtape/logtape";
 * import { expressLogger } from "@logtape/express";
 *
 * await configure({
 *   sinks: { console: getConsoleSink() },
 *   loggers: [
 *     { category: ["express"], sinks: ["console"], lowestLevel: "info" }
 *   ],
 * });
 *
 * const app = express();
 * app.use(expressLogger());
 *
 * app.get("/", (req, res) => {
 *   res.json({ hello: "world" });
 * });
 *
 * app.listen(3000);
 * ```
 *
 * @example With custom options
 * ```typescript
 * app.use(expressLogger({
 *   category: ["myapp", "http"],
 *   level: "debug",
 *   format: "dev",
 *   skip: (req, res) => res.statusCode < 400,
 * }));
 * ```
 *
 * @example With custom format function
 * ```typescript
 * app.use(expressLogger({
 *   format: (req, res, responseTime) => ({
 *     method: req.method,
 *     path: req.path,
 *     status: res.statusCode,
 *     duration: responseTime,
 *   }),
 * }));
 * ```
 *
 * @param options Configuration options for the middleware.
 * @returns Express middleware function.
 * @since 1.3.0
 */
export function expressLogger(
  options: ExpressLogTapeOptions = {},
): ExpressMiddleware {
  const category = normalizeCategory(options.category ?? ["express"]);
  const logger = getLogger(category);
  const level = options.level ?? "info";
  const formatOption = options.format ?? "combined";
  const skip = options.skip ?? (() => false);
  const immediate = options.immediate ?? false;

  // Resolve format function
  const formatFn: FormatFunction = typeof formatOption === "string"
    ? predefinedFormats[formatOption]
    : formatOption;

  const logMethod = logger[level].bind(logger);

  return (
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction,
  ): void => {
    const startTime = Date.now();

    // For immediate logging, log when request arrives
    if (immediate) {
      if (!skip(req, res)) {
        const result = formatFn(req, res, 0);
        if (typeof result === "string") {
          logMethod(result);
        } else {
          logMethod("{method} {url}", result);
        }
      }
      next();
      return;
    }

    // Log after response is sent
    const logRequest = (): void => {
      if (skip(req, res)) return;

      const responseTime = Date.now() - startTime;
      const result = formatFn(req, res, responseTime);

      if (typeof result === "string") {
        logMethod(result);
      } else {
        logMethod("{method} {url} {status} - {responseTime} ms", result);
      }
    };

    // Listen for response finish event
    res.on("finish", logRequest);

    next();
  };
}
