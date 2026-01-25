<!-- deno-fmt-ignore-file -->

LogTape changelog
=================

Version 2.1.0
-------------

To be released.


Version 2.0.2
-------------

Released on January 25, 2026.

### @logtape/pretty

 -  Fixed `getters` and `showProxy` options in `inspectOptions` not being
    passed to `Deno.inspect()` on Deno runtime.  Previously, these options
    were defined in the interface but ignored, causing getter properties
    to display as `[Getter]` instead of their evaluated values.  [[#136]]

[#136]: https://github.com/dahlia/logtape/issues/136


Version 2.0.1
-------------

Released on January 20, 2026.

### @logtape/otel

 -  Fixed OpenTelemetry sink to preserve nested object structures in attributes
    instead of converting them to JSON strings.  This follows the OpenTelemetry
    specification which supports `map<string, AnyValue>` for nested objects.
    [[#135]]

    Before this fix, nested objects were serialized as JSON strings:

    ~~~~ typescript
    logger.info("Event", { workspace: { id: 42, name: "test" } });
    // OpenTelemetry attribute: workspace = '{"id":42,"name":"test"}'
    ~~~~

    After this fix, nested objects are preserved as structured data:

    ~~~~ typescript
    logger.info("Event", { workspace: { id: 42, name: "test" } });
    // OpenTelemetry attribute: workspace = { id: 42, name: "test" }
    ~~~~

    This allows OpenTelemetry backends (like Axiom, Honeycomb, etc.) to properly
    query and filter on nested properties (e.g., `workspace.id = 42`).

     -  `Error` objects in properties (when `exceptionAttributes` is `"raw"` or
        `false`) are now serialized as structured objects instead of JSON
        strings, preserving properties like `name`, `message`, `stack`, `cause`,
        and custom properties.

[#135]: https://github.com/dahlia/logtape/issues/135


Version 2.0.0
-------------

Released on January 15, 2026.

### @logtape/logtape

 -  Added `lazy()` function for deferred evaluation of contextual properties.
    This allows properties passed to `Logger.with()` to be evaluated at logging
    time rather than at `with()` call time.  [[#131]]

    ~~~~ typescript
    import { getLogger, lazy } from "@logtape/logtape";

    let currentUser: string | null = null;
    const logger = getLogger("app").with({ user: lazy(() => currentUser) });

    logger.info("Action");  // logs with user: null
    currentUser = "alice";
    logger.info("Action");  // logs with user: "alice"
    ~~~~


     -  Added `Lazy<T>` type to represent a lazy value.
     -  Added `isLazy()` function to check if a value is a lazy value.

 -  Added `Error` overloads for `Logger.error()`,
    `Logger.warn()`/`Logger.warning()`, and `Logger.fatal()` as a shorthand for
    logging errors as structured properties.
    The default message template for `logger.error(error)` (and the
    corresponding warning/fatal overloads) is `{error.message}`. Note that
    `logger.warn(new Error(...))` and `logger.fatal(new Error(...))` may result
    in slightly different output compared to previous versions, where this
    looked like a `{*}` (properties-only) shorthand.  [[#123]]

 -  Improved JSON Lines formatter serialization of `Error` and `AggregateError`
    values in properties so that `name`, `message`, `stack`, `cause`, and
    `errors` are preserved in JSON output.  [[#123]]

 -  Added `"none"` and `"disabled"` options for
    `AnsiColorFormatterOptions.timestamp` to disable timestamp display,
    consistent with `TextFormatterOptions`. [[#120], [#121] by Jonathan Wilbur]

     -  Added `"none"` and `"disabled"` to the `timestamp` option type.
     -  Changed the custom timestamp formatter return type to `string | null`
        (was `string`).
     -  Fixed `getAnsiColorFormatter()` to properly handle `null` timestamps
        instead of rendering `"null"` with ANSI styling.

 -  Added `lineEnding` option to text and JSON Lines formatters for Windows
    compatibility.  [[#113] by Joonmo]

     -  Added `lineEnding` option to `TextFormatterOptions` interface.
     -  Added `lineEnding` option to `JsonLinesFormatterOptions` interface.
     -  Supports `"lf"` (Unix-style, default) and `"crlf"` (Windows-style)
        line endings.
     -  `getAnsiColorFormatter()` automatically inherits the option from
        `getTextFormatter()`.

 -  Replaced the deprecated `unload` event with `pagehide` for automatic
    disposal in browser environments.  [[#79], [#124], [#125] by Pavel Semiklit]

    The `unload` event is deprecated and will be removed from browsers
    (starting with Chrome in 2025).  It also prevents pages from being
    eligible for browser back/forward cache (bfcache), which significantly
    impacts navigation performance.  The `pagehide` event fires at nearly
    the same timing as `unload` but is bfcache-compatible and more reliable
    on mobile browsers.

    Note that Deno continues to use the `unload` event since it does not
    support `pagehide`.

 -  Added `FingersCrossedOptions.bufferLevel` option to configure which severity
    levels are buffered separately from the trigger level.  [[#126]]

     -  When set, only log records at or below `bufferLevel` are buffered.
     -  Records above `bufferLevel` but below `triggerLevel` pass through
        immediately without buffering.
     -  Throws `RangeError` if `bufferLevel` is greater than or equal to
        `triggerLevel`.

 -  Added `Logger.isEnabledFor()` method to check if a log level would be
    processed by the logger.  [[#129]]

     -  Returns `true` if the level is at or above `lowestLevel` and at least
        one sink is configured to receive logs at that level.
     -  Useful for conditionally executing expensive computations before
        logging, particularly for async operations where lazy evaluation
        callbacks cannot be used.

 -  Added async callback support for lazy evaluation of structured data.
    [[#129]]

     -  All logging methods (`trace()`, `debug()`, `info()`, `warn()`,
        `warning()`, `error()`, `fatal()`) now accept async callbacks
        that return `Promise<Record<string, unknown>>`.
     -  When an async callback is passed, the method returns `Promise<void>`.
     -  The async callback is only invoked if the log level is enabled;
        if disabled, the callback is never called and the returned `Promise`
        resolves immediately.
     -  Added corresponding overloads to `Logger` interface and `LogMethod`
        interface.

[#79]: https://github.com/dahlia/logtape/issues/79
[#113]: https://github.com/dahlia/logtape/pull/113
[#120]: https://github.com/dahlia/logtape/issues/120
[#121]: https://github.com/dahlia/logtape/pull/121
[#123]: https://github.com/dahlia/logtape/issues/123
[#124]: https://github.com/dahlia/logtape/issues/124
[#125]: https://github.com/dahlia/logtape/pull/125
[#126]: https://github.com/dahlia/logtape/issues/126
[#129]: https://github.com/dahlia/logtape/issues/129
[#131]: https://github.com/dahlia/logtape/issues/131

### @logtape/adaptor-log4js

 -  Added a new package `@logtape/adaptor-log4js` for integrating LogTape with
    log4js logging infrastructure.  [[#57]]

     -  Added `getLog4jsSink()` function to forward LogTape log records to
        log4js loggers.
     -  Added `Log4jsSinkOptions` type (discriminated union) for configuring
        the adapter behavior with type-safe context strategy options:
         -  `Log4jsSinkOptionsMdc`: For MDC strategy with `contextPreservation`
         -  `Log4jsSinkOptionsArgs`: For args strategy (excludes
            `contextPreservation`)
     -  Added `install()` function for convenient auto-configuration with
        custom log4js logger and configuration options.
     -  Added `categoryMapper` option to customize how LogTape categories are
        mapped to log4js categories (default: join with dots).
     -  Added `contextStrategy` option to control how LogTape properties are
        handled:
         -  `"mdc"` (default): Use log4js MDC (Mapped Diagnostic Context)
         -  `"args"`: Pass properties as additional arguments to log methods
     -  Added `contextPreservation` option for MDC strategy to control
        handling of existing log4js context:
         -  `"preserve"` (default): Save and restore existing context
         -  `"merge"`: Merge LogTape properties with existing context
         -  `"replace"`: Replace existing context with LogTape properties
     -  Maps LogTape log levels to equivalent log4js levels (trace, debug,
        info, warn, error, fatal).
     -  Supports dynamic logger creation based on LogTape categories or using
        a fixed log4js logger instance.
     -  Enables seamless adoption of LogTape-enabled libraries in applications
        using log4js without requiring logging infrastructure changes.

[#57]: https://github.com/dahlia/logtape/issues/57

### @logtape/config

 -  Added a new package `@logtape/config` for configuring LogTape from plain
    objects.  [[#117]]

     -  Added `configureFromObject()` function to configure LogTape from plain
        JavaScript objects loaded from JSON, YAML, TOML, or other formats.
     -  Added module reference syntax (`module#export()`) for specifying sinks,
        filters, and formatters.
     -  Added built-in shorthands for common sinks and formatters
        (`#console()`, `#text()`, `#ansiColor()`, `#jsonLines()`).
     -  Added `ConfigureOptions` interface with `shorthands` and
        `onInvalidConfig` options.
     -  Added `onInvalidConfig` option for graceful error handling:
         -  `"throw"` (default): Throw `ConfigError` on invalid configuration
         -  `"warn"`: Apply valid parts and log warnings to meta logger
     -  Added `expandEnvVars()` utility function for environment variable
        expansion with `${VAR}` and `${VAR:default}` syntax.
     -  Added `LogTapeConfig`, `SinkConfig`, `FilterConfig`, `FormatterConfig`,
        `LoggerConfig`, and `ShorthandRegistry` interfaces.
     -  Added `ConfigError` class for configuration errors.
     -  Added `DEFAULT_SHORTHANDS` constant with built-in shorthand mappings.

[#117]: https://github.com/dahlia/logtape/issues/117

### @logtape/elysia

 -  Added a new package `@logtape/elysia` for Elysia integration.  [[#111]]

     -  Added `elysiaLogger()` function to create Elysia plugin for HTTP
        request logging.
     -  Supports predefined formats (`combined`, `common`, `dev`, `short`,
        `tiny`) compatible with Morgan.
     -  Supports custom format functions returning string or structured objects.
     -  Supports configurable log levels via `level` option.
     -  Supports request skipping via `skip` option.
     -  Supports immediate logging mode via `logRequest` option.
     -  Supports Elysia plugin scopes via `scope` option (`global`, `scoped`,
        `local`).
     -  Logs errors at error level via `onError` hook.

[#111]: https://github.com/dahlia/logtape/issues/111

### @logtape/otel

 -  Removed the `attributes.` prefix from property keys when converting LogTape
    properties to OpenTelemetry attributes.  Properties are now sent with their
    original key names as flat attributes, which aligns with standard
    OpenTelemetry conventions and prevents double nesting (e.g.,
    `attributes.attributes.method`) in OpenTelemetry backends.  [[#127], [#130]]

     -  Changed `convertToAttributes()` to use property keys directly without
        adding an `attributes.` prefix.
     -  This is a breaking change: existing users with queries or dashboards
        that rely on the `attributes.*` key names will need to update them to
        use the new flat key names (e.g., `attributes.method` becomes `method`
        in the attributes field).

 -  Added `exceptionAttributes` option to control how `Error` objects in
    properties are handled.  [[#123]]

     -  `"semconv"` (default): Follows
        [OpenTelemetry semantic conventions for exceptions], converting Error
        objects to `exception.type`, `exception.message`, and
        `exception.stacktrace` attributes.
     -  `"raw"`: Serializes Error objects as JSON strings with their properties
        (`name`, `message`, `stack`, `cause`, `errors`) preserved.
     -  `false`: Treats Error objects as regular objects (typically results in
        empty objects).


    > [!IMPORTANT]
    > This is a behavior change: Error objects in properties now follow
    > semantic conventions by default instead of being serialized as JSON
    > strings.  If you need the previous behavior, set
    > `exceptionAttributes: "raw"`.

 -  Fixed primitive type preservation in attributes: numbers and booleans are
    now preserved as their original types instead of being converted to strings.

[OpenTelemetry semantic conventions for exceptions]: https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-logs/
[#127]: https://github.com/dahlia/logtape/issues/127
[#130]: https://github.com/dahlia/logtape/issues/130

### @logtape/file

 -  Added `getTimeRotatingFileSink()` function for time-based log file rotation.
    [[#82]]

     -  Supports `"hourly"`, `"daily"`, and `"weekly"` rotation intervals.
     -  Default filename patterns: `YYYY-MM-DD.log` (daily),
        `YYYY-MM-DD-HH.log` (hourly), `YYYY-WNN.log` (weekly).
     -  Added `TimeRotatingFileSinkOptions.filename` option for custom filename
        patterns.
     -  Added `TimeRotatingFileSinkOptions.maxAgeMs` option for automatic cleanup
        of old log files.
     -  Supports buffering and non-blocking mode like other file sinks.
     -  Added `TimeRotatingFileSinkOptions` interface.
     -  Added `TimeRotationInterval` type.

[#82]: https://github.com/dahlia/logtape/issues/82

### @logtape/windows-eventlog

 -  Improved Windows Event Log message formatting using `NELOG_OEM_Code` (3299)
    from *netmsg.dll*.  [[#115] by Roland Kaufmann]

     -  Changed default event ID to `NELOG_OEM_Code` (3299), which provides
        a generic message format that properly displays log messages in
        Windows Event Viewer.
     -  Added `formatter` option to `WindowsEventLogSinkOptions` for custom
        text formatting of log records.
     -  Refactored FFI implementations (Deno, Node.js, Bun) to use a common
        `WindowsEventLogFFI` interface.
     -  Added documentation for registering *netmsg.dll* as an event message
        file in the Windows Registry.

[#115]: https://github.com/dahlia/logtape/pull/115


Version 1.3.7
-------------

Released on January 25, 2026.

### @logtape/pretty

 -  Fixed `getters` and `showProxy` options in `inspectOptions` not being
    passed to `Deno.inspect()` on Deno runtime.  Previously, these options
    were defined in the interface but ignored, causing getter properties
    to display as `[Getter]` instead of their evaluated values.  [[#136]]


Version 1.3.6
-------------

Released on January 7, 2026.

### @logtape/cloudwatch-logs

 -  Fixed `getCloudWatchLogsSink()` to properly close internally created
    `CloudWatchLogsClient` connections on disposal.  Previously, when the sink
    created its own client (i.e., when `options.client` was not provided),
    the client's TLS connections were not closed, causing resource leaks that
    were detected by Deno's stricter resource leak checking in newer versions.


Version 1.3.5
-------------

Released on December 19, 2025.

### @logtape/redaction

 -  Fixed a regression where `Error`, `Date`, `RegExp`, and other built-in
    objects were incorrectly converted to empty objects `{}` when processed
    by `redactByField()` and `redactByPattern()`.  These objects are now
    preserved without modification.  [[#114]]

[#114]: https://github.com/dahlia/logtape/issues/114


Version 1.3.4
-------------

Released on December 18, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to use redacted property values for all message
    placeholders, not just those directly matching field patterns.  Previously,
    named placeholders like `{args}` would use original values even when
    containing nested sensitive fields (e.g., `args[0].email`), exposing
    sensitive data in the log message.  [[#99]]

[#99]: https://github.com/dahlia/logtape/issues/99


Version 1.3.3
-------------

Released on December 18, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to recursively process arrays, ensuring that
    sensitive fields inside objects within arrays are properly redacted.
    Previously, arrays were not traversed, so sensitive data in nested
    structures like `{ args: [{ email: "..." }] }` would not be redacted.
    [[#99]]


Version 1.3.2
-------------

Released on December 18, 2025.

 -  Reduced npm package sizes by excluding unnecessary source files from
    published packages.  Previously, the *src/* directory was included in npm
    packages, which increased download sizes without providing runtime value.
    [[#112]]

[#112]: https://github.com/dahlia/logtape/issues/112


Version 1.3.1
-------------

Released on December 16, 2025.

### @logtape/otel

 -  Fixed a bug where log records sent during lazy initialization were silently
    dropped.  Now, log records are buffered during initialization and emitted
    once the OpenTelemetry logger provider is ready.  [[#110]]

 -  Added `OpenTelemetrySink` interface which extends `Sink` with `ready`
    property and `AsyncDisposable`.

 -  Added `OpenTelemetrySink.ready` property, a `Promise<void>` that resolves
    when lazy initialization completes.  For sinks created with an explicit
    `loggerProvider`, this resolves immediately.

[#110]: https://github.com/dahlia/logtape/issues/110


Version 1.3.0
-------------

Released on December 15, 2025.

### @logtape/logtape

 -  Added context-based category prefix feature for library hierarchies.
    [[#98]]

     -  Added `withCategoryPrefix()` function to prepend category prefixes
        to all log records within a callback context.
     -  Uses the existing `contextLocalStorage` configuration, so no additional
        setup is required if implicit contexts are already enabled.
     -  Useful for SDKs that wrap internal libraries and want to show
        their own category in logs from those libraries.
     -  Prefixes accumulate when nested, allowing multi-layer architectures.

[#98]: https://github.com/dahlia/logtape/issues/98

### @logtape/drizzle-orm

 -  Added *@logtape/drizzle-orm* package for Drizzle ORM integration.  [[#104]]

     -  Added `getLogger()` function to create a Drizzle ORM-compatible logger.
     -  Added `DrizzleLoggerOptions` interface for configuration.
     -  Added `DrizzleLogger` class implementing Drizzle's `Logger` interface.
     -  Logs queries with structured data: `formattedQuery` (with parameter
        substitution), `query` (original), and `params` (original array).

[#104]: https://github.com/dahlia/logtape/issues/104

### @logtape/express

 -  Added *@logtape/express* package for Express.js HTTP request logging using
    LogTape as the backend.  [[#105]]

     -  Added `expressLogger()` function to create Express middleware for
        request logging.
     -  Added `ExpressLogTapeOptions` interface for configuration.
     -  Added `RequestLogProperties` interface for structured log properties.
     -  Added `FormatFunction` type for custom format functions.
     -  Added `PredefinedFormat` type for Morgan-compatible format names.
     -  Supports predefined formats: `combined`, `common`, `dev`, `short`,
        `tiny`.
     -  Supports custom format functions returning strings or objects.
     -  Supports `skip` function to conditionally skip logging.
     -  Supports `immediate` option to log on request arrival vs response.

[#105]: https://github.com/dahlia/logtape/issues/105

### @logtape/fastify

 -  Added *@logtape/fastify* package for using LogTape as Fastify's logging
    backend.  [[#102]]

     -  Added `getLogTapeFastifyLogger()` function to create a Pino-compatible
        logger wrapper for Fastify's `loggerInstance` option.
     -  Added `FastifyLogTapeOptions` interface for configuration.
     -  Added `PinoLikeLogger` interface implementing Pino's logger contract.
     -  Added `PinoLogMethod` interface for Pino-style log method signatures.
     -  Added `PinoLevel` type for Pino log levels.
     -  Supports all Pino method signatures: string messages, object + message,
        object-only, and printf-style interpolation (`%s`, `%d`, `%j`, `%o`).
     -  Implements `child(bindings)` method using LogTape's `Logger.with()`.

[#102]: https://github.com/dahlia/logtape/issues/102

### @logtape/hono

 -  Added *@logtape/hono* package for Hono HTTP request logging using
    LogTape as the backend.  [[#107]]

     -  Added `honoLogger()` function to create Hono middleware for
        request logging.
     -  Added `HonoLogTapeOptions` interface for configuration.
     -  Added `HonoContext` interface for context type compatibility.
     -  Added `RequestLogProperties` interface for structured log properties.
     -  Added `FormatFunction` type for custom format functions.
     -  Added `PredefinedFormat` type for Morgan-compatible format names.
     -  Supports predefined formats: `combined`, `common`, `dev`, `short`,
        `tiny`.
     -  Supports custom format functions returning strings or objects.
     -  Supports `skip` function to conditionally skip logging.
     -  Supports `logRequest` option to log on request arrival vs response.
     -  Cross-runtime compatible: works on Cloudflare Workers, Deno, Bun,
        and Node.js.

[#107]: https://github.com/dahlia/logtape/issues/107

### @logtape/koa

 -  Added *@logtape/koa* package for Koa HTTP request logging using
    LogTape as the backend.  [[#106]]

     -  Added `koaLogger()` function to create Koa middleware for
        request logging.
     -  Added `KoaLogTapeOptions` interface for configuration.
     -  Added `KoaContext` interface for context type compatibility.
     -  Added `RequestLogProperties` interface for structured log properties.
     -  Added `FormatFunction` type for custom format functions.
     -  Added `PredefinedFormat` type for Morgan-compatible format names.
     -  Supports predefined formats: `combined`, `common`, `dev`, `short`,
        `tiny`.
     -  Supports custom format functions returning strings or objects.
     -  Supports `skip` function to conditionally skip logging.
     -  Supports `logRequest` option to log on request arrival vs response.

[#106]: https://github.com/dahlia/logtape/issues/106

### @logtape/otel

 -  Added support for gRPC and HTTP/Protobuf protocols for OTLP log export.
    [[#103]]

     -  Added `@opentelemetry/exporter-logs-otlp-grpc` dependency for gRPC
        protocol support.

     -  Added `@opentelemetry/exporter-logs-otlp-proto` dependency for
        HTTP/Protobuf protocol support.

     -  Protocol is determined by environment variables following the
        OpenTelemetry specification:

        1.  `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL` (highest priority)
        2.  `OTEL_EXPORTER_OTLP_PROTOCOL` (fallback)
        3.  Default: `"http/json"` (for backward compatibility)

     -  Added `OtlpProtocol` type for protocol values (`"grpc"`,
        `"http/protobuf"`, `"http/json"`).

     -  Uses dynamic imports to maintain browser compatibility when gRPC
        is not used.

 -  Added `OpenTelemetrySinkExporterOptions.additionalResource` option to
    merge custom resource attributes with the default resource.
    [[#108] by Nils Bergmann]

    This allows adding attributes like `ATTR_DEPLOYMENT_ENVIRONMENT_NAME`
    without providing a custom `loggerProvider`:

    ~~~~ typescript
    import { getOpenTelemetrySink } from "@logtape/otel";
    import { resourceFromAttributes } from "@opentelemetry/resources";
    import { SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from "@opentelemetry/semantic-conventions";

    getOpenTelemetrySink({
      serviceName: "my-service",
      additionalResource: resourceFromAttributes({
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: "production",
      }),
    });
    ~~~~

 -  Refactored `OpenTelemetrySinkOptions` to a discriminated union type for
    better type safety.

     -  Added `OpenTelemetrySinkProviderOptions` interface for providing a custom
        `LoggerProvider` (recommended for production use).
     -  Added `OpenTelemetrySinkExporterOptions` interface for automatic exporter
        creation based on environment variables.
     -  `loggerProvider` and exporter options (`serviceName`,
        `otlpExporterConfig`) are now mutually exclusive at the type level.

 -  Changed the exporter initialization to use lazy loading.  The exporter
    is now created asynchronously when the first log record is emitted,
    rather than synchronously when `getOpenTelemetrySink()` is called.
    This allows the main API to remain synchronous while supporting
    dynamic imports for protocol selection.

 -  Added automatic fallback to no-op logger when no OTLP endpoint is
    configured.  This prevents repeated transport errors when environment
    variables like `OTEL_EXPORTER_OTLP_ENDPOINT` or
    `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` are not set and no URL is provided
    in the exporter configuration.

[#103]: https://github.com/dahlia/logtape/issues/103
[#108]: https://github.com/dahlia/logtape/pull/108

### @logtape/redaction

 -  Fixed a security vulnerability where `redactByField()` and
    `redactByPattern()` could enter an infinite loop when processing objects
    with circular references, leading to a denial-of-service (DoS) attack.
    The redaction functions now correctly handle circular references,
    preventing stack overflows.

 -  Fixed a security vulnerability where sensitive data in class instances
    was not being redacted. The redaction logic now recursively processes
    class instances, ensuring that sensitive fields are redacted regardless
    of the object's structure.

### @logtape/sentry

 -  Enhanced Sentry sink with modern observability features including automatic
    trace correlation, breadcrumbs, and structured logging support.  [[#90]]

     -  The `getSentrySink()` function now accepts an optional `SentrySinkOptions`
        object instead of a Sentry client instance. The old pattern
        `getSentrySink(getClient())` still works with a deprecation warning.
     -  Added automatic trace correlation with active Sentry spans (`trace_id`,
        `span_id` context).
     -  Added `enableBreadcrumbs` option to create breadcrumbs for all log events.
     -  Added `beforeSend` hook to transform or filter records before sending.
     -  Added automatic structured logging support via Sentry's Logs API (SDK
        v9.41.0+ with `enableLogs: true`).
     -  Added ParameterizedString support for better message grouping in Sentry.

[#90]: https://github.com/dahlia/logtape/pull/90

### @logtape/syslog

 -  Added `SyslogSinkOptions.secure` option to enable TLS for TCP connections,
    addressing a vulnerability where logs were sent in plaintext over the
    network.

 -  Added `SyslogSinkOptions.tlsOptions` option to configure TLS connections.

     -  Added `SyslogTlsOptions` interface for TLS configuration.
     -  Added `SyslogTlsOptions.rejectUnauthorized` option to control
        certificate validation (defaults to `true` for security).
     -  Added `SyslogTlsOptions.ca` option to specify custom CA certificates.


Version 1.2.7
-------------

Released on January 25, 2026.

### @logtape/pretty

 -  Fixed `getters` and `showProxy` options in `inspectOptions` not being
    passed to `Deno.inspect()` on Deno runtime.  Previously, these options
    were defined in the interface but ignored, causing getter properties
    to display as `[Getter]` instead of their evaluated values.  [[#136]]


Version 1.2.6
-------------

Released on January 7, 2026.

### @logtape/cloudwatch-logs

 -  Fixed `getCloudWatchLogsSink()` to properly close internally created
    `CloudWatchLogsClient` connections on disposal.  Previously, when the sink
    created its own client (i.e., when `options.client` was not provided),
    the client's TLS connections were not closed, causing resource leaks that
    were detected by Deno's stricter resource leak checking in newer versions.


Version 1.2.5
-------------

Released on December 18, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to use redacted property values for all message
    placeholders, not just those directly matching field patterns.  Previously,
    named placeholders like `{args}` would use original values even when
    containing nested sensitive fields (e.g., `args[0].email`), exposing
    sensitive data in the log message.  [[#99]]


Version 1.2.4
-------------

Released on December 18, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to recursively process arrays, ensuring that
    sensitive fields inside objects within arrays are properly redacted.
    Previously, arrays were not traversed, so sensitive data in nested
    structures like `{ args: [{ email: "..." }] }` would not be redacted.
    [[#99]]


Version 1.2.3
-------------

Released on December 18, 2025.

 -  Reduced npm package sizes by excluding unnecessary source files from
    published packages.  Previously, the *src/* directory was included in npm
    packages, which increased download sizes without providing runtime value.
    [[#112]]


Version 1.2.2
-------------

Released on November 29, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to properly redact sensitive fields in objects
    passed via the `{*}` wildcard placeholder.  Previously, the original
    object reference was kept in the message array, exposing sensitive
    field values even when they were redacted in properties.  [[#99]]


Version 1.2.1
-------------

Released on November 28, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to also redact sensitive values in the `message`
    array, not just in `properties`.  Previously, sensitive field values
    were exposed in the log message even when the corresponding property
    was redacted.  [[#99]]


Version 1.2.0
-------------

Released on November 11, 2025.

### @logtape/logtape

 -  Added support for nested property access in message template placeholders,
    enabling direct access to nested objects, arrays, and complex data
    structures without manual property extraction.  [[#91], [#93] by 伍闲犬]

     -  Dot notation: `{user.name}`, `{order.customer.profile.tier}`
     -  Array indexing: `{users[0]}`, `{users[0].name}`
     -  Bracket notation with quotes: `{user["full-name"]}`, `{data["a.b c"]}`
     -  Escape sequences in quoted strings: `\"`, `\'`, `\\`, `\n`, `\t`, `\r`,
        `\b`, `\f`, `\v`, `\0`, and Unicode escapes (`\uXXXX`)
     -  Optional chaining: `{user?.profile?.email}`, `{data?.items?.[0]?.name}`
     -  Combined patterns: `{users[0]?.profile?.["contact-info"]?.email}`
     -  Enhanced security: blocks access to `__proto__`, `prototype`, and
        `constructor` at any depth to prevent prototype pollution

 -  Added context-based isolation for fingers crossed sink to handle scenarios
    like HTTP request tracing where logs should be isolated by implicit
    context values.  [[#86]]

     -  Added `isolateByContext` option to `FingersCrossedOptions` for isolating
        buffers based on specified context keys from log record properties.
     -  Context isolation can be combined with existing category isolation for
        fine-grained control over buffer flushing behavior.
     -  Each context buffer maintains separate trigger states and size limits,
        preventing unrelated logs from being flushed together.
     -  Added memory management options for context isolation to prevent memory
        leaks in high-traffic applications: `bufferTtlMs` for time-based
        cleanup, `cleanupIntervalMs` for configurable cleanup intervals, and
        `maxContexts` for LRU-based capacity limits. TTL and LRU can be used
        independently or together for comprehensive memory management.

 -  Changed the type of the `TextFormatterOptions.value` callback to accept
    a second parameter that provides access to the default cross-runtime
    `inspect()` function, making it easier to implement custom value formatting
    with fallback to default behavior.

     -  Changed the type of `TextFormatterOptions.value` to
        `(value: unknown, inspect: (value: unknown, options?: { colors?: boolean }) => string) => string`
        (was `(value: unknown) => string`).
     -  The second parameter is optional and can be ignored for backward
        compatibility.
     -  Users can now customize formatting for specific value types while
        falling back to the cross-runtime `inspect()` function for others,
        without needing to reimplement the complex runtime detection logic.

[#86]: https://github.com/dahlia/logtape/issues/86
[#91]: https://github.com/dahlia/logtape/issues/91
[#93]: https://github.com/dahlia/logtape/pull/93

### @logtape/pretty

 -  Added support for `getters` and `showProxy` options in `inspectOptions`
    to allow fine-grained control over how objects and proxies are displayed.
    These options are available in Node.js, Deno, and Bun runtimes, providing
    consistent behavior across platforms.  [[#95]]

[#95]: https://github.com/dahlia/logtape/issues/95

### @logtape/redaction

 -  Extended field-based redaction to recursively redact sensitive fields in
    objects nested within arrays, providing more comprehensive protection for
    structured data.  [[#94]]

[#94]: https://github.com/dahlia/logtape/issues/94


Version 1.1.8
-------------

Released on January 7, 2026.

### @logtape/cloudwatch-logs

 -  Fixed `getCloudWatchLogsSink()` to properly close internally created
    `CloudWatchLogsClient` connections on disposal.  Previously, when the sink
    created its own client (i.e., when `options.client` was not provided),
    the client's TLS connections were not closed, causing resource leaks that
    were detected by Deno's stricter resource leak checking in newer versions.


Version 1.1.7
-------------

Released on December 18, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to use redacted property values for all message
    placeholders, not just those directly matching field patterns.  Previously,
    named placeholders like `{args}` would use original values even when
    containing nested sensitive fields (e.g., `args[0].email`), exposing
    sensitive data in the log message.  [[#99]]


Version 1.1.6
-------------

Released on December 18, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to recursively process arrays, ensuring that
    sensitive fields inside objects within arrays are properly redacted.
    Previously, arrays were not traversed, so sensitive data in nested
    structures like `{ args: [{ email: "..." }] }` would not be redacted.
    [[#99]]


Version 1.1.5
-------------

Released on December 18, 2025.

 -  Reduced npm package sizes by excluding unnecessary source files from
    published packages.  Previously, the *src/* directory was included in npm
    packages, which increased download sizes without providing runtime value.
    [[#112]]


Version 1.1.4
-------------

Released on November 29, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to properly redact sensitive fields in objects
    passed via the `{*}` wildcard placeholder.  Previously, the original
    object reference was kept in the message array, exposing sensitive
    field values even when they were redacted in properties.  [[#99]]


Version 1.1.3
-------------

Released on November 28, 2025.

### @logtape/redaction

 -  Fixed `redactByField()` to also redact sensitive values in the `message`
    array, not just in `properties`.  Previously, sensitive field values
    were exposed in the log message even when the corresponding property
    was redacted.  [[#99]]


Version 1.1.2
-------------

Released on October 22, 2025.

 -  Fixed Vercel Edge Runtime compatibility issue where LogTape caused
    “Node.js API is used (process.on) which is not supported in the Edge
    Runtime” error during configuration. Implemented defense-in-depth approach
    with both `EdgeRuntime` global variable detection and dynamic bracket
    notation access (`proc?.["on"]`) to avoid static analysis detection while
    ensuring runtime safety.  [[#92]]

[#92]: https://github.com/dahlia/logtape/issues/92


Version 1.1.1
-------------

Released on September 18, 2025.

### @logtape/pretty

 -  Fixed a bug where logs with long property keys would cause the formatter to
    fail, resulting in no output being displayed.  The issue occurred when
    property keys exceeded the indentation width, causing negative padding
    calculations that threw a `RangeError`.  [[#87]]

[#87]: https://github.com/dahlia/logtape/issues/87


Version 1.1.0
-------------

Released on September 11, 2025.

### @logtape/logtape

 -  Added “fingers crossed” logging feature that buffers debug logs in memory
    and only outputs them when a trigger event occurs, reducing log noise while
    preserving context for debugging.  [[#59]]

     -  Added `fingersCrossed()` function that implements the fingers crossed
        logging pattern with support for trigger levels, buffer management, and
        category isolation.
     -  Added `FingersCrossedOptions` interface for configuring fingers crossed
        behavior with options for trigger level, buffer size, and category
        isolation modes.

 -  Added `Logger.emit()` method for emitting log records with custom fields,
    particularly useful for integrating external logs while preserving their
    original timestamps.  [[#78]]

[#59]: https://github.com/dahlia/logtape/issues/59
[#78]: https://github.com/dahlia/logtape/issues/78

### @logtape/file

 -  Changed `getStreamFileSink()` to implement `AsyncDisposable` instead of
    `Disposable`.

 -  Fixed flaky behavior in high-volume logging scenarios where some log records
    could be lost during sink disposal. The sink now ensures all data is fully
    written to disk before disposal completes.

### @logtape/pretty

 -  Added `PrettyFormatterOptions.properties` option for displaying
    `LogRecord.properties` (structured data).  [[#69], [#70] by Matthias Feist]

[#69]: https://github.com/dahlia/logtape/issues/69
[#70]: https://github.com/dahlia/logtape/pull/70

### @logtape/sentry

 -  Changed the type of the `getSentrySink()` function to accept any Sentry
    client implementing the public capture APIs (was
    `(client?: Client) => Sink`). Introduced a structural `SentryClientLike`
    interface to avoid nominal type conflicts across differing `@sentry/core`
    instances. [[#80] by Sora Morimoto]

 -  Fixed preservation of Sentry template metadata by returning a
    `ParameterizedString` from the internal `getParameterizedString()` so that
    `captureMessage` receives the templated form and breadcrumbs/formatting can
    leverage `__sentry_template_*` metadata. [[#80] by Sora Morimoto]

 -  Fixed cross-runtime compatibility by removing an unnecessary `node:util`
    type import referenced only by documentation, avoiding module resolution
    issues outside Node.js. [[#80] by Sora Morimoto]

[#80]: https://github.com/dahlia/logtape/pull/80


Version 1.0.6
-------------

Released on October 22, 2025.

 -  Fixed Vercel Edge Runtime compatibility issue where LogTape caused
    “Node.js API is used (process.on) which is not supported in the Edge
    Runtime” error during configuration. Implemented defense-in-depth approach
    with both `EdgeRuntime` global variable detection and dynamic bracket
    notation access (`proc?.["on"]`) to avoid static analysis detection while
    ensuring runtime safety.  [[#92]]

 -  Changed `getStreamFileSink()` in *@logtape/file* package to return
    `Sink & AsyncDisposable` instead of `Sink & Disposable` for proper
    asynchronous stream cleanup. The previous synchronous disposal did not wait
    for streams to finish flushing data to disk, causing incomplete writes in
    high-volume logging scenarios and resource leaks. The new async disposal
    properly waits for both the stream ‘finish’ event and file handle closure,
    ensuring all data is written and resources are cleaned up correctly.


Version 1.0.5
-------------

Released on September 10, 2025.

 -  The satellite packages (*@logtape/file*, *@logtape/otel*,
    *@logtape/redaction*, *@logtape/sentry*, and *@logtape/syslog*)
    now properly specify version compatibility constraints for their peer
    dependency on *@logtape/logtape*, ensuring consumers install compatible
    versions of the core package.


Version 1.0.4
-------------

Released on July 6, 2025.

 -  Fixed a bug where the optimized code paths in `getJsonLinesFormatter()`
    did not output newline characters between JSON objects, violating the
    JSON Lines specification. This completes the fix that was partially
    addressed in version 1.0.3.


Version 1.0.3
-------------

Released on July 6, 2025.

 -  Fixed a bug where `jsonLinesFormatter` and the formatter returned by
    `getJsonLinesFormatter()` did not output newline characters between
    JSON objects, violating the JSON Lines specification that requires
    one JSON object per line.


Version 1.0.2
-------------

Released on July 4, 2025.

 -  Fixed Vercel Edge Functions compatibility issue where LogTape caused Node.js
    API warnings due to `process.on` usage detection. Refactored process access
    to use type-safe `globalThis` casting instead of `@ts-ignore` directive.
    [[#66], [#67] by Martin Petrovsky]

[#66]: https://github.com/dahlia/logtape/issues/66
[#67]: https://github.com/dahlia/logtape/pull/67


Version 1.0.1
-------------

Released on July 3, 2025.

 -  Fixed React Native compatibility issue in *@logtape/pretty* package where
    top-level Node.js imports caused build failures. Replaced direct `node:util`
    imports with platform-specific utilities using conditional module loading
    via *package.json* imports map.  [[#63]]

 -  Fixed compatibility issue with Cloudflare Workers where `process.on()` is
    not available, causing configuration to fail with
    `process.on is not a function` error. LogTape now checks for `process.on()`
    availability before attempting to register exit handlers.
    [[#64], [#65] by Martin Petrovsky]

[#63]: https://github.com/dahlia/logtape/issues/63
[#64]: https://github.com/dahlia/logtape/issues/64
[#65]: https://github.com/dahlia/logtape/pull/65


Version 1.0.0
-------------

Released on June 22, 2025.

 -  Added `getLogLevels()` function to retrieve all available log levels.

 -  Added `LogMethod` type for better type inference of logger methods.

 -  Added `nonBlocking` option to `getConsoleSink()`, `getStreamSink()`,
    `getFileSink()`, and `getRotatingFileSink()` for high-performance logging
    scenarios. When enabled, log records are buffered and flushed in the
    background, preventing blocking of the main thread.

     -  Console and stream sinks accept
        `nonBlocking?: boolean | { bufferSize?: number; flushInterval?: number }`
        option.
     -  File sinks accept `nonBlocking?: boolean` option.
     -  Default buffer size is 100 records for console/stream sinks and
        background flushing for file sinks.
     -  Default flush interval is 100ms for console/stream sinks.
     -  Console sink returns `Sink & Disposable` in non-blocking mode.
     -  Stream and file sinks return `Sink & AsyncDisposable` in non-blocking mode.
     -  Buffer-full flushes are now asynchronous (non-blocking) instead of
        synchronous to maintain performance during high-volume logging.
     -  Console and stream sinks include automatic buffer overflow protection
        that prevents unbounded memory growth by dropping oldest records when
        buffer exceeds 2x the configured size.
     -  Errors during background flushing are silently ignored to prevent
        application disruption.

 -  Added `getStreamFileSink()` function in *@logtape/file* package for
    high-performance file logging using Node.js PassThrough streams.

     -  Added `StreamFileSinkOptions` interface for configuring stream-based
        file sink behavior.
     -  Uses PassThrough streams piped to WriteStreams for optimal I/O performance
        with automatic backpressure management and non-blocking writes.
     -  Optimized for high-volume logging scenarios with superior throughput
        compared to standard file sinks.
     -  Simple configuration with `highWaterMark` (default: 16384 bytes) and
        optional custom `formatter` options.
     -  Automatic stream cleanup and proper resource disposal via `Disposable`
        interface.
     -  Ideal for production applications requiring high-performance file logging
        without complex buffering configuration.

 -  Added `fromAsyncSink()` function to convert async sinks to regular sinks
    with proper async handling.

     -  Added `AsyncSink` type: `(record: LogRecord) => Promise<void>`.
     -  `fromAsyncSink()` chains async operations to ensure order preservation.
     -  Errors in async sinks are caught to prevent breaking the promise chain.
     -  Returns a sink with `AsyncDisposable` support that waits for all
        pending operations on disposal.

 -  Added *@logtape/cloudwatch-logs* package for AWS CloudWatch Logs
    integration. [[#48], [#49]]

     -  Added `getCloudWatchLogsSink()` function to send logs to AWS CloudWatch
        Logs.
     -  Added `CloudWatchLogsSinkOptions` interface for configuration.
     -  Supports intelligent batching up to 10,000 events or 1MiB per batch.
     -  Includes exponential backoff retry strategy for error handling.
     -  Works with existing CloudWatch Logs clients or creates new ones
        automatically.
     -  Supports custom AWS credentials and regions.
     -  Added `formatter` option to support custom text formatters, including
        `jsonLinesFormatter()` for enhanced CloudWatch Logs Insights querying
        capabilities with dot notation support.

 -  Added *@logtape/windows-eventlog* package for Windows Event Log
    integration. [[#47], [#50]]

     -  Added `getWindowsEventLogSink()` function to send logs to Windows Event
        Log.
     -  Added `WindowsEventLogSinkOptions` interface for configuration.
     -  Cross-runtime support: Works with Deno, Node.js, and Bun on Windows.
     -  Uses runtime-optimized FFI implementations: Deno FFI, koffi for Node.js,
        and Bun FFI for maximum performance.
     -  Supports all LogTape log levels with proper Event Log type mapping
        (Error, Warning, Information).
     -  Includes structured logging support with formatted context information.
     -  Added `validateWindowsPlatform()` function for platform validation.
     -  Added `WindowsPlatformError` and `WindowsEventLogError` for proper error
        handling.
     -  Platform-restricted installation (Windows only) for safety.
     -  Includes PowerShell-based test verification for actual Event Log
        integration.

 -  Added *@logtape/pretty* package for beautiful console formatting designed
    for local development. [[#46], [#51]]

     -  Added `getPrettyFormatter()` function to create visually appealing log
        formatters with colorful icons, smart category truncation, and perfect
        column alignment.
     -  Added `prettyFormatter` constant for quick setup with sensible defaults.
     -  Added `PrettyFormatterOptions` interface for extensive customization.
     -  Features Signale-inspired design with emojis for each log level:
        🔍 trace, 🐛 debug, ✨ info, ⚠️ warning, ❌ error, 💀 fatal.
     -  Includes smart category truncation that preserves important context
        while maintaining layout (e.g., `app·server…middleware`).
     -  Supports true color terminals with rich color schemes and dimmed text
        for enhanced readability.
     -  Provides optional timestamp display, custom icons, color control, and
        flexible layout options.
     -  Supports multiple text styles combination (e.g., `["bold", "underline"]`)
        for level, category, message, and timestamp formatting.
     -  Includes word wrapping feature with proper indentation alignment
        to maintain visual consistency for long messages.
     -  Optimized for development environments with focus on visual clarity
        and developer experience.

 -  Added *@logtape/adaptor-pino* package for integrating LogTape with Pino
    logging infrastructure.  [[#52]]

     -  Added `getPinoSink()` function to forward LogTape log records to Pino
        loggers.
     -  Added `PinoSinkOptions` interface for configuring the adapter behavior.
     -  Added `CategoryOptions` interface for customizing category formatting in
        Pino log messages.
     -  Added `install()` function for convenient auto-configuration with
        custom Pino logger and configuration options.
     -  Supports configurable category display with position (`start`/`end`),
        decorators (`[]`, `()`, `<>`, `{}`, `:`, `-`, `|`, `/`, or none), and
        custom separators for multi-part categories.
     -  Maps LogTape log levels to equivalent Pino levels.
     -  Preserves LogTape's structured logging properties as Pino fields.
     -  Enables seamless adoption of LogTape-enabled libraries in applications
        using Pino without requiring logging infrastructure changes.

 -  Added *@logtape/adaptor-winston* package for integrating LogTape with
    winston logging infrastructure.  [[#52]]

     -  Added `getWinstonSink()` function to forward LogTape log records to
        winston loggers.
     -  Added `WinstonSinkOptions` interface for configuring the adapter
        behavior.
     -  Added `CategoryOptions` interface for customizing category formatting in
        winston log messages.
     -  Added `install()` function for convenient auto-configuration with
        optional custom winston logger and configuration options.
     -  Added `install.ts` module for automatic setup via simple import.
     -  Supports configurable category display with position (`start`/`end`),
        decorators (`[]`, `()`, `<>`, `{}`, `:`, `-`, `|`, `/`, or none), and
        custom separators for multi-part categories.
     -  Maps LogTape log levels to equivalent winston levels with customizable
        level mapping.
     -  Supports custom value formatters for interpolated values in log
        messages.
     -  Preserves LogTape's structured logging properties as winston fields.
     -  Enables seamless adoption of LogTape-enabled libraries in applications
        using winston without requiring logging infrastructure changes.

 -  Fixed browser support for *@logtape/otel* package by removing direct
    `node:process` dependency.  [[#53]]

     -  Replaced `node:process` import with cross-runtime environment variable
        access that works in Deno, Node.js, and browsers.
     -  Changed tsdown platform setting from `"node"` to `"neutral"` to enable
        browser compatibility.
     -  The `getOpenTelemetrySink()` function now works in all JavaScript
        runtimes without throwing module resolution errors.

 -  Removed the deprecated `LoggerConfig.level` property.  Use
    `LoggerConfig.lowestLevel` instead for setting the minimum log level, or
    use `LoggerConfig.filters` for more advanced filtering.

[#46]: https://github.com/dahlia/logtape/issues/46
[#47]: https://github.com/dahlia/logtape/issues/47
[#48]: https://github.com/dahlia/logtape/issues/48
[#49]: https://github.com/dahlia/logtape/pull/49
[#50]: https://github.com/dahlia/logtape/pull/50
[#51]: https://github.com/dahlia/logtape/pull/51
[#52]: https://github.com/dahlia/logtape/issues/52
[#53]: https://github.com/dahlia/logtape/issues/53


Version 0.12.3
--------------

Released on September 10, 2025.

 -  The satellite packages (*@logtape/file*, *@logtape/otel*,
    *@logtape/redaction*, *@logtape/sentry*, and *@logtape/syslog*)
    now properly specify version compatibility constraints for their peer
    dependency on *@logtape/logtape*, ensuring consumers install compatible
    versions of the core package.


Version 0.12.2
--------------

Released on July 6, 2025.

 -  Fixed a bug where `jsonLinesFormatter` and the formatter returned by
    `getJsonLinesFormatter()` did not output newline characters between
    JSON objects, violating the JSON Lines specification that requires
    one JSON object per line.


Version 0.12.1
--------------

Released on June 19, 2025.

 -  Fixed module resolution issues in CommonJS environments and bundlers
    like Vite by properly configuring conditional exports for types.

     -  Updated all package.json exports to use conditional `types` exports with
        separate `.d.ts` files for ESM imports and `.d.cts` files for CommonJS
        requires.
     -  This resolves runtime errors in frameworks like SvelteKit that require
        proper CommonJS modules for modules imported in CommonJS contexts.


Version 0.12.0
--------------

Released on June 15, 2025.

 -  Added the `"trace"` severity level, which is lower than `"debug"`.  [[#24]]

     -  Added `"trace"` to the `LogLevel` union type.
     -  Added `Logger.trace()` method.

 -  Added `Logger.warning()` method which is an alias for `Logger.warn()`.
    [[#44]]

 -  Added `bufferSize` and `flushInterval` options to `FileSinkOptions` for
    configurable buffering in file sinks.

     -  `getFileSink()` and `getRotatingFileSink()` functions now accept a
        `bufferSize` option to control write buffering behavior.
     -  `getFileSink()` and `getRotatingFileSink()` functions now accept
        a `flushInterval` option to control the time-based flushing of
        the buffer to disk.
     -  When `bufferSize` is 0 or negative, writes are immediate without
        buffering.
     -  When `bufferSize` is positive, log entries are buffered until the
        buffer size is exceeded, then flushed to disk.
     -  Default buffer size is 8192 characters for improved performance.
     -  Buffer content is automatically flushed when the sink is disposed.
     -  When `flushInterval` is 0 or negative, the time-based flushing is
        disabled.
     -  Default `flushInterval` is 5000 milliseconds (5 seconds) for
        periodic flushing.

 -  Added *@logtape/syslog* package for sending log messages to syslog servers
    using RFC 5424 format.

     -  Added `getSyslogSink()` function to create syslog sinks with support for
        both UDP and TCP protocols.
     -  Supports all standard RFC 5424 facilities (`kern`, `user`, `mail`,
        `daemon`, `local0`–`7`, etc.) and automatic priority calculation.
     -  Includes structured data support for log record properties with proper
        RFC 5424 escaping of special characters.
     -  Cross-runtime compatibility with Deno, Node.js, and Bun.
     -  Configurable connection timeouts, custom hostnames, and application
        names.

 -  Now *@logtape/otel*, *@logtape/sentry*, and *@logtape/syslog* packages are
    released along with *@logtape/logtape* package.  This means they share the
    same version number and changelog.  This is to ensure that the packages are
    always compatible with each other and to simplify the release process.

 -  Improved build and test infrastructure by migrating from [dnt] to [tsdown]
    for npm package bundling.  [[#43]]

[dnt]: https://github.com/denoland/dnt
[tsdown]: https://tsdown.dev/
[#24]: https://github.com/dahlia/logtape/issues/24
[#43]: https://github.com/dahlia/logtape/issues/43
[#44]: https://github.com/dahlia/logtape/issues/44


Version 0.11.1
--------------

Released on July 6, 2025.

 -  Fixed a bug where `jsonLinesFormatter` and the formatter returned by
    `getJsonLinesFormatter()` did not output newline characters between
    JSON objects, violating the JSON Lines specification that requires
    one JSON object per line.


Version 0.11.0
--------------

Released on June 2, 2025.

 -  Loggers now allow to interpolate all properties at once through the special
    placeholder `{*}`.  This is useful for logging objects with many properties
    without having to specify each property name in the message template.

     -  `Logger.debug()`, `Logger.info()`, `Logger.warn()`, `Logger.error()`,
        and `Logger.fatal()` methods now accept a message template with the
        `{*}` placeholder.  Unless there is a property with the name `*`,
        the `{*}` placeholder will be replaced with a stringified version of
        the `LogRecord.properties` object.
     -  As a shorthand, overloads of `Logger.debug()`, `Logger.info()`,
        `Logger.warn()`, `Logger.error()`, and `Logger.fatal()` methods that
        accept an object as the first argument now treat the object as a
        message template with the `{*}` placeholder.  This is equivalent to
        calling the method with a message template of `{*}` and the object as
        the second argument.

 -  Added the built-in [JSON Lines] formatter.

     -  Added `jsonLinesFormatter()` function.
     -  Added `getJsonLinesFormatter()` function.
     -  Added `JsonLinesFormatterOptions` interface.

[JSON Lines]: https://jsonlines.org/


Version 0.10.0
--------------

Released on May 19, 2025.

 -  Added `@logtape/redaction` package for redacting sensitive information
    from log records.

     -  Added `redactByField()` function.
     -  Added `FieldPattern` type.
     -  Added `FieldPatterns` type.
     -  Added `FieldRedactionOptions` interface.
     -  Added `DEFAULT_REDACT_FIELDS` constant.
     -  Added `redactByPattern()` function.
     -  Added `RedactionPattern` interface.
     -  Added `RedactionPatterns` type.
     -  Added `CREDIT_CARD_NUMBER_PATTERN` constant.
     -  Added `EMAIL_ADDRESS_PATTERN` constant.
     -  Added `JWT_PATTERN` constant.
     -  Added `KR_RRN_PATTERN` constant.
     -  Added `US_SSN_PATTERN` constant.

 -  The text formatter now can omit the timestamp from the formatted message.
    [[#35] by Ooker]

     -  Changed the type of the `TextFormatterOptions.timestamp` option to
        `"date-time-timezone" | "date-time-tz" | "date-time" | "time-timezone" | "time-tz" | "time" | "date" | "rfc3339" | "none" | "disabled" | ((ts: number) => string | null)`
        (was
        `"date-time-timezone" | "date-time-tz" | "date-time" | "time-timezone" | "time-tz" | "time" | "date" | "rfc3339" | ((ts: number) => string)`).
     -  Changed the type of the `FormattedValues.timestamp` property to
        `string | null` (was `string`).

 -  Added `FileSinkOptions.lazy` option.  [[#38], [#39] by Rickey Ward]

 -  The `configure()` and `configureSync()` functions now check for duplicate
    logger configurations with the same category and throw a `ConfigError` when
    detected.  This prevents unintended overriding of logger configurations when
    configuring multiple loggers with the same category.  [[#41]]

[#35]: https://github.com/dahlia/logtape/pull/35
[#38]: https://github.com/dahlia/logtape/issues/38
[#39]: https://github.com/dahlia/logtape/pull/39
[#41]: https://github.com/dahlia/logtape/issues/41


Version 0.9.2
-------------

Released on May 15, 2025.

 -  Fixed a bug where importing `@logtape/logtape` threw a `ReferenceError`
    on Node.js or Bun when LogTape was installed from JSR (instead of npm).
    [[#42]]

[#42]: https://github.com/dahlia/logtape/issues/42


Version 0.9.1
-------------

Released on April 24, 2025.

 -  Fixed a CORS error when using LogTape in web browser environments like Fresh
    islands components due to importing Node.js `node:util` module.  [[#40]]

[#40]: https://github.com/dahlia/logtape/issues/40


Version 0.9.0
-------------

Released on March 1, 2025.

 -  Moved file sinks and rotating file sinks to separate packages.
    [[#19], [#27], [#28]]

     -  Moved `getFileSink()` function to `@logtape/file` package.
     -  Moved `FileSinkOptions` interface to `@logtape/file` package.
     -  Moved `getRotatingFileSink()` function to `@logtape/file` package.
     -  Moved `RotatingFileSinkOptions` interface to `@logtape/file` package.

 -  Added synchronous versions of configuration functions.
    [[#12], [#29] by Murph Murphy]

     -  Added `configureSync()` function.
     -  Added `disposeSync()` function.
     -  Added `resetSync()` function.

 -  Added `ConsoleSinkOptions.levelMap` option.

[#12]: https://github.com/dahlia/logtape/issues/12
[#19]: https://github.com/dahlia/logtape/issues/19
[#27]: https://github.com/dahlia/logtape/issues/27
[#28]: https://github.com/dahlia/logtape/issues/28
[#29]: https://github.com/dahlia/logtape/pull/29


Version 0.8.2
-------------

Released on February 11, 2025.

 -  Fixed a bug of text formatters where they truncated string and array values
    in the formatted message.  [[#30]]

[#30]: https://github.com/dahlia/logtape/issues/30


Version 0.8.1
-------------

Released on February 1, 2025.

 -  Fixed a bug where when a child logger is configured with a lower
    `lowestLevel` than its parent logger, a log record with a severity level
    lower than the parent logger's `lowestLevel` and higher than the child
    logger's `lowestLevel` would not be filtered out by the parent logger.


Version 0.8.0
-------------

Released on November 20, 2024.

 -  Renewed the API to configure the lowest severity level of loggers.  [[#26]]

     -  Added `LoggerConfig.lowestLevel` property.
     -  Deprecated `LoggerConfig.level` property in favor of
        `LoggerConfig.lowestLevel`.

 -  Added `compareLogLevel()` function.

[#26]: https://github.com/dahlia/logtape/issues/26


Version 0.7.2
-------------

Released on February 11, 2025.

 -  Fixed a bug of text formatters where they truncated string and array values
    in the formatted message.  [[#30]]


Version 0.7.1
-------------

Released on October 30, 2024.

 -  The `withContext()` function no more throws an error
    even if no `contextLocalStorage` is configured.  Instead,  it will log
    a warning message to the `["logtape", "meta"]` logger.


Version 0.7.0
-------------

Released on October 29, 2024.

 -  Introduced implicit contexts.

     -  Added `withContext()` function.
     -  Added `Config.contextLocalStorage` option.
     -  Added `ContextLocalStorage` interface.


Version 0.6.5
-------------

Released on February 11, 2025.

 -  Fixed a bug of text formatters where they truncated string and array values
    in the formatted message.  [[#30]]


Version 0.6.4
-------------

Released on October 28, 2024.

 -  Fixed a build warning due to importing `node:fs` and `node:util` modules on
    Next.js' client rendering.  [[#19]]
 -  Made it to work on Deno 2.0.0 or higher.


Version 0.6.3
-------------

Released on October 3, 2024.

 -  Fixed a build error due to importing `node:fs` and `node:util` modules on
    Next.js' client rendering.


Version 0.6.2
-------------

Released on September 24, 2024.

 -  Fixed a build warning due to importing `node:util` module on [Next.js].
    [[#11]]

[Next.js]: https://nextjs.org/
[#11]: https://github.com/dahlia/logtape/issues/11


Version 0.6.1
-------------

Released on September 24, 2024.

 -  Fixed a build error due to importing `node:util` module on [Vite].  [[#18]]

[Vite]: https://vitejs.dev/
[#18]: https://github.com/dahlia/logtape/issues/18


Version 0.6.0
-------------

Released on September 24, 2024.

 -  Loggers now can override sinks of their ascendants.  Still, they inherit
    the sinks of their ascendants by default.  [[#15]]

     -  Added `LoggerConfig.parentSinks` property.

 -  Placeholders in message templates now forgive leading and trailing spaces.
    However, if a property with exactly the same name exists, it will be
    prioritized over space-trimmed properties.  [[#16]]

 -  Added `LogRecord.rawMessage` property.  [[#17]]

 -  Built-in text formatters now can be customized with a `TextFormatterOptions`
    object.  [[#13]]

     -  Added `TextFormatterOptions` interface.
     -  Added `FormattedValues` interface.
     -  Added `getTextFormatter()` function.
     -  Added `AnsiColor` type.
     -  Added `AnsiStyle` type.
     -  Added `AnsiColorFormatterOptions` interface.
     -  Added `getAnsiColorFormatter()` function.

[#13]: https://github.com/dahlia/logtape/issues/13
[#15]: https://github.com/dahlia/logtape/issues/15
[#16]: https://github.com/dahlia/logtape/issues/16
[#17]: https://github.com/dahlia/logtape/issues/17


Version 0.5.4
-------------

Released on September 24, 2024.

 -  Fixed a build warning due to importing `node:util` module on [Next.js].
    [[#11]]


Version 0.5.3
-------------

Released on September 24, 2024.

 -  Fixed a build error due to importing `node:util` module on [Vite].  [[#18]]


Version 0.5.2
-------------

Released on September 23, 2024.

 -  Fixed a build error due to top-level `await` on [Vite].  [[#14]]

[#14]: https://github.com/dahlia/logtape/issues/14


Version 0.5.1
-------------

Released on September 10, 2024.

 -  Fixed a bug of `defaultTextFormatter()` function where it rendered embedded
    values in the message as JSON instead of `util.inspect()` on Node.js and
    Bun.

 -  Fixed a bug of `ansiColorFormatter()` function where it failed to colorize
    embedded values in the message on Node.js and Bun.


Version 0.5.0
-------------

Released on August 29, 2024.

 -  LogTape now provides contexts for loggers.  [[#7], [#8]]

     -  Added `Logger.with()` method.

 -  The console sink now can take a `TextFormatter` besides a `ConsoleFormatter`
    for formatting log records.

     -  The type of `ConsoleSinkOptions.formatter` became
        `ConsoleFormatter | TextFormatter | undefined`
        (was `ConsoleFormatter | undefined`).

 -  Added `ansiColorFormatter()` function.

 -  `configure()` function's `filters` option became optional.

     -  The type of `Config.filters` became
        `Record<string, FilterLike> | undefined`
        (was `Record<string, FilterLike>`).

[#7]: https://github.com/dahlia/logtape/issues/7
[#8]: https://github.com/dahlia/logtape/pull/8


Version 0.4.3
-------------

Released on August 22, 2024.

 -  Fixed a bug where `getRotatingFileSink()` function had failed to create
    a new log file when there's no log file to rotate yet.  [[#9]]

[#9]: https://github.com/dahlia/logtape/issues/9


Version 0.4.2
-------------

Released on July 15, 2024.

 -  LogTape now works well on edge functions.  [[#5]]

     -  The npm version of LogTape no more depends on `node:stream/web` module.
     -  LogTape now works well with JavaScript runtimes that do not support
        `node:fs` module.
     -  LogTape now works well with JavaScript runtimes that do not support
        `WeakRef` class.
     -  Got rid of `eval()` from LogTape.

[#5]: https://github.com/dahlia/logtape/issues/5


Version 0.4.1
-------------

Released on July 2, 2024.

 -  Fixed a bug where LogTape failed to load under Node.js when incorporated
    in a project from JSR.  [[#3], [#4] by Kitson Kelly]

[#3]: https://github.com/dahlia/logtape/issues/3
[#4]: https://github.com/dahlia/logtape/pull/4


Version 0.4.0
-------------

Released on May 7, 2024.

 -  Curly braces can now be escaped with double curly braces.
    [[#1], [#2] by Diyar Oktay]

[#1]: https://github.com/dahlia/logtape/issues/1
[#2]: https://github.com/dahlia/logtape/pull/2


Version 0.3.1
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.3.0
-------------

Released on April 22, 2024.

 -  Added `parseLogLevel()` function.
 -  Added `isLogLevel()` function.
 -  Added `getConfig()` function.
 -  Added `withFilter()` function.


Version 0.2.3
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.2.2
-------------

Released on April 21, 2024.

 -  Fixed a bug where the configured sinks and filters were reset after
    some inactivity.  This was caused by garbage collection of the
    `Logger` instances.  The `Logger` instances are now kept alive by
    an internal set of strong references until explicitly `reset()` is
    called.


Version 0.2.1
-------------

Released on April 20, 2024.

 -  Removed `FileSinkDriver` interface.
 -  Added `RotatingFileSinkOptions` interface.


Version 0.2.0
-------------

Released on April 20, 2024.

 -  Sinks now can be asynchronously disposed of.  This is useful for
    sinks that need to flush their buffers before being closed.

     -  Added `dispose()` function.
     -  The return type of `configure()` function became `Promise<void>`
        (was `void`).
     -  The return type of `reset()` function became `Promise<void>`
        (was `void`).
     -  Configured sinks that implement `AsyncDisposable` are now disposed
        of asynchronously when the configuration is reset or the program exits.

 -  The return type of `getStreamSink()` function became
    `Sink & AsyncDisposable` (was `Sink & Disposable`).

 -  Added `getRotatingFileSink()` function.


Version 0.1.2
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.1.1
-------------

Released on April 21, 2024.

 -  Fixed a bug where the configured sinks and filters were reset after
    some inactivity.  This was caused by garbage collection of the
    `Logger` instances.  The `Logger` instances are now kept alive by
    an internal set of strong references until explicitly `reset()` is
    called.


Version 0.1.0
-------------

Initial release.  Released on April 19, 2024.

<!-- cSpell: ignore Murph runtimes Kitson Diyar Oktay Ooker -->
