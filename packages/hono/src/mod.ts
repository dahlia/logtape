import { getLogger, type LogLevel, withContext } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";

export type { LogLevel } from "@logtape/logtape";

/**
 * Hono context interface exposed to custom formatters and skip callbacks.
 *
 * This matches the actual runtime object passed to the middleware, so custom
 * formatters can access context variables via methods like `c.get()` when
 * needed.
 * @since 1.3.0
 */
// deno-lint-ignore no-explicit-any
export interface HonoContext extends Context<any, any, any> {}

/**
 * Predefined log format names.
 * @since 1.3.0
 */
export type PredefinedFormat =
  /**
   * @deprecated Use `"structured-combined"` instead.
   */
  | "combined"
  /**
   * @deprecated Use `"structured-common"` instead.
   */
  | "common"
  | "structured-combined"
  | "structured-common"
  | "morgan-combined"
  | "morgan-common"
  | "dev"
  | "short"
  | "tiny";

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
 * Request fields that can be added to the implicit request context.
 * @since 2.2.0
 */
export type RequestContextField =
  | "requestId"
  | "method"
  | "url"
  | "path"
  | "userAgent"
  | "remoteAddr"
  | "referrer";

/**
 * Options for extracting, generating, and propagating a request ID.
 * @since 2.2.0
 */
export interface RequestIdOptions {
  /**
   * The property name used in implicit context and request log records.
   * @default "requestId"
   */
  readonly property?: string;

  /**
   * Incoming request headers to inspect in order.
   * @default ["x-request-id"]
   */
  readonly headerNames?: readonly string[];

  /**
   * Response header that receives the resolved request ID.
   * Set to `false` to disable response header propagation.
   * @default "x-request-id"
   */
  readonly responseHeader?: string | false;

  /**
   * Generates a request ID when no incoming header is present.
   * @default crypto.randomUUID()
   */
  readonly generate?: () => string;

  /**
   * Normalizes an incoming request ID.  Return `null` to reject the value and
   * keep looking for another header or generate a new ID.
   */
  readonly normalize?: (value: string) => string | null;
}

/**
 * Options for request-scoped implicit context.
 * @since 2.2.0
 */
export interface RequestContextOptions {
  /**
   * Enables request ID extraction, generation, and response propagation.
   * @default true
   */
  readonly requestId?: boolean | RequestIdOptions;

  /**
   * Fields to add to the implicit context.
   * @default ["requestId"]
   */
  readonly include?: readonly RequestContextField[];

  /**
   * Adds application-specific fields to the implicit request context.
   */
  readonly enrich?: (
    c: HonoContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
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
   * Structured formats:
   * - `"structured-combined"` - Structured request properties (default)
   * - `"structured-common"` - Structured request properties without
   *   referrer/userAgent
   * - `"combined"` - Deprecated alias for `"structured-combined"`
   * - `"common"` - Deprecated alias for `"structured-common"`
   *
   * Text formats:
   * - `"morgan-combined"` - Morgan-compatible combined access log (string)
   * - `"morgan-common"` - Morgan-compatible common access log (string)
   * - `"dev"` - Concise colored output for development (string)
   * - `"short"` - Shorter than common (string)
   * - `"tiny"` - Minimal output (string)
   *
   * @default "structured-combined"
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

  /**
   * Enables request-scoped implicit context and request ID correlation.
   *
   * When set to `true`, the middleware reads the `x-request-id` header,
   * generates one when it is absent, writes it to the `x-request-id` response
   * header, and adds `requestId` to all LogTape records emitted while handling
   * the request.
   *
   * @default false
   * @since 2.2.0
   */
  readonly context?: boolean | RequestContextOptions;
}

const defaultRequestIdHeader = "x-request-id";

interface ResolvedRequestId {
  readonly property: string;
  readonly value: string;
  readonly responseHeader?: string;
}

interface HonoRequestContextState {
  readonly context: Record<string, unknown>;
  readonly responseHeader?: {
    readonly name: string;
    readonly value: string;
  };
}

/**
 * Normalize request context options.
 */
function normalizeRequestContextOptions(
  options: boolean | RequestContextOptions | undefined,
): RequestContextOptions | undefined {
  if (options === true) return {};
  if (options === false || options == null) return undefined;
  return options;
}

/**
 * Normalize request ID options.
 */
function normalizeRequestIdOptions(
  options: boolean | RequestIdOptions | undefined,
): RequestIdOptions | undefined {
  if (options === false) return undefined;
  if (options === true || options == null) return {};
  return options;
}

/**
 * Generate a request ID with Web Crypto when possible.
 */
function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Normalize an incoming request ID.
 */
function defaultNormalizeRequestId(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Resolve the request ID for a request.
 */
function resolveRequestId(
  c: HonoContext,
  options: RequestIdOptions,
): ResolvedRequestId {
  const property = options.property ?? "requestId";
  const normalize = options.normalize ?? defaultNormalizeRequestId;
  const headerNames = options.headerNames ?? [defaultRequestIdHeader];
  for (const headerName of headerNames) {
    const headerValue = c.req.header(headerName);
    if (headerValue == null) continue;
    const normalized = normalize(headerValue);
    if (normalized != null) {
      const responseHeader = options.responseHeader ?? defaultRequestIdHeader;
      return {
        property,
        value: normalized,
        responseHeader: responseHeader === false ? undefined : responseHeader,
      };
    }
  }
  const generated = (options.generate ?? generateRequestId)();
  const responseHeader = options.responseHeader ?? defaultRequestIdHeader;
  return {
    property,
    value: generated,
    responseHeader: responseHeader === false ? undefined : responseHeader,
  };
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
 * Get remote address from X-Forwarded-For header.
 */
function getRemoteAddr(c: HonoContext): string | undefined {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded == null) return undefined;
  const firstIp = forwarded.split(",")[0].trim();
  return firstIp || undefined;
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
 * Build request context fields from a request.
 */
function buildIncludedContext(
  c: HonoContext,
  resolvedRequestId: ResolvedRequestId | undefined,
  include: readonly RequestContextField[],
): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (const field of include) {
    switch (field) {
      case "requestId":
        if (resolvedRequestId != null) {
          context[resolvedRequestId.property] = resolvedRequestId.value;
        }
        break;
      case "method":
        context.method = c.req.method;
        break;
      case "url":
        context.url = c.req.url;
        break;
      case "path":
        context.path = c.req.path;
        break;
      case "userAgent":
        context.userAgent = getUserAgent(c);
        break;
      case "remoteAddr":
        context.remoteAddr = getRemoteAddr(c);
        break;
      case "referrer":
        context.referrer = getReferrer(c);
        break;
    }
  }
  return context;
}

/**
 * Build the implicit context for a request.
 */
async function buildRequestContext(
  c: HonoContext,
  options: RequestContextOptions,
): Promise<HonoRequestContextState> {
  const requestIdOptions = normalizeRequestIdOptions(options.requestId);
  const resolvedRequestId = requestIdOptions == null
    ? undefined
    : resolveRequestId(c, requestIdOptions);
  const include = options.include ??
    (resolvedRequestId == null ? [] : ["requestId"] as const);
  const context = buildIncludedContext(c, resolvedRequestId, include);
  if (options.enrich != null) Object.assign(context, await options.enrich(c));
  const responseHeader = resolvedRequestId?.responseHeader == null
    ? undefined
    : {
      name: resolvedRequestId.responseHeader,
      value: resolvedRequestId.value,
    };
  return { context, responseHeader };
}

/**
 * Apply deferred context response headers to the final Hono response.
 */
function applyResponseHeaders(
  c: HonoContext,
  requestContext: HonoRequestContextState,
): void {
  if (requestContext.responseHeader == null) return;
  try {
    c.header(
      requestContext.responseHeader.name,
      requestContext.responseHeader.value,
    );
  } catch {
    // Keep logging middleware from replacing the application's response.
  }
}

/**
 * Add request context fields to a request log result.
 */
function withRequestLogContext(
  result: string | Record<string, unknown>,
  context: Record<string, unknown>,
): string | Record<string, unknown> {
  if (typeof result === "string") return result;
  return { ...result, ...context };
}

const clfMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatClfDate(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  return `${pad2(date.getUTCDate())}/${
    clfMonths[date.getUTCMonth()]
  }/${date.getUTCFullYear()}:${pad2(date.getUTCHours())}:${
    pad2(date.getUTCMinutes())
  }:${pad2(date.getUTCSeconds())} +0000`;
}

function escapeAccessLogValue(value: unknown, escapeSpaces: boolean): string {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return escapeSpaces ? escaped.replace(/ /g, "\\x20") : escaped;
}

function formatAccessLogToken(value: unknown): string {
  if (value == null || value === "") return "-";
  return escapeAccessLogValue(value, true);
}

function formatAccessLogQuotedToken(value: unknown): string {
  if (value == null || value === "") return '"-"';
  return `"${escapeAccessLogValue(value, false)}"`;
}

function getRemoteUser(c: HonoContext): string | undefined {
  const authorization = c.req.header("authorization");
  if (authorization == null) return undefined;
  const match = /^Basic\s+(.+)$/i.exec(authorization);
  if (match == null || typeof globalThis.atob !== "function") {
    return undefined;
  }
  try {
    const decoded = globalThis.atob(match[1]);
    const colonIndex = decoded.indexOf(":");
    const user = colonIndex < 0 ? decoded : decoded.slice(0, colonIndex);
    return user === "" ? undefined : user;
  } catch {
    return undefined;
  }
}

function getRequestTarget(c: HonoContext): string {
  const url = new URL(c.req.url, "http://localhost");
  return `${url.pathname}${url.search}`;
}

/**
 * Structured combined format.
 * Returns all structured properties.
 */
function formatCombined(
  c: HonoContext,
  responseTime: number,
): Record<string, unknown> {
  return { ...buildProperties(c, responseTime) };
}

/**
 * Structured common format.
 * Like structured combined but without referrer and userAgent.
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
 * Morgan combined format.
 * :remote-addr - :remote-user [:date[clf]]
 * ":method :url HTTP/:http-version" :status :res[content-length]
 * ":referrer" ":user-agent"
 */
function formatMorganCombined(c: HonoContext): string {
  return `${formatAccessLogToken(getRemoteAddr(c))} - ${
    formatAccessLogToken(getRemoteUser(c))
  } [${formatClfDate()}] "${formatAccessLogToken(c.req.method)} ${
    formatAccessLogToken(getRequestTarget(c))
  } HTTP/-" ${formatAccessLogToken(c.res.status)} ${
    formatAccessLogToken(getContentLength(c))
  } ${formatAccessLogQuotedToken(getReferrer(c))} ${
    formatAccessLogQuotedToken(getUserAgent(c))
  }`;
}

/**
 * Morgan common format.
 * :remote-addr - :remote-user [:date[clf]]
 * ":method :url HTTP/:http-version" :status :res[content-length]
 */
function formatMorganCommon(c: HonoContext): string {
  return `${formatAccessLogToken(getRemoteAddr(c))} - ${
    formatAccessLogToken(getRemoteUser(c))
  } [${formatClfDate()}] "${formatAccessLogToken(c.req.method)} ${
    formatAccessLogToken(getRequestTarget(c))
  } HTTP/-" ${formatAccessLogToken(c.res.status)} ${
    formatAccessLogToken(getContentLength(c))
  }`;
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
  "structured-combined": formatCombined,
  "structured-common": formatCommon,
  "morgan-combined": formatMorganCombined,
  "morgan-common": formatMorganCommon,
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
  const formatOption = options.format ?? "structured-combined";
  const skip = options.skip ?? (() => false);
  const logRequest = options.logRequest ?? false;
  const contextOptions = normalizeRequestContextOptions(options.context);

  // Resolve format function
  const formatFn: FormatFunction = typeof formatOption === "string"
    ? predefinedFormats[formatOption]
    : formatOption;

  const logMethod = logger[level].bind(logger);

  return createMiddleware(async (c, next) => {
    const startTime = Date.now();
    const honoContext = c as unknown as HonoContext;

    const handleRequest = async (
      requestContextState: HonoRequestContextState,
    ): Promise<void> => {
      const requestContext = requestContextState.context;
      applyResponseHeaders(honoContext, requestContextState);
      // For immediate logging, log when request arrives
      if (logRequest) {
        if (!skip(honoContext)) {
          const result = withRequestLogContext(
            formatFn(honoContext, 0),
            requestContext,
          );
          if (typeof result === "string") {
            logMethod(result, requestContext);
          } else {
            logMethod("{method} {url}", result);
          }
        }
        await next();
        applyResponseHeaders(honoContext, requestContextState);
        return;
      }

      // Log after response is sent
      await next();
      applyResponseHeaders(honoContext, requestContextState);

      if (skip(honoContext)) return;

      const responseTime = Date.now() - startTime;
      const result = withRequestLogContext(
        formatFn(honoContext, responseTime),
        requestContext,
      );

      if (typeof result === "string") {
        logMethod(result, requestContext);
      } else {
        logMethod("{method} {url} {status} - {responseTime} ms", result);
      }
    };

    if (contextOptions == null) {
      await handleRequest({ context: {} });
      return;
    }

    const requestContextState = await buildRequestContext(
      honoContext,
      contextOptions,
    );
    await withContext(
      requestContextState.context,
      () => handleRequest(requestContextState),
    );
  });
}
