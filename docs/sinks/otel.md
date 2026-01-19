OpenTelemetry sink
==================

If you are using [OpenTelemetry] for observability, you can use the
OpenTelemetry sink to send log messages to an OpenTelemetry collector
using *@logtape/otel* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/otel
~~~~

~~~~ sh [npm]
npm add @logtape/otel
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/otel
~~~~

~~~~ sh [Yarn]
yarn add @logtape/otel
~~~~

~~~~ sh [Bun]
bun add @logtape/otel
~~~~

:::

The quickest way to get started is to use the `getOpenTelemetrySink()` function:

~~~~ typescript twoslash
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

[OpenTelemetry]: https://opentelemetry.io/


Protocol selection
------------------

*This API is available since LogTape 1.3.0.*

The OpenTelemetry sink supports three OTLP protocols for exporting logs:

`http/json`
:   HTTP with JSON encoding (default). Works in all environments including
    browsers.

`http/protobuf`
:   HTTP with Protocol Buffers encoding. More efficient than JSON but requires
    the protobuf library.

`grpc`
:   gRPC protocol. Most efficient for high-volume logging but only works in
    Node.js, Deno, and Bun (not in browsers).

The protocol is automatically selected based on the following environment
variables (in order of precedence):

1.  `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL` — Protocol specifically for logs
2.  `OTEL_EXPORTER_OTLP_PROTOCOL` — Protocol for all OTLP exporters

If neither environment variable is set, the default protocol is `http/json`
for backward compatibility.

> [!NOTE]
> The gRPC protocol requires Node.js, Deno, or Bun runtime.  It does not work
> in browser environments.  When using gRPC, the relevant exporter module is
> dynamically imported only when needed, so browser bundles won't include
> the gRPC code if you're not using it.


Custom configuration
--------------------

If you want to customize the OpenTelemetry configuration, you can specify
options to the `getOpenTelemetrySink()` function:

~~~~ typescript twoslash
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


Additional resource attributes
------------------------------

*This API is available since LogTape 1.3.0.*

You can add custom resource attributes (like deployment environment) without
providing a full custom `loggerProvider` by using the `additionalResource`
option:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

await configure({
  sinks: {
    otel: getOpenTelemetrySink({
      serviceName: "my-service",
      additionalResource: resourceFromAttributes({
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: "production",
      }),
    }),
  },
  loggers: [
    { category: [], sinks: ["otel"], lowestLevel: "debug" },
  ],
});
~~~~

The `additionalResource` is merged with the default resource that includes the
service name and auto-detected attributes.


Error object handling
---------------------

When logging Error objects in properties, the OpenTelemetry sink provides
three modes for handling them via the `exceptionAttributes` option:

`"semconv"` (default)
:   Follows the [OpenTelemetry semantic conventions for exceptions].  Error
    objects in properties are converted to three standard attributes:
    `exception.type`, `exception.message`, and `exception.stacktrace`.
    This is the recommended mode for OpenTelemetry-compliant logging.

`"raw"`
:   Serializes Error objects as JSON strings with their properties
    (`name`, `message`, `stack`, `cause`, etc.).  The Error remains in its
    original property name.  Use this mode if you need to preserve custom
    error properties or don't want to follow semantic conventions.

`false`
:   Treats Error objects like any other object, which typically results in
    empty objects (`{}`) since Error objects have no enumerable properties.
    This mode is rarely useful.

Example using semantic conventions (default):

~~~~ typescript twoslash
import { configure, getLogger } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    otel: getOpenTelemetrySink({
      // exceptionAttributes: "semconv" is the default
    }),
  },
  loggers: [
    { category: [], sinks: ["otel"], lowestLevel: "debug" },
  ],
});

const logger = getLogger(["my-app"]);

try {
  // Some operation that might fail
  throw new Error("Database connection failed");
} catch (error) {
  logger.error("Operation failed", { error });
  // This creates attributes:
  // - exception.type: "Error"
  // - exception.message: "Database connection failed"
  // - exception.stacktrace: "Error: Database connection failed\n  at ..."
}
~~~~

Example using raw mode:

~~~~ typescript twoslash
import { configure, getLogger } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    otel: getOpenTelemetrySink({
      exceptionAttributes: "raw",
    }),
  },
  loggers: [
    { category: [], sinks: ["otel"], lowestLevel: "debug" },
  ],
});

const logger = getLogger(["my-app"]);

try {
  throw new Error("Custom error");
} catch (error) {
  logger.error("Operation failed", { error });
  // This creates a single attribute:
  // - error: '{"name":"Error","message":"Custom error","stack":"..."}'
}
~~~~

> [!NOTE]
> Error objects appearing in log message values (not properties) are always
> serialized as JSON strings regardless of the `exceptionAttributes` setting.
> The semantic conventions only apply to `Error` objects in properties.

[OpenTelemetry semantic conventions for exceptions]: https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-logs/


Using an existing `LoggerProvider`
----------------------------------

For maximum control, you can pass an existing OpenTelemetry [`LoggerProvider`]
instance.  This is the recommended approach for production applications where
you want full control over the OpenTelemetry configuration:

~~~~ typescript twoslash
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
const loggerProvider = new LoggerProvider({
  processors: [
    new SimpleLogRecordProcessor(exporter),
  ],
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

> [!TIP]
> When providing your own `loggerProvider`, you have full control over the
> exporter protocol and configuration.  This approach is recommended when you
> need to integrate with an existing OpenTelemetry setup or require advanced
> configuration options.

For more information, see the documentation of the `getOpenTelemetrySink()`
function and `OpenTelemetrySinkOptions` type.

[`LoggerProvider`]: https://open-telemetry.github.io/opentelemetry-js/classes/_opentelemetry_sdk_logs.LoggerProvider.html
