import {
  compareLogLevel,
  getLogger,
  type LogLevel,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import type {
  LogSeverityLevel,
  ParameterizedString,
  SeverityLevel,
} from "@sentry/core";
// Import namespace to safely check for public logger API (added in v9.41.0)
import * as SentryCore from "@sentry/core";
// Cross-runtime inspect: Deno.inspect / util.inspect (handles circular
// references); falls back to JSON.stringify in browsers. Resolved via the
// `#util` import map per runtime.
import { inspect } from "#util";

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

const defaultErrorPropertyNames = ["error", "err"] as const;

/**
 * Options for records sent through Sentry's Logs API.
 *
 * @since 2.3.0
 */
export interface SentryLogsOptions {
  /**
   * Minimum level for records sent through Sentry's Logs API.
   *
   * @default `"trace"`
   */
  level?: LogLevel;
}

/**
 * Options for records added as Sentry breadcrumbs.
 *
 * @since 2.3.0
 */
export interface SentryBreadcrumbOptions {
  /**
   * Minimum level for records added as breadcrumbs.
   *
   * @default `"trace"`
   */
  level?: LogLevel;

  /**
   * Maximum level for records added as breadcrumbs.
   */
  maxLevel?: LogLevel;
}

function getErrorProperty(
  properties: Readonly<Record<string, unknown>>,
  propertyNames: readonly string[],
): readonly [property: string, error: Error] | undefined {
  for (const property of propertyNames) {
    if (properties[property] instanceof Error) {
      return [property, properties[property]];
    }
  }
  return undefined;
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
 * A Sentry SDK namespace object.
 *
 * Pass the namespace imported by your application when *@logtape/sentry* should
 * use the same Sentry module instance that initialized your app, for example
 * `import * as Sentry from "@sentry/node"`.
 *
 * @since 2.2.0
 */
export interface SentryNamespace {
  /**
   * Captures a message event and sends it to Sentry.
   */
  captureMessage(
    message: ParameterizedString,
    captureContext?: SeverityLevel | unknown,
  ): string;

  /**
   * Captures an exception event and sends it to Sentry.
   */
  captureException(exception: unknown, hint?: unknown): string;

  /**
   * Gets the currently active span, if any.
   */
  getActiveSpan():
    | {
      spanContext: () => {
        traceId: string;
        spanId: string;
        parentSpanId?: string;
      };
    }
    | undefined;

  /**
   * Gets the currently active Sentry client, if any.
   */
  getClient():
    | {
      getOptions: () => {
        enableLogs?: boolean;
        _experiments?: {
          enableLogs?: boolean;
        };
      };
    }
    | undefined;

  /**
   * Gets the current isolation scope.
   */
  getIsolationScope():
    | {
      addBreadcrumb: (breadcrumb: {
        category: string;
        level: SeverityLevel;
        message: string;
        timestamp: number;
        data: Record<string, unknown>;
      }) => void;
    }
    | undefined;

  /**
   * Sentry's structured logging API, available in Sentry SDK 9.41.0+.
   */
  logger?: Partial<
    Record<
      LogSeverityLevel,
      (
        message: ParameterizedString,
        attributes: Record<string, unknown>,
      ) => void
    >
  >;
}

/**
 * Options for configuring the Sentry sink.
 * @since 1.3.0
 */
export interface SentrySinkOptions {
  /**
   * Sentry SDK namespace to use for capture, scope, span, and structured log
   * APIs.
   *
   * This is useful when your application initializes Sentry through a framework
   * SDK such as `@sentry/nextjs` or `@sentry/react-native`, and
   * *@logtape/sentry* resolves a different `@sentry/core` module instance.
   *
   * @example
   * ```typescript
   * import * as Sentry from "@sentry/node";
   *
   * getSentrySink({ sentry: Sentry });
   * ```
   *
   * @default `@sentry/core`
   * @since 2.2.0
   */
  sentry?: SentryNamespace;

  /**
   * Enable automatic breadcrumb creation for log events.
   *
   * When enabled, non-error logs become breadcrumbs in Sentry's isolation
   * scope, providing a complete context trail when errors occur. Breadcrumbs
   * are lightweight and only appear in error reports for debugging.
   *
   * @default false
   * @deprecated Use `breadcrumbs` instead.
   * @since 1.3.0
   */
  enableBreadcrumbs?: boolean;

  /**
   * Enables and configures automatic breadcrumb creation for log events.
   *
   * Set this to `true` to use the default breadcrumb behavior, or pass an
   * options object to control which non-error log levels become breadcrumbs.
   *
   * When this option is set, it takes precedence over the deprecated
   * `enableBreadcrumbs` option.
   *
   * @default false
   * @since 2.3.0
   */
  breadcrumbs?: boolean | SentryBreadcrumbOptions;

  /**
   * Configures records sent through Sentry's Logs API.
   *
   * The Sentry SDK must still have structured logging enabled with
   * `enableLogs: true` or `_experiments.enableLogs: true`.
   *
   * @since 2.3.0
   */
  logs?: SentryLogsOptions;

  /**
   * Property names to inspect for an `Error` instance when deciding whether
   * error-level records should be sent through Sentry's `captureException()`.
   *
   * Names are checked in order, and the first property containing an `Error`
   * instance is used as the captured exception.  Set this to a custom list when
   * your application or logger stores the primary exception under another name.
   *
   * @default `["error", "err"]`
   * @since 2.3.0
   */
  errorPropertyNames?: readonly string[];

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
 * This sink uses Sentry's global capture functions from `@sentry/core` by
 * default, following Sentry v8+ best practices. Simply call `Sentry.init()`
 * before creating the sink, and it will automatically use your initialized
 * client when both packages resolve the same Sentry module instance.
 *
 * @param optionsOrClient Optional configuration. Can be:
 *   - Omitted: Uses global Sentry functions (recommended)
 *   - Object with options: Configure sink behavior
 *   - Object with `sentry`: Use an application-provided Sentry SDK namespace
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
 * @example With an application-provided Sentry namespace
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getSentrySink } from "@logtape/sentry";
 * import * as Sentry from "@sentry/nextjs";
 *
 * Sentry.init({ dsn: process.env.SENTRY_DSN });
 *
 * await configure({
 *   sinks: {
 *     sentry: getSentrySink({ sentry: Sentry }),
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
 *       breadcrumbs: true,
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
  let legacyClient: SentryInstance | undefined;
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
      "Passing a client directly is deprecated. " +
        "Use getSentrySink({ sentry: Sentry }) instead.",
    );
    legacyClient = optionsOrClient as SentryInstance;
  } else if (typeof optionsOrClient === "object") {
    // Pattern: getSentrySink({ options }) - options object
    options = optionsOrClient as SentrySinkOptions;
  } else {
    throw new Error(
      `[@logtape/sentry] Invalid parameter (type: ${typeof optionsOrClient}).\n\n` +
        "Expected one of:\n" +
        "  getSentrySink()              // Recommended\n" +
        "  getSentrySink({ options })   // With options\n" +
        "  getSentrySink({ sentry })    // With a Sentry SDK namespace\n" +
        "  getSentrySink(client)        // Deprecated (v1.1.x compat)\n",
    );
  }

  const sentry = options.sentry ?? SentryCore;

  // Choose which Sentry functions to use:
  // - For capture functions: use client if provided (v1.1.x compat),
  //   otherwise the configured SDK namespace.
  // - For scope operations: use the configured SDK namespace because clients
  //   don't expose current scope/span APIs.
  const captureMessage = legacyClient
    ? (msg: ParameterizedString, ctx?: unknown) =>
      legacyClient.captureMessage(String(msg), ctx)
    : sentry.captureMessage;
  const captureException = legacyClient
    ? (exception: unknown, hint?: unknown) =>
      legacyClient.captureException(exception, hint)
    : sentry.captureException;

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
      const activeSpan = sentry.getActiveSpan();
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
      const client = sentry.getClient();
      if (client && shouldSendToLogs(transformed, options.logs)) {
        const { enableLogs, _experiments } = client.getOptions();
        const loggingEnabled = enableLogs ?? _experiments?.enableLogs;

        const sentryLogger = sentry.logger as SentryNamespace["logger"];
        if (loggingEnabled && sentryLogger != null) {
          const logLevel = mapLevelForLogs(transformed.level);
          const logFn = sentryLogger[logLevel];
          if (typeof logFn === "function") {
            logFn(paramMessage, attributes);
          }
        }
      }

      // Capture as Sentry event (Issue) based on level and error presence
      // Use compareLogLevel() to handle future severity level additions
      const isErrorLevel = compareLogLevel(transformed.level, "error") >= 0;
      const errorProperty = getErrorProperty(
        transformed.properties,
        options.errorPropertyNames ?? defaultErrorPropertyNames,
      );

      if (isErrorLevel && errorProperty != null) {
        // Error instance at error/fatal level -> captureException for stack trace
        const [property, error] = errorProperty;
        const rest = { ...attributes };
        delete rest[property];
        captureException(error, {
          level: eventLevel,
          extra: { message, ...rest },
        });
      } else if (isErrorLevel) {
        // Error/fatal level without Error instance -> captureMessage as Issue
        captureMessage(paramMessage, {
          level: eventLevel,
          extra: attributes,
        });
      } else if (shouldAddBreadcrumb(transformed, options)) {
        // Non-error levels -> breadcrumbs only (if enabled)
        const isolationScope = sentry.getIsolationScope();
        isolationScope?.addBreadcrumb({
          category: transformed.category.join("."),
          level: eventLevel,
          message,
          timestamp: transformed.timestamp / 1000,
          data: attributes,
        });
      }
    } catch (error) {
      getLogger(["logtape", "meta", "sentry"]).error(
        "Failed to send log events to Sentry",
        { error },
      );
    }
  };
}

function shouldSendToLogs(
  record: LogRecord,
  options: SentryLogsOptions | undefined,
): boolean {
  return options?.level == null ||
    compareLogLevel(record.level, options.level) >= 0;
}

function shouldAddBreadcrumb(
  record: LogRecord,
  options: SentrySinkOptions,
): boolean {
  const breadcrumbOptions = options.breadcrumbs;
  if (breadcrumbOptions === false) return false;
  if (breadcrumbOptions === true) return true;
  if (breadcrumbOptions == null) return options.enableBreadcrumbs === true;

  if (
    breadcrumbOptions.level != null &&
    compareLogLevel(record.level, breadcrumbOptions.level) < 0
  ) {
    return false;
  }

  return breadcrumbOptions.maxLevel == null ||
    compareLogLevel(record.level, breadcrumbOptions.maxLevel) <= 0;
}
