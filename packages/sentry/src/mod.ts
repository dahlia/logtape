import { getLogger, type LogLevel, type LogRecord, type Sink } from "@logtape/logtape";
import type {
  LogSeverityLevel,
  ParameterizedString,
  SeverityLevel,
} from "@sentry/core";
// Import namespace to safely check for public logger API (added in v9.41.0)
import * as SentryCore from "@sentry/core";
import {
  captureException as globalCaptureException,
  captureMessage as globalCaptureMessage,
  getActiveSpan as globalGetActiveSpan,
  getClient as globalGetClient,
  getIsolationScope as globalGetIsolationScope,
} from "@sentry/core";

/**
 * Converts a LogTape {@link LogRecord} into a Sentry {@link ParameterizedString}.
 *
 * This preserves the template structure for better message grouping in Sentry,
 * allowing similar messages with different values to be grouped together.
 *
 * @param record The log record to convert.
 * @returns A parameterized string with template and values.
 */
function getParameterizedString(record: LogRecord): ParameterizedString {
  let result = "";
  let tplString = "";
  const tplValues: string[] = [];
  for (let i = 0; i < record.message.length; i++) {
    if (i % 2 === 0) {
      result += record.message[i];
      tplString += String(record.message[i]).replaceAll("%", "%%");
    } else {
      const value = inspect(record.message[i]);
      result += value;
      tplString += `%s`;
      tplValues.push(value);
    }
  }
  const paramStr = new String(result) as ParameterizedString;
  paramStr.__sentry_template_string__ = tplString;
  paramStr.__sentry_template_values__ = tplValues;
  return paramStr;
}

/**
 * A platform-specific inspect function. In Deno, this is {@link Deno.inspect},
 * and in Node.js/Bun it is {@link util.inspect}. If neither is available, it
 * falls back to {@link JSON.stringify}.
 *
 * @param value The value to inspect.
 * @returns The string representation of the value.
 */
const inspect: (value: unknown) => string =
  // @ts-ignore: Deno global
  "Deno" in globalThis && "inspect" in globalThis.Deno &&
    // @ts-ignore: Deno global
    typeof globalThis.Deno.inspect === "function"
    // @ts-ignore: Deno global
    ? globalThis.Deno.inspect
    // @ts-ignore: Node.js global
    : "util" in globalThis && "inspect" in globalThis.util &&
        // @ts-ignore: Node.js global
        typeof globalThis.util.inspect === "function"
    // @ts-ignore: Node.js global
    ? globalThis.util.inspect
    : JSON.stringify;

// Level normalization helpers

function mapLevelForEvents(level: LogLevel): SeverityLevel {
  switch (level) {
    case "trace":
      return "debug";
    default:
      return level as SeverityLevel; // debug | info | error | fatal
  }
}

function mapLevelForLogs(level: LogLevel): LogSeverityLevel {
  switch (level) {
    case "trace":
      return "debug";
    case "warning":
      return "warn";
    case "debug":
    case "info":
    case "error":
    case "fatal":
      return level;
    default:
      return "info"; // fallback
  }
}

/**
 * A Sentry client instance type (used for v1.1.x backward compatibility).
 *
 * Client instances only support `captureMessage` and `captureException`.
 * For scope operations (breadcrumbs, user context, traces), the sink always
 * uses global functions from `@sentry/core`.
 *
 * @deprecated This is only used for backward compatibility with v1.1.x.
 * New code should use `getSentrySink()` without parameters, which automatically
 * uses Sentry's global functions.
 *
 * @since 1.3.0
 */
export interface SentryInstance {
  captureMessage: (
    message: string,
    captureContext?: SeverityLevel | unknown,
  ) => string;
  captureException: (exception: unknown, hint?: unknown) => string;
}

/**
 * Options for configuring the Sentry sink.
 * @since 1.3.0
 */
export interface SentrySinkOptions {
  /**
   * Enable automatic breadcrumb creation for log events.
   *
   * When enabled, all logs become breadcrumbs in Sentry's isolation scope,
   * providing a complete context trail when errors occur. Breadcrumbs are
   * lightweight and only appear in error reports for debugging.
   *
   * @default false
   * @since 1.3.0
   */
  enableBreadcrumbs?: boolean;

  /**
   * Optional hook to transform or filter records before sending to Sentry.
   * Return `null` to drop the record.
   *
   * @since 1.3.0
   */
  beforeSend?: (record: LogRecord) => LogRecord | null;
}

/**
 * Gets a LogTape sink that sends logs to Sentry.
 *
 * This sink uses Sentry's global capture functions from `@sentry/core`,
 * following Sentry v8+ best practices. Simply call `Sentry.init()` before
 * creating the sink, and it will automatically use your initialized client.
 *
 * @param optionsOrClient Optional configuration. Can be:
 *   - Omitted: Uses global Sentry functions (recommended)
 *   - Object with options: Configure sink behavior
 *   - Sentry client instance: Backward compatibility (deprecated)
 * @returns A LogTape sink that sends logs to Sentry.
 *
 * @example Recommended usage - no parameters
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getSentrySink } from "@logtape/sentry";
 * import * as Sentry from "@sentry/node";
 *
 * Sentry.init({ dsn: process.env.SENTRY_DSN });
 *
 * await configure({
 *   sinks: {
 *     sentry: getSentrySink(),  // That's it!
 *   },
 *   loggers: [
 *     { category: [], sinks: ["sentry"], lowestLevel: "error" },
 *   ],
 * });
 * ```
 *
 * @example With options
 * ```typescript
 * import * as Sentry from "@sentry/node";
 * Sentry.init({ dsn: process.env.SENTRY_DSN });
 *
 * await configure({
 *   sinks: {
 *     sentry: getSentrySink({
 *       enableBreadcrumbs: true,
 *     }),
 *   },
 *   loggers: [
 *     { category: [], sinks: ["sentry"], lowestLevel: "info" },
 *   ],
 * });
 * ```
 *
 * @example Edge functions - must flush before termination
 * ```typescript
 * // Cloudflare Workers
 * export default {
 *   async fetch(request, env, ctx) {
 *     logger.error("Something happened");
 *     ctx.waitUntil(Sentry.flush(2000));  // Don't block response
 *     return new Response("OK");
 *   }
 * };
 * ```
 *
 * @example Legacy usage (v1.1.x - deprecated)
 * ```typescript
 * import { getClient } from "@sentry/node";
 * const client = getClient();
 * getSentrySink(client);  // Still works but shows deprecation warning
 * ```
 *
 * @since 1.0.0
 */
export function getSentrySink(
  optionsOrClient?: SentrySinkOptions | SentryInstance,
): Sink {
  let sentry: SentryInstance | undefined;
  let options: SentrySinkOptions = {};

  // Detect which API pattern is being used
  if (optionsOrClient == null) {
    // Pattern: getSentrySink() - no params (RECOMMENDED)
    // Use global functions
  } else if (
    typeof optionsOrClient === "object" &&
    "captureMessage" in optionsOrClient &&
    typeof optionsOrClient.captureMessage === "function"
  ) {
    // Pattern: getSentrySink(client) - DEPRECATED (v1.1.x backward compatibility)
    getLogger(["logtape", "meta", "sentry"]).warn(
      "Passing a client directly is deprecated and will be removed in v2.0.0. " +
        "Use getSentrySink() instead - simpler and recommended!",
    );
    sentry = optionsOrClient as SentryInstance;
  } else if (typeof optionsOrClient === "object") {
    // Pattern: getSentrySink({ options }) - options object
    options = optionsOrClient as SentrySinkOptions;
  } else {
    throw new Error(
      `[@logtape/sentry] Invalid parameter (type: ${typeof optionsOrClient}).\n\n` +
        "Expected one of:\n" +
        "  getSentrySink()              // Recommended\n" +
        "  getSentrySink({ options })   // With options\n" +
        "  getSentrySink(client)        // Deprecated (v1.1.x compat)\n",
    );
  }

  // Choose which Sentry functions to use:
  // - For capture functions: use client if provided (v1.1.x compat), otherwise globals
  // - For scope operations: ALWAYS use globals (client doesn't have these methods)
  const captureMessage = sentry
    ? (msg: ParameterizedString, ctx?: unknown) =>
      sentry.captureMessage(String(msg), ctx)
    : globalCaptureMessage;
  const captureException = sentry
    ? (exception: unknown, hint?: unknown) =>
      sentry.captureException(exception, hint)
    : globalCaptureException;

  return (record: LogRecord) => {
    try {
      // Skip meta logger records to prevent infinite recursion
      const { category } = record;
      if (
        category[0] === "logtape" && category[1] === "meta" &&
        category[2] === "sentry"
      ) {
        return;
      }

      // Optional transformation/filtering
      const transformed = options.beforeSend
        ? options.beforeSend(record)
        : record;
      if (transformed == null) return;

      // Parameterized message for structured logging and events
      const paramMessage = getParameterizedString(transformed);
      const message = paramMessage.toString();

      // Level mapping
      const eventLevel = mapLevelForEvents(transformed.level);

      // Enriched structured attributes
      const attributes = {
        ...transformed.properties,
        "sentry.origin": "auto.logging.logtape",
        category: transformed.category.join("."),
        timestamp: transformed.timestamp,
      } as Record<string, unknown>;

      // After enriched attributes
      const activeSpan = globalGetActiveSpan();
      if (activeSpan) {
        const spanCtx = activeSpan.spanContext();
        attributes.trace_id = spanCtx.traceId;
        attributes.span_id = spanCtx.spanId;
        if ("parentSpanId" in spanCtx) {
          attributes.parent_span_id = spanCtx.parentSpanId; // Optional
        }
      }

      // Send structured log if Sentry logging is enabled (v9.41.0+)
      // Uses public logger API when available (SDK 9.41.0+)
      const client = globalGetClient();
      if (client) {
        const { enableLogs, _experiments } = client.getOptions();
        const loggingEnabled = enableLogs ?? _experiments?.enableLogs;

        if (loggingEnabled && "logger" in SentryCore) {
          const logLevel = mapLevelForLogs(transformed.level);
          const sentryLogger = SentryCore.logger as unknown as
            | Record<string, ((msg: ParameterizedString, attrs: unknown) => void)>
            | undefined;
          const logFn = sentryLogger?.[logLevel];
          if (typeof logFn === "function") {
            logFn(paramMessage, attributes);
          }
        }
      }

      // Capture as Sentry event (Issue) based on level and error presence
      const isErrorLevel = transformed.level === "error" ||
        transformed.level === "fatal";

      if (isErrorLevel && transformed.properties.error instanceof Error) {
        // Error instance at error/fatal level -> captureException for stack trace
        const { error, ...rest } = attributes;
        captureException(error as Error, {
          level: eventLevel,
          extra: { message, ...rest },
        });
      } else if (isErrorLevel) {
        // Error/fatal level without Error instance -> captureMessage as Issue
        captureMessage(paramMessage, {
          level: eventLevel,
          extra: attributes,
        });
      } else if (options.enableBreadcrumbs) {
        // Non-error levels -> breadcrumbs only (if enabled)
        const isolationScope = globalGetIsolationScope();
        isolationScope?.addBreadcrumb({
          category: transformed.category.join("."),
          level: eventLevel,
          message,
          timestamp: transformed.timestamp / 1000,
          data: attributes,
        });
      }
    } catch (err) {
      // Never throw from a sink; keep failures silent but visible in debug
      try {
        console.debug("[@logtape/sentry] sink error", err);
      } catch { /* ignore console errors */ }
    }
  };
}
