import { getLogger, type LogLevel } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";

export type { LogLevel } from "@logtape/logtape";

/**
 * Buffer size used when reading a byte-stream response body through the
 * wrapper while the consumer is not using a BYOB reader.
 */
const byobBufferSize = 16 * 1024;

/**
 * Copies the metadata that the `Response` constructor cannot set (`url`,
 * `type`, and `redirected`) from a response onto its reconstructed wrapper.
 * Some runtimes make responses non-extensible, so failures are ignored.
 */
function copyResponseMetadata(source: Response, target: Response): void {
  for (const key of ["url", "type", "redirected"] as const) {
    const value = source[key];
    if (value === target[key]) continue;
    try {
      Object.defineProperty(target, key, { value, configurable: true });
    } catch {
      // Leave the default value when the runtime forbids redefinition.
    }
  }
}

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
 * When `logRequest` is `false` (the default), the request is logged once the
 * response body stream has completed, errored, or been cancelled, so the
 * reported `responseTime` spans streamed responses.  Register `honoLogger()`
 * before any middleware that may replace `c.res` after the chain returns, and
 * make sure the response body is consumed (as a real HTTP server does);
 * a `Response` whose body is dropped without being read or cancelled is never
 * logged.  Wrapping the body also means responses are sent as streams, so
 * runtime-generated `Content-Length` framing is not preserved.
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
  const metaLogger = getLogger(["logtape", "meta"]);

  // Resolve format function
  const formatFn: FormatFunction = typeof formatOption === "string"
    ? predefinedFormats[formatOption]
    : formatOption;

  const logMethod = logger[level].bind(logger);

  return createMiddleware(async (c, next) => {
    const context = c as unknown as HonoContext;
    const startTime = Date.now();
    let finished = false;

    // Logs the request exactly once.  A formatter or logging failure must
    // never alter the response or crash the application, so it is reported
    // to the meta logger instead.
    const logSafely = (responseTime: number, template: string): void => {
      if (finished) return;
      finished = true;
      try {
        const result = formatFn(context, responseTime);
        if (typeof result === "string") {
          logMethod(result);
        } else {
          logMethod(template, result);
        }
      } catch (error) {
        try {
          metaLogger.error("Failed to log a Hono request: {error}", { error });
        } catch {
          // Last resort: logging must never affect the response.
        }
      }
    };

    // For immediate logging, log when request arrives
    if (logRequest) {
      if (!skip(context)) logSafely(0, "{method} {url}");
      await next();
      return;
    }

    await next();

    if (skip(context)) return;

    const logResponse = (): void => {
      logSafely(
        Date.now() - startTime,
        "{method} {url} {status} - {responseTime} ms",
      );
    };

    // Hono runs the GET handler for a HEAD request but discards its body once
    // the middleware chain completes, so the body can never be observed.
    if (context.req.method === "HEAD") {
      logResponse();
      return;
    }

    const response = c.res;
    const body = response.body;

    // A null or already-locked body cannot be wrapped without breaking the
    // response, so its completion is treated as immediate.
    if (body == null || body.locked) {
      logResponse();
      return;
    }

    // A streamed body completes after this middleware returns.  Chaining the
    // log onto a promise resolved on completion keeps it inside the implicit
    // LogTape context that is active here, even though the continuation runs
    // later in the server's context.
    let resolveFinished!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    void completion.then(logResponse);
    const complete = (): void => {
      resolveFinished();
    };

    // A non-byte source keeps default-stream semantics (zero-length chunks and
    // chunk buffers shared between queued chunks are both valid there), so it
    // is wrapped with a default controller.
    let supportsByob = false;
    try {
      body.getReader({ mode: "byob" }).releaseLock();
      supportsByob = true;
    } catch {
      // Not a byte stream.
    }

    if (!supportsByob) {
      const reader = body.getReader();
      let reading = false;
      let sourceClosed = false;
      let pendingError: { value: unknown } | undefined;
      let wrapperFinished = false;
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

      // Finalizes once, before signalling completion so the log record is
      // written before a consumer observes the stream ending.
      const finish = (action: () => void): void => {
        if (wrapperFinished) return;
        wrapperFinished = true;
        complete();
        action();
      };
      // `closed` resolves once the source queue has been drained, so observing
      // it lets an idle consumer that awaits `reader.closed` finish without an
      // extra `read()`.  A rejection means the source errored; an in-flight
      // read is allowed to drain a final chunk first, then the error is
      // propagated.
      const closeWhenIdle = (): void => {
        if (!sourceClosed || wrapperFinished || reading) return;
        finish(() => controller?.close());
      };
      const errorWhenIdle = (error: unknown): void => {
        if (wrapperFinished) return;
        if (reading) {
          pendingError = { value: error };
          return;
        }
        finish(() => controller?.error(error));
      };
      void reader.closed.then(
        () => {
          sourceClosed = true;
          closeWhenIdle();
        },
        (error: unknown) => errorWhenIdle(error),
      );

      const wrapped = new ReadableStream<Uint8Array>({
        start(ctrl) {
          controller = ctrl;
        },
        async pull(ctrl) {
          controller = ctrl;
          reading = true;
          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await reader.read();
          } catch (error) {
            reading = false;
            finish(() => ctrl.error(error));
            return;
          }
          reading = false;
          if (wrapperFinished) return;
          if (pendingError !== undefined) {
            if (!result.done) ctrl.enqueue(result.value);
            const error = pendingError.value;
            pendingError = undefined;
            finish(() => ctrl.error(error));
            return;
          }
          if (result.done) {
            finish(() => ctrl.close());
          } else {
            ctrl.enqueue(result.value);
            closeWhenIdle();
          }
        },
        cancel(reason) {
          finish(() => {});
          return reader.cancel(reason);
        },
      }, { highWaterMark: 0 });
      c.res = new Response(wrapped, response);
      copyResponseMetadata(response, c.res);
      return;
    }

    // A byte source is wrapped with a byte controller so BYOB consumers keep
    // working.  The source is read with the same strategy the consumer uses: a
    // BYOB consumer drives a BYOB source reader (so producers that only respond
    // to BYOB requests make progress), while a default consumer drives a
    // default source reader (so producers that close without responding to a
    // BYOB request keep working).  The source reader is switched if the
    // consumer changes strategy mid-stream.
    let sourceReader:
      | ReadableStreamDefaultReader<Uint8Array>
      | ReadableStreamBYOBReader
      | undefined;
    let sourceIsByob = false;
    let reading = false;
    let sourceClosed = false;
    let pendingError: { value: unknown } | undefined;
    let wrapperFinished = false;
    let controller: ReadableByteStreamController | undefined;

    const finish = (action: () => void): void => {
      if (wrapperFinished) return;
      wrapperFinished = true;
      complete();
      action();
    };
    const closeWhenIdle = (): void => {
      if (!sourceClosed || wrapperFinished || reading) return;
      finish(() => {
        controller?.close();
        controller?.byobRequest?.respond(0);
      });
    };
    const errorWhenIdle = (error: unknown): void => {
      if (wrapperFinished) return;
      if (reading) {
        pendingError = { value: error };
        return;
      }
      finish(() => controller?.error(error));
    };
    const observeReader = (
      reader:
        | ReadableStreamDefaultReader<Uint8Array>
        | ReadableStreamBYOBReader,
    ): void => {
      void reader.closed.then(
        () => {
          if (sourceReader !== reader) return;
          sourceClosed = true;
          closeWhenIdle();
        },
        (error: unknown) => {
          if (sourceReader !== reader) return;
          errorWhenIdle(error);
        },
      );
    };
    const acquireReader = (byob: boolean): void => {
      sourceClosed = false;
      pendingError = undefined;
      if (byob) {
        try {
          sourceReader = body.getReader({ mode: "byob" });
          sourceIsByob = true;
          observeReader(sourceReader);
          return;
        } catch {
          // Fall back to a default reader below.
        }
      }
      sourceReader = body.getReader();
      sourceIsByob = false;
      observeReader(sourceReader);
    };

    // Acquire and observe a reader right away so termination before the first
    // pull is still propagated; the first pull switches the reader mode if the
    // consumer asks for BYOB.
    acquireReader(false);

    const wrapped = new ReadableStream({
      type: "bytes",
      start(ctrl: ReadableByteStreamController) {
        controller = ctrl;
      },
      async pull(ctrl: ReadableByteStreamController) {
        controller = ctrl;
        const request = ctrl.byobRequest;
        const wantByob = request != null;
        if (sourceReader == null) {
          acquireReader(wantByob);
        } else if (wantByob !== sourceIsByob) {
          sourceReader.releaseLock();
          acquireReader(wantByob);
        }
        reading = true;
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = sourceIsByob
            ? await (sourceReader as ReadableStreamBYOBReader).read(
              new Uint8Array(request?.view?.byteLength ?? byobBufferSize),
            )
            : await (sourceReader as ReadableStreamDefaultReader<Uint8Array>)
              .read();
        } catch (error) {
          reading = false;
          finish(() => ctrl.error(error));
          return;
        }
        reading = false;
        if (wrapperFinished) return;
        if (pendingError !== undefined) {
          if (!result.done) ctrl.enqueue(result.value);
          const error = pendingError.value;
          pendingError = undefined;
          finish(() => ctrl.error(error));
          return;
        }
        if (result.done) {
          finish(() => {
            ctrl.close();
            ctrl.byobRequest?.respond(0);
          });
          return;
        }
        ctrl.enqueue(result.value);
        closeWhenIdle();
      },
      cancel(reason) {
        finish(() => {});
        const reader = sourceReader;
        return reader == null ? body.cancel(reason) : reader.cancel(reason);
      },
    }, { highWaterMark: 0 });

    c.res = new Response(wrapped, response);
    copyResponseMetadata(response, c.res);
  });
}
