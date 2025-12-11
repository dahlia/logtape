@logtape/otel: LogTape OpenTelemetry Sink
=========================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]

This package provides an [OpenTelemetry] sink for [LogTape]. It allows you to
send your LogTape logs to OpenTelemetry-compatible backends.

[JSR]: https://jsr.io/@logtape/otel
[JSR badge]: https://jsr.io/badges/@logtape/otel
[npm]: https://www.npmjs.com/package/@logtape/otel
[npm badge]: https://img.shields.io/npm/v/@logtape/otel?logo=npm
[GitHub Actions]: https://github.com/dahlia/logtape/actions/workflows/main.yaml
[GitHub Actions badge]: https://github.com/dahlia/logtape/actions/workflows/main.yaml/badge.svg
[OpenTelemetry]: https://opentelemetry.io/
[LogTape]: https://github.com/dahlia/logtape


Installation
------------

The package is available on [JSR] and [npm].

~~~~ bash
deno add jsr:@logtape/otel # for Deno
npm  add     @logtape/otel # for npm
pnpm add     @logtape/otel # for pnpm
yarn add     @logtape/otel # for Yarn
bun  add     @logtape/otel # for Bun
~~~~


Usage
-----

The quickest way to get started is to use the `getOpenTelemetrySink()` function
without any arguments:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    otel: getOpenTelemetrySink(),
  },
  loggers: [
    { category: [], sinks: ["otel"], lowestLevel: "debug" },
  ],
});
~~~~

This will use the default OpenTelemetry configuration, which is to send logs to
the OpenTelemetry collector running on `localhost:4317` or respects the `OTEL_*`
environment variables.

If you want to customize the OpenTelemetry configuration, you can specify
options to the [`getOpenTelemetrySink()`] function:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    otel: getOpenTelemetrySink({
      serviceName: "my-service",
      otlpExporterConfig: {
        url: "https://my-otel-collector:4317",
        headers: { "x-api-key": "my-api-key" },
      },
    }),
  },
  loggers: [
    { category: [], sinks: ["otel"], lowestLevel: "debug" },
  ],
});
~~~~

Or you can even pass an existing OpenTelemetry [`LoggerProvider`] instance:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

const exporter = new OTLPLogExporter({
  url: "https://my-otel-collector:4318/v1/logs",
  headers: { "x-api-key": "my-api-key" },
});
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

await configure({
  sinks: {
    otel: getOpenTelemetrySink({ loggerProvider }),
  },
  loggers: [
    { category: [], sinks: ["otel"], lowestLevel: "debug" },
  ],
});
~~~~

For more information, see the documentation of the [`getOpenTelemetrySink()`]
function and [`OpenTelemetrySinkOptions`] type.

[`getOpenTelemetrySink()`]: https://jsr.io/@logtape/otel/doc/~/getOpenTelemetrySink
[`OpenTelemetrySinkOptions`]: https://jsr.io/@logtape/otel/doc/~/OpenTelemetrySinkOptions
[`LoggerProvider`]: https://open-telemetry.github.io/opentelemetry-js/classes/_opentelemetry_sdk_logs.LoggerProvider.html


Protocol selection
------------------

By default, the sink uses the `http/json` protocol to send logs to the
OpenTelemetry collector.  You can change the protocol by setting the
`OTEL_EXPORTER_OTLP_PROTOCOL` or `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL` environment
variable:

~~~~ bash
# Use gRPC protocol (server environments only)
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc

# Use HTTP/Protobuf protocol
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Use HTTP/JSON protocol (default)
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
~~~~

The available protocols are:

 -  `grpc`: Uses gRPC transport.  This is only available in server environments
    (Node.js, Deno, Bun) and not in browsers due to gRPC's HTTP/2 requirement.
 -  `http/protobuf`: Uses HTTP transport with Protocol Buffers encoding.
    Works in all environments.
 -  `http/json`: Uses HTTP transport with JSON encoding.  Works in all
    environments.  This is the default.

> [!NOTE]
> When using gRPC protocol, make sure to use the correct port (typically 4317
> for gRPC vs 4318 for HTTP).


No-op fallback
--------------

If no OTLP endpoint is configured (neither via options nor environment
variables), the sink automatically falls back to a no-op logger that discards
all log records.  This prevents errors when running in environments where
OpenTelemetry is not set up.

The sink checks for endpoints in the following order:

 1. `otlpExporterConfig.url` option
 2. `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` environment variable
 3. `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable

If none of these are set, the no-op fallback is used.


Diagnostic logging
------------------

If you want to log diagnostic messages from the OpenTelemetry sink itself,
you can enable `diagnostics: true` in the sink options:

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    otel: getOpenTelemetrySink({ diagnostics: true }),
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], level: "debug" },
    { category: [], sinks: ["otel"], level: "debug" },
  ],
});
~~~~

This will log messages with the `["logtape", "meta", "otel"]` category.

These messages are useful for debugging the configuration of the OpenTelemetry
sink, but they can be verbose, so it's recommended to enable them only when
needed.
