import {
  getLogger,
  type Logger,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";
import { diag, type DiagLogger, DiagLogLevel } from "@opentelemetry/api";
import {
  type AnyValue,
  type LoggerProvider as LoggerProviderBase,
  type LogRecord as OTLogRecord,
  SeverityNumber,
} from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { Resource } from "@opentelemetry/resources";
import {
  LoggerProvider,
  type LogRecordProcessor,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import process from "node:process";
import metadata from "./deno.json" with { type: "json" };

/**
 * The OpenTelemetry logger provider.
 */
type ILoggerProvider = LoggerProviderBase & {
  /**
   * Adds a new {@link LogRecordProcessor} to this logger.
   * @param processor the new LogRecordProcessor to be added.
   */
  addLogRecordProcessor(processor: LogRecordProcessor): void;

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
 * Custom `body` attribute formatter
 */
export type BodyFormatter = (message: Message) => AnyValue;

/**
 * Options for creating an OpenTelemetry sink.
 */
export interface OpenTelemetrySinkOptions {
  /**
   * The OpenTelemetry logger provider to use.
   */
  loggerProvider?: ILoggerProvider;

  /**
   * The way to render the message in the log record.  If `"string"`,
   * the message is rendered as a single string with the values are
   * interpolated into the message.  If `"array"`, the message is
   * rendered as an array of strings.  `"string"` by default.
   * @since 0.2.0
   *
   * Or even fully customizable with a {@link BodyFormatter} function.
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

  /**
   * The OpenTelemetry OTLP exporter configuration to use.
   * Ignored if `loggerProvider` is provided.
   */
  otlpExporterConfig?: OTLPExporterNodeConfigBase;

  /**
   * The service name to use.  If not provided, the service name is
   * taken from the `OTEL_SERVICE_NAME` environment variable.
   * Ignored if `loggerProvider` is provided.
   */
  serviceName?: string;
}

/**
 * Creates a sink that forwards log records to OpenTelemetry.
 * @param options Options for creating the sink.
 * @returns The sink.
 */
export function getOpenTelemetrySink(
  options: OpenTelemetrySinkOptions = {},
): Sink {
  if (options.diagnostics) {
    diag.setLogger(new DiagLoggerAdaptor(), DiagLogLevel.DEBUG);
  }

  let loggerProvider: ILoggerProvider;
  if (options.loggerProvider == null) {
    const resource = Resource.default().merge(
      new Resource({
        [ATTR_SERVICE_NAME]: options.serviceName ??
          process.env.OTEL_SERVICE_NAME,
      }),
    );
    loggerProvider = new LoggerProvider({ resource });
    const otlpExporter = new OTLPLogExporter(options.otlpExporterConfig);
    loggerProvider.addLogRecordProcessor(
      // @ts-ignore: it works anyway...
      new SimpleLogRecordProcessor(otlpExporter),
    );
  } else {
    loggerProvider = options.loggerProvider;
  }
  const objectRenderer = options.objectRenderer ?? "inspect";
  const logger = loggerProvider.getLogger(metadata.name, metadata.version);
  const sink = (record: LogRecord) => {
    const { category, level, message, timestamp, properties } = record;
    if (
      category[0] === "logtape" && category[1] === "meta" &&
      category[2] === "otel"
    ) {
      return;
    }
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
  };
  if (loggerProvider.shutdown != null) {
    const shutdown = loggerProvider.shutdown.bind(loggerProvider);
    sink[Symbol.asyncDispose] = shutdown;
  }
  return sink;
}

function mapLevelToSeverityNumber(level: string): number {
  switch (level) {
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
