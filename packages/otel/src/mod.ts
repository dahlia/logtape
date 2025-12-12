import {
  getLogger,
  type Logger,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import { diag, type DiagLogger, DiagLogLevel } from "@opentelemetry/api";
import {
  type AnyValue,
  type Logger as OTLogger,
  type LoggerProvider as LoggerProviderBase,
  type LogRecord as OTLogRecord,
  NOOP_LOGGER,
  SeverityNumber,
} from "@opentelemetry/api-logs";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import type { Resource } from "@opentelemetry/resources";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import metadata from "../deno.json" with { type: "json" };

/**
 * Gets an environment variable value across different JavaScript runtimes.
 * @param name The environment variable name.
 * @returns The environment variable value, or undefined if not found.
 */
function getEnvironmentVariable(name: string): string | undefined {
  // Deno runtime
  if (typeof Deno !== "undefined" && Deno.env) {
    try {
      return Deno.env.get(name);
    } catch {
      // Deno.env.get() can throw if permissions are not granted
      return undefined;
    }
  }

  // Node.js/Bun runtime
  if (
    typeof globalThis !== "undefined" && "process" in globalThis &&
    // @ts-ignore: process exists in Node.js/Bun
    typeof globalThis.process !== "undefined" &&
    // @ts-ignore: process.env exists in Node.js/Bun
    typeof globalThis.process.env === "object" &&
    // @ts-ignore: process.env exists in Node.js/Bun
    globalThis.process.env !== null
  ) {
    // @ts-ignore: process.env exists in Node.js/Bun
    return globalThis.process.env[name];
  }

  // Browser/other environments - no environment variables available
  return undefined;
}

/**
 * Checks if an OTLP endpoint is configured via environment variables or options.
 * Checks the following environment variables:
 * - `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (logs-specific endpoint)
 * - `OTEL_EXPORTER_OTLP_ENDPOINT` (general OTLP endpoint)
 *
 * @param config Optional exporter configuration that may contain a URL.
 * @returns `true` if an endpoint is configured, `false` otherwise.
 */
function hasOtlpEndpoint(config?: OTLPExporterNodeConfigBase): boolean {
  // Check if URL is provided in config
  if (config?.url) {
    return true;
  }

  // Check environment variables
  const logsEndpoint = getEnvironmentVariable(
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  );
  if (logsEndpoint) {
    return true;
  }

  const endpoint = getEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT");
  if (endpoint) {
    return true;
  }

  return false;
}

/**
 * Detects the OTLP protocol from environment variables.
 * Priority:
 * 1. `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL`
 * 2. `OTEL_EXPORTER_OTLP_PROTOCOL`
 * 3. Default: `"http/json"` (for backward compatibility)
 *
 * @returns The detected OTLP protocol.
 */
function detectOtlpProtocol(): OtlpProtocol {
  const logsProtocol = getEnvironmentVariable(
    "OTEL_EXPORTER_OTLP_LOGS_PROTOCOL",
  );
  if (
    logsProtocol === "grpc" ||
    logsProtocol === "http/protobuf" ||
    logsProtocol === "http/json"
  ) {
    return logsProtocol;
  }

  const protocol = getEnvironmentVariable("OTEL_EXPORTER_OTLP_PROTOCOL");
  if (
    protocol === "grpc" ||
    protocol === "http/protobuf" ||
    protocol === "http/json"
  ) {
    return protocol;
  }

  return "http/json";
}

/**
 * Creates an OTLP log exporter based on the detected protocol.
 * Uses dynamic imports to maintain browser compatibility when gRPC is not used.
 * @param config Optional exporter configuration.
 * @returns A promise that resolves to the appropriate OTLP log exporter.
 */
async function createOtlpExporter(
  config?: OTLPExporterNodeConfigBase,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const protocol = detectOtlpProtocol();

  switch (protocol) {
    case "grpc": {
      const { OTLPLogExporter } = await import(
        "@opentelemetry/exporter-logs-otlp-grpc"
      );
      return new OTLPLogExporter(config);
    }
    case "http/protobuf": {
      const { OTLPLogExporter } = await import(
        "@opentelemetry/exporter-logs-otlp-proto"
      );
      return new OTLPLogExporter(config);
    }
    case "http/json":
    default: {
      const { OTLPLogExporter } = await import(
        "@opentelemetry/exporter-logs-otlp-http"
      );
      return new OTLPLogExporter(config);
    }
  }
}

/**
 * The OpenTelemetry logger provider.
 */
type ILoggerProvider = LoggerProviderBase & {
  /**
   * Flush all buffered data and shut down the LoggerProvider and all registered
   * LogRecordProcessor.
   *
   * Returns a promise which is resolved when all flushes are complete.
   */
  shutdown?: () => Promise<void>;
};

/**
 * The way to render the object in the log record.  If `"json"`,
 * the object is rendered as a JSON string.  If `"inspect"`,
 * the object is rendered using `util.inspect` in Node.js/Bun, or
 * `Deno.inspect` in Deno.
 */
export type ObjectRenderer = "json" | "inspect";

type Message = (string | null | undefined)[];

/**
 * Custom `body` attribute formatter.
 * @since 0.3.0
 */
export type BodyFormatter = (message: Message) => AnyValue;

/**
 * The OTLP protocol to use for exporting logs.
 * @since 0.9.0
 */
export type OtlpProtocol = "grpc" | "http/protobuf" | "http/json";

/**
 * Base options shared by all OpenTelemetry sink configurations.
 */
interface OpenTelemetrySinkOptionsBase {
  /**
   * The way to render the message in the log record.  If `"string"`,
   * the message is rendered as a single string with the values are
   * interpolated into the message.  If `"array"`, the message is
   * rendered as an array of strings.  `"string"` by default.
   *
   * Or even fully customizable with a {@link BodyFormatter} function.
   * @since 0.2.0
   */
  messageType?: "string" | "array" | BodyFormatter;

  /**
   * The way to render the object in the log record.  If `"json"`,
   * the object is rendered as a JSON string.  If `"inspect"`,
   * the object is rendered using `util.inspect` in Node.js/Bun, or
   * `Deno.inspect` in Deno.  `"inspect"` by default.
   */
  objectRenderer?: ObjectRenderer;

  /**
   * Whether to log diagnostics.  Diagnostic logs are logged to
   * the `["logtape", "meta", "otel"]` category.
   * Turned off by default.
   */
  diagnostics?: boolean;
}

/**
 * Options for creating an OpenTelemetry sink with a custom logger provider.
 * When using this configuration, you are responsible for setting up the
 * logger provider with appropriate exporters and processors.
 *
 * This is the recommended approach for production use as it gives you
 * full control over the OpenTelemetry configuration.
 * @since 0.9.0
 */
export interface OpenTelemetrySinkProviderOptions
  extends OpenTelemetrySinkOptionsBase {
  /**
   * The OpenTelemetry logger provider to use.
   */
  loggerProvider: ILoggerProvider;
}

/**
 * Options for creating an OpenTelemetry sink with automatic exporter creation.
 * The protocol is determined by environment variables:
 * - `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL` (highest priority)
 * - `OTEL_EXPORTER_OTLP_PROTOCOL` (fallback)
 * - Default: `"http/json"`
 *
 * For production use, consider providing your own {@link ILoggerProvider}
 * via {@link OpenTelemetrySinkProviderOptions} for more control.
 * @since 0.9.0
 */
export interface OpenTelemetrySinkExporterOptions
  extends OpenTelemetrySinkOptionsBase {
  /**
   * The OpenTelemetry logger provider to use.
   * Must be undefined or omitted when using exporter options.
   */
  loggerProvider?: undefined;

  /**
   * The OpenTelemetry OTLP exporter configuration to use.
   */
  otlpExporterConfig?: OTLPExporterNodeConfigBase;

  /**
   * The service name to use.  If not provided, the service name is
   * taken from the `OTEL_SERVICE_NAME` environment variable.
   */
  serviceName?: string;

  /**
   * An additional resource to merge with the default resource.
   * @since 1.3.0
   */
  additionalResource?: Resource;
}

/**
 * Options for creating an OpenTelemetry sink.
 *
 * This is a union type that accepts either:
 * - {@link OpenTelemetrySinkProviderOptions}: Provide your own `loggerProvider`
 *   (recommended for production)
 * - {@link OpenTelemetrySinkExporterOptions}: Let the sink create an exporter
 *   automatically based on environment variables
 *
 * When no `loggerProvider` is provided, the protocol is determined by:
 * 1. `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL` environment variable
 * 2. `OTEL_EXPORTER_OTLP_PROTOCOL` environment variable
 * 3. Default: `"http/json"`
 *
 * @example Using a custom logger provider (recommended)
 * ```typescript
 * import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
 * import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
 *
 * const provider = new LoggerProvider();
 * provider.addLogRecordProcessor(new SimpleLogRecordProcessor(new OTLPLogExporter()));
 *
 * const sink = getOpenTelemetrySink({ loggerProvider: provider });
 * ```
 *
 * @example Using automatic exporter creation
 * ```typescript
 * // Protocol determined by OTEL_EXPORTER_OTLP_PROTOCOL env var
 * const sink = getOpenTelemetrySink({
 *   serviceName: "my-service",
 * });
 * ```
 */
export type OpenTelemetrySinkOptions =
  | OpenTelemetrySinkProviderOptions
  | OpenTelemetrySinkExporterOptions;

/**
 * A no-op logger provider that returns NOOP_LOGGER for all requests.
 * Used when no OTLP endpoint is configured to avoid repeated connection errors.
 */
const noopLoggerProvider: ILoggerProvider = {
  getLogger: () => NOOP_LOGGER,
};

/**
 * Initializes the logger provider asynchronously.
 * This is used when the user doesn't provide a custom logger provider.
 *
 * If no OTLP endpoint is configured (via options or environment variables),
 * returns a noop logger provider to avoid repeated connection errors.
 *
 * @param options The exporter options.
 * @returns A promise that resolves to the initialized logger provider.
 */
async function initializeLoggerProvider(
  options: OpenTelemetrySinkExporterOptions,
): Promise<ILoggerProvider> {
  // If no endpoint is configured, use noop logger provider to avoid
  // repeated transport errors
  if (!hasOtlpEndpoint(options.otlpExporterConfig)) {
    return noopLoggerProvider;
  }

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName ??
        getEnvironmentVariable("OTEL_SERVICE_NAME"),
    })
      .merge(options.additionalResource ?? null),
  );
  const otlpExporter = await createOtlpExporter(options.otlpExporterConfig);
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      // @ts-ignore: it works anyway...
      new SimpleLogRecordProcessor(otlpExporter),
    ],
  });
  return loggerProvider;
}

/**
 * Emits a log record to the OpenTelemetry logger.
 * @param logger The OpenTelemetry logger.
 * @param record The LogTape log record.
 * @param options The sink options.
 */
function emitLogRecord(
  logger: OTLogger,
  record: LogRecord,
  options: OpenTelemetrySinkOptions,
): void {
  const objectRenderer = options.objectRenderer ?? "inspect";
  const { category, level, message, timestamp, properties } = record;
  const severityNumber = mapLevelToSeverityNumber(level);
  const attributes = convertToAttributes(properties, objectRenderer);
  attributes["category"] = [...category];
  logger.emit(
    {
      severityNumber,
      severityText: level,
      body: typeof options.messageType === "function"
        ? convertMessageToCustomBodyFormat(
          message,
          objectRenderer,
          options.messageType,
        )
        : options.messageType === "array"
        ? convertMessageToArray(message, objectRenderer)
        : convertMessageToString(message, objectRenderer),
      attributes,
      timestamp: new Date(timestamp),
    } satisfies OTLogRecord,
  );
}

/**
 * Creates a sink that forwards log records to OpenTelemetry.
 *
 * When a custom `loggerProvider` is provided, it is used directly.
 * Otherwise, the sink will lazily initialize a logger provider on the first
 * log record, using the protocol determined by environment variables.
 *
 * @param options Options for creating the sink.
 * @returns The sink.
 */
export function getOpenTelemetrySink(
  options: OpenTelemetrySinkOptions = {},
): Sink & AsyncDisposable {
  if (options.diagnostics) {
    diag.setLogger(new DiagLoggerAdaptor(), DiagLogLevel.DEBUG);
  }

  // If loggerProvider is provided, use the synchronous path
  if (options.loggerProvider != null) {
    const loggerProvider = options.loggerProvider;
    const logger = loggerProvider.getLogger(metadata.name, metadata.version);
    const shutdown = loggerProvider.shutdown?.bind(loggerProvider);
    const sink: Sink & AsyncDisposable = Object.assign(
      (record: LogRecord) => {
        const { category } = record;
        if (
          category[0] === "logtape" && category[1] === "meta" &&
          category[2] === "otel"
        ) {
          return;
        }
        emitLogRecord(logger, record, options);
      },
      {
        async [Symbol.asyncDispose](): Promise<void> {
          if (shutdown != null) await shutdown();
        },
      },
    );
    return sink;
  }

  // Lazy initialization for automatic exporter creation
  let loggerProvider: ILoggerProvider | null = null;
  let logger: OTLogger | null = null;
  let initPromise: Promise<void> | null = null;
  let initError: Error | null = null;

  const sink: Sink & AsyncDisposable = Object.assign(
    (record: LogRecord) => {
      const { category } = record;
      if (
        category[0] === "logtape" && category[1] === "meta" &&
        category[2] === "otel"
      ) {
        return;
      }

      // If already initialized, emit the log
      if (logger != null) {
        emitLogRecord(logger, record, options);
        return;
      }

      // If initialization failed, skip silently
      if (initError != null) {
        return;
      }

      // Start initialization if not already started
      if (initPromise == null) {
        initPromise = initializeLoggerProvider(options)
          .then((provider) => {
            loggerProvider = provider;
            logger = provider.getLogger(metadata.name, metadata.version);
            // Emit the current record that triggered initialization
            emitLogRecord(logger, record, options);
          })
          .catch((error) => {
            initError = error;
            // Log initialization error to console as a fallback
            // deno-lint-ignore no-console
            console.error("Failed to initialize OpenTelemetry logger:", error);
          });
      }
      // Records during initialization are dropped
      // (the triggering record is emitted in the then() callback above)
    },
    {
      async [Symbol.asyncDispose](): Promise<void> {
        // Wait for initialization to complete if in progress
        if (initPromise != null) {
          try {
            await initPromise;
          } catch {
            // Initialization failed, nothing to shut down
            return;
          }
        }
        if (loggerProvider?.shutdown != null) {
          await loggerProvider.shutdown();
        }
      },
    },
  );

  return sink;
}

function mapLevelToSeverityNumber(level: string): number {
  switch (level) {
    case "trace":
      return SeverityNumber.TRACE;
    case "debug":
      return SeverityNumber.DEBUG;
    case "info":
      return SeverityNumber.INFO;
    case "warning":
      return SeverityNumber.WARN;
    case "error":
      return SeverityNumber.ERROR;
    case "fatal":
      return SeverityNumber.FATAL;
    default:
      return SeverityNumber.UNSPECIFIED;
  }
}

function convertToAttributes(
  properties: Record<string, unknown>,
  objectRenderer: ObjectRenderer,
): Record<string, AnyValue> {
  const attributes: Record<string, AnyValue> = {};
  for (const [name, value] of Object.entries(properties)) {
    const key = `attributes.${name}`;
    if (value == null) continue;
    if (Array.isArray(value)) {
      let t = null;
      for (const v of value) {
        if (v == null) continue;
        if (t != null && typeof v !== t) {
          attributes[key] = value.map((v) =>
            convertToString(v, objectRenderer)
          );
          break;
        }
        t = typeof v;
      }
      attributes[key] = value;
    } else {
      const encoded = convertToString(value, objectRenderer);
      if (encoded == null) continue;
      attributes[key] = encoded;
    }
  }
  return attributes;
}

function convertToString(
  value: unknown,
  objectRenderer: ObjectRenderer,
): string | null | undefined {
  if (value === null || value === undefined || typeof value === "string") {
    return value;
  }
  if (objectRenderer === "inspect") return inspect(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  } else if (value instanceof Date) return value.toISOString();
  else return JSON.stringify(value);
}

function convertMessageToArray(
  message: readonly unknown[],
  objectRenderer: ObjectRenderer,
): AnyValue {
  const body: (string | null | undefined)[] = [];
  for (let i = 0; i < message.length; i += 2) {
    const msg = message[i] as string;
    body.push(msg);
    if (message.length <= i + 1) break;
    const val = message[i + 1];
    body.push(convertToString(val, objectRenderer));
  }
  return body;
}

function convertMessageToString(
  message: readonly unknown[],
  objectRenderer: ObjectRenderer,
): AnyValue {
  let body = "";
  for (let i = 0; i < message.length; i += 2) {
    const msg = message[i] as string;
    body += msg;
    if (message.length <= i + 1) break;
    const val = message[i + 1];
    const extra = convertToString(val, objectRenderer);
    body += extra ?? JSON.stringify(extra);
  }
  return body;
}

function convertMessageToCustomBodyFormat(
  message: readonly unknown[],
  objectRenderer: ObjectRenderer,
  bodyFormatter: BodyFormatter,
): AnyValue {
  const body = message.map((msg) => convertToString(msg, objectRenderer));
  return bodyFormatter(body);
}

/**
 * A platform-specific inspect function.  In Deno, this is {@link Deno.inspect},
 * and in Node.js/Bun it is {@link util.inspect}.  If neither is available, it
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
        globalThis.util.inspect === "function"
    // @ts-ignore: Node.js global
    ? globalThis.util.inspect
    : JSON.stringify;

class DiagLoggerAdaptor implements DiagLogger {
  logger: Logger;

  constructor() {
    this.logger = getLogger(["logtape", "meta", "otel"]);
  }

  #escape(msg: string): string {
    return msg.replaceAll("{", "{{").replaceAll("}", "}}");
  }

  error(msg: string, ...values: unknown[]): void {
    this.logger.error(`${this.#escape(msg)}: {values}`, { values });
  }

  warn(msg: string, ...values: unknown[]): void {
    this.logger.warn(`${this.#escape(msg)}: {values}`, { values });
  }

  info(msg: string, ...values: unknown[]): void {
    this.logger.info(`${this.#escape(msg)}: {values}`, { values });
  }

  debug(msg: string, ...values: unknown[]): void {
    this.logger.debug(`${this.#escape(msg)}: {values}`, { values });
  }

  verbose(msg: string, ...values: unknown[]): void {
    this.logger.debug(`${this.#escape(msg)}: {values}`, { values });
  }
}
