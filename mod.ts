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
   */
  messageType?: "string" | "array";

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
    const attributes = convertToAttributes(properties);
    attributes["category"] = [...category];
    const body = convertMessageToBody(message);
    logger.emit(
      {
        severityNumber,
        severityText: level,
        body: options.messageType === "array"
          ? body
          : body.map((v) =>
            v === undefined ? "undefined" : v === null ? "null" : v
          ).join(""),
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
          attributes[key] = value.map(convertToString);
          break;
        }
        t = typeof v;
      }
      attributes[key] = value;
    } else {
      const encoded = convertToString(value);
      if (encoded == null) continue;
      attributes[key] = encoded;
    }
  }
  return attributes;
}

function convertToString(value: unknown): string | null | undefined {
  if (value === null || value === undefined || typeof value === "string") {
    return value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  } else if (value instanceof Date) return value.toISOString();
  else return JSON.stringify(value);
}

function convertMessageToBody(
  message: readonly unknown[],
): (string | null | undefined)[] {
  const body: (string | null | undefined)[] = [];
  for (let i = 0; i < message.length; i += 2) {
    const msg = message[i] as string;
    body.push(msg);
    if (message.length <= i + 1) break;
    const val = message[i + 1];
    body.push(convertToString(val));
  }
  return body;
}

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
