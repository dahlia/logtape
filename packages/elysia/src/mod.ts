import { Elysia } from "elysia";
import { getLogger, type LogLevel } from "@logtape/logtape";

export type { LogLevel } from "@logtape/logtape";

/**
 * Minimal Elysia Context interface for compatibility.
 * @since 1.4.0
 */
export interface ElysiaContext {
  request: Request;
  path: string;
  set: {
    status: number;
    headers: Record<string, string | undefined>;
  };
}

/**
 * Plugin scope options for controlling hook propagation.
 * @since 1.4.0
 */
export type PluginScope = "global" | "scoped" | "local";

/**
 * Predefined log format names compatible with Morgan.
 * @since 1.4.0
 */
export type PredefinedFormat = "combined" | "common" | "dev" | "short" | "tiny";

/**
 * Custom format function for request logging.
 *
 * @param ctx The Elysia context object.
 * @param responseTime The response time in milliseconds.
 * @returns A string message or an object with structured properties.
 * @since 1.4.0
 */
export type FormatFunction = (
  ctx: ElysiaContext,
  responseTime: number,
) => string | Record<string, unknown>;

/**
 * Structured log properties for HTTP requests.
 * @since 1.4.0
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
  /** Remote client address (from X-Forwarded-For header) */
  remoteAddr: string | undefined;
  /** User-Agent header value */
  userAgent: string | undefined;
  /** Referrer header value */
  referrer: string | undefined;
}

/**
 * Options for configuring the Elysia LogTape middleware.
 * @since 1.4.0
 */
export interface ElysiaLogTapeOptions {
  /**
   * The LogTape category to use for logging.
   * @default ["elysia"]
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
   * app.use(elysiaLogger({
   *   skip: (ctx) => ctx.path === "/health",
   * }));
   * ```
   *
   * @default () => false
   */
  readonly skip?: (ctx: ElysiaContext) => boolean;

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

  /**
   * The plugin scope for controlling how lifecycle hooks are propagated.
   *
   * - `"global"` - Hooks apply to all routes in the application
   * - `"scoped"` - Hooks apply to the parent instance where the plugin is used
   * - `"local"` - Hooks only apply within the plugin itself
   *
   * @default "global"
   */
  readonly scope?: PluginScope;
}

/**
 * Get referrer from request headers.
 */
function getReferrer(request: Request): string | undefined {
  return request.headers.get("referrer") ??
    request.headers.get("referer") ??
    undefined;
}

/**
 * Get user agent from request headers.
 */
function getUserAgent(request: Request): string | undefined {
  return request.headers.get("user-agent") ?? undefined;
}

/**
 * Get remote address from X-Forwarded-For header.
 */
function getRemoteAddr(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const firstIp = forwarded.split(",")[0].trim();
    return firstIp || undefined;
  }
  return undefined;
}

/**
 * Get content length from response headers.
 */
function getContentLength(
  headers: Record<string, string | undefined>,
): string | undefined {
  const contentLength = headers["content-length"];
  if (contentLength === undefined || contentLength === null) return undefined;
  return contentLength;
}

/**
 * Build structured log properties from context.
 */
function buildProperties(
  ctx: ElysiaContext,
  responseTime: number,
): RequestLogProperties {
  return {
    method: ctx.request.method,
    url: ctx.request.url,
    path: ctx.path,
    status: ctx.set.status,
    responseTime,
    contentLength: getContentLength(ctx.set.headers),
    remoteAddr: getRemoteAddr(ctx.request),
    userAgent: getUserAgent(ctx.request),
    referrer: getReferrer(ctx.request),
  };
}

/**
 * Combined format (Apache Combined Log Format).
 * Returns all structured properties.
 */
function formatCombined(
  ctx: ElysiaContext,
  responseTime: number,
): Record<string, unknown> {
  return { ...buildProperties(ctx, responseTime) };
}

/**
 * Common format (Apache Common Log Format).
 * Like combined but without referrer and userAgent.
 */
function formatCommon(
  ctx: ElysiaContext,
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
function formatDev(ctx: ElysiaContext, responseTime: number): string {
  const contentLength = getContentLength(ctx.set.headers) ?? "-";
  return `${ctx.request.method} ${ctx.path} ${ctx.set.status} ${
    responseTime.toFixed(3)
  } ms - ${contentLength}`;
}

/**
 * Short format.
 * :remote-addr :method :url :status :res[content-length] - :response-time ms
 */
function formatShort(ctx: ElysiaContext, responseTime: number): string {
  const remoteAddr = getRemoteAddr(ctx.request) ?? "-";
  const contentLength = getContentLength(ctx.set.headers) ?? "-";
  return `${remoteAddr} ${ctx.request.method} ${ctx.request.url} ${ctx.set.status} ${contentLength} - ${
    responseTime.toFixed(3)
  } ms`;
}

/**
 * Tiny format (minimal output).
 * :method :path :status :res[content-length] - :response-time ms
 */
function formatTiny(ctx: ElysiaContext, responseTime: number): string {
  const contentLength = getContentLength(ctx.set.headers) ?? "-";
  return `${ctx.request.method} ${ctx.path} ${ctx.set.status} ${contentLength} - ${
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
 * Mapping of Elysia error codes to HTTP status codes.
 */
const errorCodeToStatus: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  PARSE: 400,
  INTERNAL_SERVER_ERROR: 500,
  INVALID_COOKIE_SIGNATURE: 400,
  UNKNOWN: 500,
};

/**
 * Get the HTTP status code from an error context.
 * Checks error.status first, then falls back to error code mapping.
 */
function getErrorStatus(
  code: string | number,
  error: unknown,
  setStatus: number,
): number {
  // If code is already a number, use it as status
  if (typeof code === "number") {
    return code;
  }
  // Check if error has a status property (Elysia custom errors)
  if (
    error != null &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  // Fall back to error code mapping
  if (code in errorCodeToStatus) {
    return errorCodeToStatus[code];
  }
  // Use set.status as last resort
  return setStatus;
}

/**
 * Internal store type for timing.
 */
interface LoggerStore {
  startTime: number;
}

/**
 * Creates Elysia plugin for HTTP request logging using LogTape.
 *
 * This plugin provides Morgan-compatible request logging with LogTape
 * as the backend, supporting structured logging and customizable formats.
 *
 * @example Basic usage
 * ```typescript
 * import { Elysia } from "elysia";
 * import { configure, getConsoleSink } from "@logtape/logtape";
 * import { elysiaLogger } from "@logtape/elysia";
 *
 * await configure({
 *   sinks: { console: getConsoleSink() },
 *   loggers: [
 *     { category: ["elysia"], sinks: ["console"], lowestLevel: "info" }
 *   ],
 * });
 *
 * const app = new Elysia()
 *   .use(elysiaLogger())
 *   .get("/", () => ({ hello: "world" }))
 *   .listen(3000);
 * ```
 *
 * @example With custom options
 * ```typescript
 * app.use(elysiaLogger({
 *   category: ["myapp", "http"],
 *   level: "debug",
 *   format: "dev",
 *   skip: (ctx) => ctx.path === "/health",
 *   scope: "scoped",
 * }));
 * ```
 *
 * @example With custom format function
 * ```typescript
 * app.use(elysiaLogger({
 *   format: (ctx, responseTime) => ({
 *     method: ctx.request.method,
 *     path: ctx.path,
 *     status: ctx.set.status,
 *     duration: responseTime,
 *   }),
 * }));
 * ```
 *
 * @param options Configuration options for the plugin.
 * @returns Elysia plugin instance.
 * @since 1.4.0
 */
// deno-lint-ignore no-explicit-any
export function elysiaLogger(options: ElysiaLogTapeOptions = {}): Elysia<any> {
  const category = normalizeCategory(options.category ?? ["elysia"]);
  const logger = getLogger(category);
  const level = options.level ?? "info";
  const formatOption = options.format ?? "combined";
  const skip = options.skip ?? (() => false);
  const logRequest = options.logRequest ?? false;
  const scope = options.scope ?? "global";

  // Resolve format function
  const formatFn: FormatFunction = typeof formatOption === "string"
    ? predefinedFormats[formatOption]
    : formatOption;

  const logMethod = logger[level].bind(logger);
  const errorLogMethod = logger.error.bind(logger);

  let plugin = new Elysia({
    name: "@logtape/elysia",
    seed: options,
  })
    .state("startTime", 0)
    .onRequest(({ store }) => {
      (store as LoggerStore).startTime = performance.now();
    });

  if (logRequest) {
    // Log immediately when request arrives
    plugin = plugin.onRequest((ctx) => {
      if (!skip(ctx as unknown as ElysiaContext)) {
        const result = formatFn(ctx as unknown as ElysiaContext, 0);
        if (typeof result === "string") {
          logMethod(result);
        } else {
          logMethod("{method} {url}", result);
        }
      }
    });
  } else {
    // Log after handler completes
    plugin = plugin.onAfterHandle((ctx) => {
      if (skip(ctx as unknown as ElysiaContext)) return;

      const store = ctx.store as LoggerStore;
      const responseTime = performance.now() - store.startTime;
      const result = formatFn(ctx as unknown as ElysiaContext, responseTime);

      if (typeof result === "string") {
        logMethod(result);
      } else {
        logMethod("{method} {url} {status} - {responseTime} ms", result);
      }
    });
  }

  // Add error logging
  plugin = plugin.onError((ctx) => {
    const store = ctx.store as LoggerStore;
    const responseTime = performance.now() - store.startTime;
    const elysiaCtx = ctx as unknown as ElysiaContext;

    if (skip(elysiaCtx)) return;

    const props = buildProperties(elysiaCtx, responseTime);
    // Get the correct HTTP status code from error context
    const status = getErrorStatus(ctx.code, ctx.error, elysiaCtx.set.status);
    // Extract error message safely
    const error = ctx.error as { message?: string } | undefined;
    const errorMessage = error?.message ?? "Unknown error";
    errorLogMethod(
      "Error: {method} {url} {status} - {responseTime} ms - {errorMessage}",
      {
        ...props,
        status,
        errorMessage,
        errorCode: ctx.code,
      },
    );
  });

  // Apply scope
  if (scope === "global") {
    // deno-lint-ignore no-explicit-any
    return plugin.as("global") as unknown as Elysia<any>;
  } else if (scope === "scoped") {
    // deno-lint-ignore no-explicit-any
    return plugin.as("scoped") as unknown as Elysia<any>;
  }

  // deno-lint-ignore no-explicit-any
  return plugin as unknown as Elysia<any>;
}
