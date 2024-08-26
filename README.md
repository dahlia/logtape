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
[GitHub Actions]: https://github.com/dahlia/logtape-otel/actions/workflows/main.yaml
[GitHub Actions badge]: https://github.com/dahlia/logtape-otel/actions/workflows/main.yaml/badge.svg
[OpenTelemetry]: https://opentelemetry.io/
[LogTape]: https://github.com/dahlia/logtape


Installation
------------

The package is available on [JSR] and [npm].

~~~~ bash
deno add @logtape/otel # for Deno
npm add @logtape/otel  # for npm
pnpm add @logtape/otel # for pnpm
yarn add @logtape/otel # for Yarn
bun add @logtape/otel  # for Bun
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
  filters: {},
  loggers: [
    { category: [], sinks: ["otel"], level: "debug" },
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
  filters: {},
  loggers: [
    { category: [], sinks: ["otel"], level: "debug" },
  ],
});
~~~~

Or you can even pass an existing OpenTelemetry [`LoggerProvider`] instance:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

const exporter = new OTLPLogExporter({
  url: "https://my-otel-collector:4317",
  headers: { "x-api-key": "my-api-key" },
});
const loggerProvider = new LoggerProvider();
loggerProvider.addProcessor(new SimpleLogRecordProcessor(exporter));

await configure({
  sinks: {
    otel: getOpenTelemetrySink({ loggerProvider }),
  },
  filters: {},
  loggers: [
    { category: [], sinks: ["otel"], level: "debug" },
  ],
});
~~~~

For more information, see the documentation of the [`getOpenTelemetrySink()`]
function and [`OpenTelemetrySinkOptions`] type.

[`getOpenTelemetrySink()`]: https://jsr.io/@logtape/otel/doc/~/getOpenTelemetrySink
[`OpenTelemetrySinkOptions`]: https://jsr.io/@logtape/otel/doc/~/OpenTelemetrySinkOptions
[`LoggerProvider`]: https://open-telemetry.github.io/opentelemetry-js/classes/_opentelemetry_sdk_logs.LoggerProvider.html


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


Changelog
---------

### Version 0.3.0

To be released.


### Version 0.2.0

Released on August 26, 2024.

 -  The `OpenTelemetrySinkOptions` type is now an interface.
 -  Added `OpenTelemetrySinkOptions.messageType` option.
 -  Added `OpenTelemetrySinkOptions.objectRenderer` option.  Now non-scalar
    values are rendered using `util.inspect()` in Node.js/Bun and
    `Deno.inspect()` in Deno by default.


### Version 0.1.0

Released on August 24, 2024.  Initial release.
