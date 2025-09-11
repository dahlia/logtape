Sinks
=====

A sink is a destination of log messages.  LogTape currently provides a few
sinks: console and stream.  However, you can easily add your own sinks.
The signature of a `Sink` is:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
export type Sink = (record: LogRecord) => void;
~~~~

Here's a simple example of a sink that writes log messages to console:

~~~~ typescript{5-7} twoslash
// @noErrors: 2345
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    console(record) {
      console.log(record.message);
    }
  },
  // Omitted for brevity
});
~~~~

Console sink
------------

Of course, you don't have to implement your own console sink because LogTape
provides a console sink:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~

You can also customize the format of log messages by passing
a `ConsoleFormatter` to the `~ConsoleSinkOptions.formatter` option of
the `getConsoleSink()` function.  The signature of a `ConsoleFormatter` is:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
export type ConsoleFormatter = (record: LogRecord) => readonly unknown[];
~~~~

The returned array is a list of arguments that will be passed to
[`console.debug()`], [`console.info()`], [`console.warn()`],
or [`console.error()`] depending on the log level of the record.

Here's an example of a custom console formatter that formats log messages
with a custom message format:

~~~~ typescript {6-24} twoslash
// @noErrors: 2345
import { configure, getConsoleSink, type LogRecord } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter(record: LogRecord): readonly unknown[] {
        let msg = "";
        const values: unknown[] = [];
        for (let i = 0; i < record.message.length; i++) {
          if (i % 2 === 0) msg += record.message[i];
          else {
            msg += "%o";
            values.push(record.message[i]);
          }
        }
        return [
          `${record.level.toUpperCase()} %c${
            record.category.join("\xb7")
          } %c${msg}`,
          "color: gray;",
          "color: default;",
          ...values,
        ];
      }
    }),
  },
  // Omitted for brevity
});
~~~~

> [!TIP]
> Although they are ignored in Node.js and Bun, [you can use some styles]
> like `color: red;` or `font-weight: bold;` in the second and third arguments
> of the returned array to style the log messages in the browser console and
> Deno.

See also `getConsoleSink()` function and `ConsoleSinkOptions` interface
in the API reference for more details.

[`console.debug()`]: https://developer.mozilla.org/en-US/docs/Web/API/console/debug_static
[`console.info()`]: https://developer.mozilla.org/en-US/docs/Web/API/console/info_static
[`console.warn()`]: https://developer.mozilla.org/en-US/docs/Web/API/console/warn_static
[`console.error()`]: https://developer.mozilla.org/en-US/docs/Web/API/console/error_static
[you can use some styles]: https://developer.mozilla.org/en-US/docs/Web/API/console#styling_console_output


Stream sink
-----------

Another built-in sink is a stream sink.  It writes log messages to
a [`WritableStream`].  Here's an example of a stream sink that writes log
messages to the standard error:

::: code-group

~~~~ typescript twoslash [Deno]
// @noErrors: 2345
import { configure, getStreamSink } from "@logtape/logtape";
// ---cut-before---
await configure({
  sinks: {
    stream: getStreamSink(Deno.stderr.writable),  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~

~~~~ typescript{5} twoslash [Node.js]
// @noErrors: 2345
import "@types/node";
import { configure, getStreamSink } from "@logtape/logtape";
// ---cut-before---
import stream from "node:stream";

await configure({
  sinks: {
    stream: getStreamSink(stream.Writable.toWeb(process.stderr)),
  },
  // Omitted for brevity
});
~~~~

~~~~ typescript{1-13,17} twoslash [Bun]
// @noErrors: 2339 2345
import "@types/bun";
import { FileSink } from "bun";
import { configure, getStreamSink } from "@logtape/logtape";
// ---cut-before---
let writer: FileSink | undefined = undefined;
const stdout = new WritableStream({
  start() {
    writer = Bun.stderr.writer();
  },
  write(chunk) {
    writer?.write(chunk);
  },
  close() {
    writer?.close();
  },
  abort() {},
});

await configure({
  sinks: {
    stream: getStreamSink(stdout),
  },
  // Omitted for brevity
});
~~~~

:::

> [!NOTE]
> Here we use `WritableStream` from the Web Streams API.  If you are using
> Node.js, you cannot directly pass `process.stderr` to `getStreamSink` because
> `process.stderr` is not a `WritableStream` but a [`Writable`], which is a
> Node.js stream.  You can use [`Writable.toWeb()`] method to convert a Node.js
> stream to a `WritableStream`.

See also `getStreamSink()` function and `StreamSinkOptions` interface
in the API reference for more details.

[`WritableStream`]: https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
[`Writable`]: https://nodejs.org/api/stream.html#class-streamwritable
[`Writable.toWeb()`]: https://nodejs.org/api/stream.html#streamwritabletowebstreamwritable


Non-blocking sinks
------------------

*This API is available since LogTape 1.0.0.*

For production environments where logging overhead must be minimized, both
console and stream sinks support a `nonBlocking` option that buffers log
records and flushes them in the background. This prevents logging operations
from blocking the main thread.

### Console sink with non-blocking mode

The console sink can be configured to work in non-blocking mode:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    // Simple non-blocking mode with default settings
    console: getConsoleSink({ nonBlocking: true }),
  },
  // Omitted for brevity
});
~~~~

You can also customize the buffer size and flush interval:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink({
      nonBlocking: {
        bufferSize: 1000,    // Flush after 1000 records
        flushInterval: 50    // Flush every 50ms
      }
    }),
  },
  // Omitted for brevity
});
~~~~

### Stream sink with non-blocking mode

Similarly, the stream sink supports non-blocking mode:

::: code-group

~~~~ typescript twoslash [Deno]
// @noErrors: 2345
import { configure, getStreamSink } from "@logtape/logtape";

await configure({
  sinks: {
    stream: getStreamSink(Deno.stderr.writable, {
      nonBlocking: {
        bufferSize: 500,
        flushInterval: 100
      }
    }),
  },
  // Omitted for brevity
});
~~~~

~~~~ typescript twoslash [Node.js]
// @noErrors: 2345
import { configure, getStreamSink } from "@logtape/logtape";
import stream from "node:stream";

await configure({
  sinks: {
    stream: getStreamSink(
      stream.Writable.toWeb(process.stderr),
      { nonBlocking: true }
    ),
  },
  // Omitted for brevity
});
~~~~

:::

### Important considerations

When using non-blocking sinks:

Disposal
:   Non-blocking sinks implement `Disposable` (console) or `AsyncDisposable`
    (stream) to ensure all buffered logs are flushed on cleanup.  Usually,
    they are automatically disposed when the application exits or when
    the configuration is reset.  However, you may need to
    [explicitly dispose](#example-disposal) them to ensure all logs are flushed
    on some platforms (e.g., Cloudflare Workers).

Error handling
:   Errors during background flushing are silently ignored to avoid disrupting
    the application. Ensure your logging destination is reliable.

Buffer overflow protection
:   To prevent unbounded memory growth during high-volume logging, both sinks
    implement overflow protection. When the internal buffer exceeds twice the
    configured buffer size, the oldest log records are automatically dropped
    to make room for new ones.

Performance characteristics
:   - **Buffer-full flushes**: When the buffer reaches capacity, flushes are
      scheduled asynchronously (non-blocking) rather than executed immediately
    - **Memory overhead**: Small, bounded by the overflow protection mechanism
    - **Latency**: Log visibility may be delayed by up to the flush interval
    - **Throughput**: Significantly higher than blocking mode for high-volume scenarios

Use cases
:   Non-blocking mode is ideal for:

     -  High-throughput applications where logging latency matters
     -  Production environments where performance is critical
     -  Applications that log frequently but can tolerate slight delays
     -  Scenarios where occasional log loss is acceptable for performance

    It may not be suitable when:

     -  Immediate log visibility is required (e.g., debugging)
     -  Memory usage must be strictly controlled
     -  You need guaranteed log delivery without any loss
     -  Low-volume logging where the overhead isn't justified


File sink
---------

> [!NOTE]
> File sink is unavailable in the browser environment.

LogTape provides file sinks through a separate package *@logtape/file*:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/file
~~~~

~~~~ sh [npm]
npm add @logtape/file
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/file
~~~~

~~~~ sh [Yarn]
yarn add @logtape/file
~~~~

~~~~ sh [Bun]
bun add @logtape/file
~~~~

:::

The package provides two main file sink implementations:

### Standard file sink

The standard file sink provides comprehensive control over buffering behavior
and supports both blocking and non-blocking modes:

~~~~ typescript twoslash
// @noErrors: 2345
import { getFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getFileSink("my-app.log", {
      lazy: true,
      bufferSize: 8192,
      flushInterval: 5000,
      nonBlocking: true,
    }),
  },
  // Omitted for brevity
});
~~~~

> [!TIP]
> File sinks support buffering for improved performance through
> the `~FileSinkOptions.bufferSize` option (default: 8192 characters).
> To prevent log loss during unexpected process termination, you can use
> the `~FileSinkOptions.flushInterval` option (default: 5000ms) to
> automatically flush buffered logs after a specified time interval.
> Set `flushInterval: 0` to disable time-based flushing, or `bufferSize: 0` to
> disable buffering entirely for immediate writes.
>
> File sinks also support non-blocking mode through the `~FileSinkOptions.nonBlocking`
> option. When enabled, flush operations are performed asynchronously to prevent
> blocking the main thread during file I/O operations. In non-blocking mode,
> the sink returns `Sink & AsyncDisposable` instead of `Sink & Disposable`.
> Errors during background flushing are silently ignored to prevent
> application disruption.

### High-performance stream file sink

*This API is available since LogTape 1.0.0.*

For high-performance scenarios where you need optimal I/O throughput, use the
stream-based file sink. This implementation uses Node.js [`PassThrough`] streams
for superior performance in high-volume logging situations:

~~~~ typescript twoslash
// @noErrors: 2345
import { getStreamFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getStreamFileSink("my-app.log", {
      highWaterMark: 32768,  // 32KB buffer for high-volume logging
    }),
  },
  // Omitted for brevity
});
~~~~

[`PassThrough`]: https://nodejs.org/api/stream.html#class-streampassthrough

#### When to use the stream file sink

Use `getStreamFileSink()` when you need:

 -  *High-performance file logging* for production applications
 -  *Non-blocking I/O behavior* for real-time applications
 -  *Automatic backpressure handling* for high-volume scenarios
 -  *Simple file output* without complex buffering configuration

#### Performance characteristics

 -  *Optimized for high-volume logging* scenarios
 -  *Non-blocking*: Uses asynchronous I/O that doesn't block the main thread
 -  *Memory efficient*: Automatic backpressure prevents memory buildup
 -  *Stream-based*: Leverages Node.js native stream optimizations

#### Stream vs. standard file sink comparison

| Feature         | Stream File Sink                              | Standard File Sink                                           |
|-----------------|-----------------------------------------------|--------------------------------------------------------------|
| *Performance*   | Higher throughput, optimized for volume       | Good performance with configurable buffering                 |
| *Configuration* | Simple (just `highWaterMark` and `formatter`) | Comprehensive (buffer size, flush intervals, blocking modes) |
| *Buffering*     | Automatic via PassThrough streams             | Manual control with size and time-based flushing             |
| *Use case*      | High-volume production logging                | General-purpose with fine-grained control                    |

For more control over buffering behavior and advanced options like non-blocking
modes, lazy loading, and custom flush intervals, use the standard `getFileSink()`
function instead.

See also `getFileSink()` and `getStreamFileSink()` functions along with
`FileSinkOptions` and `StreamFileSinkOptions` interfaces in the API reference
for more details.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use file sinks.


Rotating file sink
------------------

> [!NOTE]
> Rotating file sink is unavailable in the browser environment.

A rotating file sink is a file sink that rotates log files, which allows you
to manage log files more effectively, especially in long-running applications
or environments where log file size can grow significantly over time.

It writes log records to a file, but unlike a standard file sink, it has
the ability to *rotate* the log file when it reaches a certain size. This means:

 1. When the current log file reaches a specified maximum size, it is closed and
    renamed.
 2. A new log file is created with the original name to continue logging.
 3. Old log files are kept up to a specified maximum number, with the oldest
    being deleted when this limit is reached.

This rotation process helps prevent any single log file from growing too large,
which can cause issues with file handling, log analysis, and storage management.

To use the rotating file sink, you can use the `getRotatingFileSink()` function,
which is provided by the *@logtape/file* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/file
~~~~

~~~~ sh [npm]
npm add @logtape/file
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/file
~~~~

~~~~ sh [Yarn]
yarn add @logtape/file
~~~~

~~~~ sh [Bun]
bun add @logtape/file
~~~~

:::

Here's an example of a rotating file sink that writes log messages to a file:

~~~~ typescript twoslash
// @noErrors: 2345
import { getRotatingFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getRotatingFileSink("my-app.log", {
      maxSize: 0x400 * 0x400,  // 1 MiB
      maxFiles: 5,
    }),
  },
  // Omitted for brevity
});
~~~~

Rotated log files are named with a suffix like *.1*, *.2*, *.3*, and so on.

For more details, see `getRotatingFileSink()` function and
`RotatingFileSinkOptions` interface in the API reference.

> [!TIP]
> Like regular file sinks, rotating file sinks support buffering through the
> `~FileSinkOptions.bufferSize` option (default: 8192 characters) and time-based
> flushing through the `~FileSinkOptions.flushInterval` option (default: 5000ms)
> to prevent log loss during unexpected process termination. They also support
> non-blocking mode through the `~FileSinkOptions.nonBlocking` option for
> asynchronous flush operations. These options work the same way as in regular
> file sinks.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the rotating file sink.


Fingers crossed sink
--------------------

*This API is available since LogTape 1.1.0.*

The fingers crossed sink implements a “fingers crossed” logging pattern where
debug and low-level logs are buffered in memory and only output when
a significant event (like an `"error"`) occurs. This pattern reduces log noise
in normal operations while providing detailed context when issues arise,
making logs more readable and actionable.

### Basic usage

The simplest way to use the fingers crossed sink is to wrap an existing sink:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink()),
  },
  loggers: [
    { category: [], sinks: ["console"], lowestLevel: "debug" },
  ],
});
~~~~

With this configuration:

 -  `"debug"`, `"info"`, and `"warning"` logs are buffered in memory
 -  When an `"error"` (or higher) occurs, all buffered logs plus the error are
    output
 -  Subsequent logs pass through directly until the next trigger event

### Customizing trigger level

You can customize when the buffer is flushed by setting the trigger level:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      triggerLevel: "warning",  // Trigger on warning or higher
      maxBufferSize: 500,       // Keep last 500 records
    }),
  },
  // Omitted for brevity
});
~~~~

### Category isolation

By default, all log records share a single buffer.  For applications with
multiple modules or components, you can isolate buffers by category to prevent
one component's errors from flushing logs from unrelated components:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByCategory: "descendant",
    }),
  },
  // Omitted for brevity
});
~~~~

Category isolation modes:

`"descendant"`
:   Flush child category buffers when parent category triggers.
    For example, an error in `["app"]` flushes buffers for `["app", "auth"]`
    and `["app", "db"]`.

`"ancestor"`
:   Flush parent category buffers when child category triggers.
    For example, an error in `["app", "auth"]` flushes the `["app"]` buffer.

`"both"`
:   Flush both parent and child category buffers, combining descendant and
    ancestor modes.

### Custom category matching

For advanced use cases, you can provide a custom function to determine which
categories should be flushed:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByCategory: (triggerCategory, bufferedCategory) => {
        // Custom logic: flush if categories share the first element
        return triggerCategory[0] === bufferedCategory[0];
      },
    }),
  },
  // Omitted for brevity
});
~~~~

### Buffer management

The fingers crossed sink automatically manages buffer size to prevent memory
issues:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      maxBufferSize: 1000,  // Keep last 1000 records per buffer
    }),
  },
  // Omitted for brevity
});
~~~~

When the buffer exceeds the maximum size, the oldest records are automatically
dropped to prevent unbounded memory growth.

### Use cases

The fingers crossed sink is ideal for:

Production debugging
:   Keep detailed debug logs in memory without cluttering output,
    only showing them when errors occur to provide context.

Error investigation
:   Capture the sequence of events leading up to an error for thorough
    investigation.

Log volume management
:   Reduce log noise in normal operations while maintaining detailed visibility
    during issues.

Component isolation
:   Use category isolation to prevent log noise from one component affecting
    debugging of another component.

### Performance considerations

Memory usage
:   Buffered logs consume memory. Use appropriate buffer sizes and consider
    your application's memory constraints.

Trigger frequency
:   Frequent trigger events (like `"warning"`s) may reduce the effectiveness of
    buffering. Choose trigger levels carefully.

Category isolation overhead
:   Category isolation adds some overhead for category matching.
    For high-volume logging, consider using a single buffer
    if isolation isn't needed.

For more details, see the `fingersCrossed()` function and
`FingersCrossedOptions` interface in the API reference.


Text formatter
--------------

*The main article of this section is [Text formatters](./formatters.md).*

The sinks introduced above write log messages in a plain text format.
You can customize the format by providing a text formatter.

Here's an example of colorizing log messages in your terminal using
the `ansiColorFormatter`:

~~~~ typescript twoslash
// @noErrors: 2345
import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
} from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: ansiColorFormatter,
    }),
  },
  // Omitted for brevity
});
~~~~

It would look like this:

~~~~ ansi
[2m2025-06-12 10:34:10.465 +00[0m [1m[32mINF[0m [2mlogtape·meta:[0m LogTape loggers are configured.  Note that LogTape itself uses the meta logger, which has category [ [32m"logtape"[39m, [32m"meta"[39m ].  The meta logger purposes to log internal errors such as sink exceptions.  If you are seeing this message, the meta logger is automatically configured.  It's recommended to configure the meta logger with a separate sink so that you can easily notice if logging itself fails or is misconfigured.  To turn off this message, configure the meta logger with higher log levels than [32m"info"[39m.  See also <https://logtape.org/manual/categories#meta-logger>.
[2m2025-06-12 10:34:10.472 +00[0m [1mTRC[0m [2mmy-app·module:[0m This is a trace log.
[2m2025-06-12 10:34:10.473 +00[0m [1m[34mDBG[0m [2mmy-app·module:[0m This is a debug log with value: { foo: [33m123[39m }
[2m2025-06-12 10:34:10.473 +00[0m [1m[32mINF[0m [2mmy-app:[0m This is an informational log.
[2m2025-06-12 10:34:10.474 +00[0m [1m[33mWRN[0m [2mmy-app:[0m This is a warning.
[2m2025-06-12 10:34:10.475 +00[0m [1m[31mERR[0m [2mmy-app·module:[0m This is an error with exception: Error: This is an exception.
    at file:///tmp/test.ts:28:10
[2m2025-06-12 10:34:10.475 +00[0m [1m[35mFTL[0m [2mmy-app:[0m This is a fatal error.
~~~~

[JSON Lines]: https://jsonlines.org/


OpenTelemetry sink
------------------

If you have an [OpenTelemetry] collector running, you can use the OpenTelemetry
sink to send log messages to the collector using *@logtape/otel* package:

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

The quickest way to get started is to use the `getOpenTelemetrySink()`
function without any arguments:

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

This will use the default OpenTelemetry configuration, which is to send logs to
the OpenTelemetry collector running on `localhost:4317` or respects the `OTEL_*`
environment variables.

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

Or you can even pass an existing OpenTelemetry [`LoggerProvider`] instance:

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

For more information, see the documentation of the `getOpenTelemetrySink()`
function and `OpenTelemetrySinkOptions` type.

[OpenTelemetry]: https://opentelemetry.io/
[`LoggerProvider`]: https://open-telemetry.github.io/opentelemetry-js/classes/_opentelemetry_sdk_logs.LoggerProvider.html


Sentry sink
-----------

If you are using [Sentry] for error monitoring, you can use the Sentry sink to
send log messages to Sentry using *@logtape/sentry* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/sentry
~~~~

~~~~ sh [npm]
npm add @logtape/sentry
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/sentry
~~~~

~~~~ sh [Yarn]
yarn add @logtape/sentry
~~~~

~~~~ sh [Bun]
bun add @logtape/sentry
~~~~

:::

The quickest way to get started is to use the `getSentrySink()` function
without any arguments:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

await configure({
  sinks: {
    sentry: getSentrySink(),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

The log records will show up in the breadcrumbs of the Sentry issues:

![LogTape records show up in the breadcrumbs of a Sentry issue.](../screenshots/sentry.png)

If you want to explicitly configure the Sentry client, you can pass
the `Client` instance, which is returned by [`init()`] or [`getClient()`]
functions, to the `getSentrySink()` function:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import { init } from "@sentry/node";

const client = init({
  dsn: process.env.SENTRY_DSN,
});

await configure({
  sinks: {
    sentry: getSentrySink(client),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

[Sentry]: https://sentry.io/
[@logtape/sentry]: https://github.com/dahlia/logtape-sentry
[`init()`]: https://docs.sentry.io/platforms/javascript/apis/#init
[`getClient()`]: https://docs.sentry.io/platforms/javascript/apis/#getClient


Syslog sink
-----------

*This API is available since LogTape 0.12.0.*

If you have a syslog server running, you can use the syslog sink to send log
messages to the server using [RFC 5424] format via *@logtape/syslog* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/syslog
~~~~

~~~~ sh [npm]
npm add @logtape/syslog
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/syslog
~~~~

~~~~ sh [Yarn]
yarn add @logtape/syslog
~~~~

~~~~ sh [Bun]
bun add @logtape/syslog
~~~~

:::

The quickest way to get started is to use the `getSyslogSink()` function
without any arguments:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink(),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "debug" },
  ],
});
~~~~

This will send log messages to a syslog server running on `localhost:514`
using UDP protocol with the default facility `local0` and application name
derived from the process.

You can customize the syslog configuration by passing options to the
`getSyslogSink()` function:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink({
      hostname: "syslog.example.com",
      port: 1514,
      protocol: "tcp",
      facility: "mail",
      appName: "my-application",
      timeout: 5000,
    }),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "info" },
  ],
});
~~~~

[RFC 5424]: https://tools.ietf.org/html/rfc5424

### Structured data

RFC 5424 syslog supports structured data, which allows you to include
key–value pairs in log messages. LogTape automatically includes log record
properties as structured data when
the `~SyslogSinkOptions.includeStructuredData` option is enabled:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink({
      includeStructuredData: true,
      structuredDataId: "myapp@12345",
    }),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "debug" },
  ],
});
~~~~

With this configuration, log records with properties will include them as
structured data in the syslog message:

~~~~ typescript twoslash
import { configure, getLogger } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink({
      includeStructuredData: true,
      structuredDataId: "myapp@12345",
    }),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "debug" },
  ],
});

const logger = getLogger();
logger.info("User login successful", { userId: 12345, method: "oauth" });
~~~~

This will generate a syslog message like:

~~~~ log
<134>1 2024-01-01T12:00:00.000Z hostname myapp 1234 - [myapp@12345 userId="12345" method="oauth"] User login successful
~~~~

### Supported facilities

The syslog sink supports all standard RFC 5424 facilities:

 -  `kern`, `user`, `mail`, `daemon`, `auth`, `syslog`, `lpr`, `news`
 -  `uucp`, `cron`, `authpriv`, `ftp`
 -  `local0`, `local1`, `local2`, `local3`, `local4`, `local5`, `local6`, `local7`

### Protocol support

The syslog sink supports both UDP and TCP protocols:

UDP (default)
:   Fire-and-forget delivery, suitable for high-throughput
    logging where occasional message loss is acceptable.

TCP
:   Reliable delivery with connection management, suitable for critical
    log messages that must not be lost.

For more details, see the `getSyslogSink()` function and `SyslogSinkOptions`
interface in the API reference.


AWS CloudWatch Logs sink
------------------------

*This API is available since LogTape 1.0.0.*

If you are using AWS CloudWatch Logs for log aggregation and monitoring, you can
use the CloudWatch Logs sink to send log messages directly to AWS CloudWatch
using *@logtape/cloudwatch-logs* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/cloudwatch-logs
~~~~

~~~~ sh [npm]
npm add @logtape/cloudwatch-logs
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/cloudwatch-logs
~~~~

~~~~ sh [Yarn]
yarn add @logtape/cloudwatch-logs
~~~~

~~~~ sh [Bun]
bun add @logtape/cloudwatch-logs
~~~~

:::

The quickest way to get started is to use the `getCloudWatchLogsSink()`
function with your log group and stream configuration:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      region: "us-east-1",
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

You can also pass an existing CloudWatch Logs client for more control:

~~~~ typescript twoslash
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { configure } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

const client = new CloudWatchLogsClient({ region: "us-east-1" });

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      client,
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

### Performance and batching

The CloudWatch Logs sink automatically batches log events to optimize
performance and reduce API calls. You can customize the batching behavior:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      region: "us-east-1",
      batchSize: 500,        // Send batches of 500 events (default: 1000)
      flushInterval: 2000,   // Flush every 2 seconds (default: 1000ms)
      maxRetries: 5,         // Retry failed requests up to 5 times (default: 3)
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "debug" },
  ],
});
~~~~

### Error handling and meta logger

The CloudWatch Logs sink uses LogTape's meta logger to report errors that
occur during log transmission. When log events fail to send after exhausting
all retries, the error is logged to the `["logtape", "meta", "cloudwatch-logs"]`
category. This prevents logging failures from crashing your application while
still providing visibility into issues.

You can monitor these meta logs by configuring a separate sink for the meta
logger category:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({ /* ... */ }),
    console: getConsoleSink(),
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

See also [*Meta logger* section](./categories.md#meta-logger) for more details.

### Custom formatting

The CloudWatch Logs sink supports custom text formatters, allowing you to
control how log records are formatted before being sent to CloudWatch Logs.
By default, a simple text formatter is used, but you can specify any
`TextFormatter` from LogTape:

~~~~ typescript twoslash
import { configure, jsonLinesFormatter } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      region: "us-east-1",
      formatter: jsonLinesFormatter,  // Use JSON Lines format for structured logging
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

When using `jsonLinesFormatter`, log records are sent as JSON objects,
which enables powerful querying capabilities with CloudWatch Logs Insights:

~~~~ json
{
  "@timestamp": "2023-12-01T10:30:00.000Z",
  "level": "ERROR",
  "logger": "api.auth",
  "message": "Failed login attempt for user {\"email\":\"user@example.com\"}",
  "properties": {
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "attempts": 3
  }
}
~~~~

This format enables you to query logs using CloudWatch Logs Insights with
dot notation for nested fields:

~~~~ logsinsightsql
fields @timestamp, level, logger, message, properties.ip
| filter level = "ERROR"
| filter properties.attempts > 2
| sort @timestamp desc
| limit 100
~~~~

You can also use other built-in formatters like `defaultTextFormatter`,
or create your own custom formatter.

For more control over JSON formatting, you can use `getJsonLinesFormatter()`
with custom options:

~~~~ typescript twoslash
import { configure, getJsonLinesFormatter } from "@logtape/logtape";
import { getCloudWatchLogsSink } from "@logtape/cloudwatch-logs";

await configure({
  sinks: {
    cloudwatch: getCloudWatchLogsSink({
      logGroupName: "/aws/lambda/my-function",
      logStreamName: "my-stream",
      formatter: getJsonLinesFormatter({
        categorySeparator: ".",  // Use dots for category separation
        message: "template",     // Use message template instead of rendered one
      }),
    }),
  },
  loggers: [
    { category: [], sinks: ["cloudwatch"], lowestLevel: "info" },
  ],
});
~~~~

### IAM permissions

The CloudWatch Logs sink requires appropriate IAM permissions to send logs.
The minimal required permission is:

~~~~ json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:region:account-id:log-group:log-group-name:*"
      ]
    }
  ]
}
~~~~

For more details, see the `getCloudWatchLogsSink()` function and
`CloudWatchLogsSinkOptions` interface in the API reference.


Windows Event Log sink
----------------------

*This API is available since LogTape 1.0.0.*

If you are running your application on Windows, you can use the Windows Event Log
sink to send log messages directly to the Windows Event Log system using
*@logtape/windows-eventlog* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/windows-eventlog
~~~~

~~~~ sh [npm]
npm add @logtape/windows-eventlog
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/windows-eventlog
~~~~

~~~~ sh [Yarn]
yarn add @logtape/windows-eventlog
~~~~

~~~~ sh [Bun]
bun add @logtape/windows-eventlog
~~~~

:::

> [!NOTE]
> The Windows Event Log sink is only available on Windows platforms.
> The package installation is restricted to Windows (`"os": ["win32"]`) to
> prevent accidental usage on other platforms.

The quickest way to get started is to use the `getWindowsEventLogSink()`
function with your application source name:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getWindowsEventLogSink } from "@logtape/windows-eventlog";

await configure({
  sinks: {
    eventlog: getWindowsEventLogSink({
      sourceName: "MyApplication",
    }),
  },
  loggers: [
    { category: [], sinks: ["eventlog"], lowestLevel: "info" },
  ],
});
~~~~

### Cross-runtime support

The Windows Event Log sink works across multiple JavaScript runtimes on Windows:

Deno
:   Uses [Deno's native FFI] for optimal performance

Node.js
:   Uses the [koffi] library for FFI bindings

Bun
:   Uses [Bun's native FFI] for maximum performance

[Deno's native FFI]: https://docs.deno.com/runtime/fundamentals/ffi/
[koffi]: https://koffi.dev/
[Bun's native FFI]: https://bun.sh/docs/api/ffi

### Advanced configuration

The Windows Event Log sink always writes to the Windows `Application` log.
This is the standard location for application events and does not require
administrator privileges.

You can customize the sink behavior with additional options:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getWindowsEventLogSink } from "@logtape/windows-eventlog";

await configure({
  sinks: {
    eventlog: getWindowsEventLogSink({
      sourceName: "MyApplication",
      eventIdMapping: {
        error: 1001,
        warning: 2001,
        info: 3001,
      },
    }),
  },
  loggers: [
    { category: [], sinks: ["eventlog"], lowestLevel: "info" },
  ],
});
~~~~

### Log level mapping

LogTape log levels are automatically mapped to Windows Event Log types:

 -  `fatal`, `error` → **Error** (Type 1)
 -  `warning` → **Warning** (Type 2)
 -  `info`, `debug`, `trace` → **Information** (Type 4)

### Structured logging

The sink preserves structured logging data by including it in the event message:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["myapp"]);
logger.info("User logged in", { userId: 123, ip: "192.168.1.1" });
// Results in: "User logged in\n\nCategory: myapp\nProperties: {\"userId\":123,\"ip\":\"192.168.1.1\"}\nTimestamp: 2025-06-15T10:30:00.000Z"
~~~~

### Platform validation

The sink automatically validates that it's running on Windows and throws a
`WindowsPlatformError` if used on other platforms. This ensures your application
fails fast with a clear error message rather than silently failing.

### Error handling and meta logger

The Windows Event Log sink uses LogTape's meta logger to report errors that
occur during FFI operations and event logging. When FFI initialization fails
or event logging encounters errors, these issues are logged to the
`["logtape", "meta", "windows-eventlog"]` category. This prevents logging
failures from crashing your application while still providing visibility into
issues.

You can monitor these meta logs by configuring a separate sink for the meta
logger category:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";
import { getWindowsEventLogSink } from "@logtape/windows-eventlog";

await configure({
  sinks: {
    eventlog: getWindowsEventLogSink({ sourceName: "MyApp" }),
    console: getConsoleSink(),
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
    { category: [], sinks: ["eventlog"], lowestLevel: "info" },
  ],
});
~~~~

See also [*Meta logger* section](./categories.md#meta-logger) for more details.

The sink uses graceful error handling:

 -  FFI initialization failures are logged as warnings but don't crash
    the application
 -  Event logging failures are logged as warnings and continue processing
 -  Proper cleanup is performed when the sink is disposed

### Viewing logs

Once your application writes to the Windows Event Log, you can view the logs using:

 -  *Event Viewer* (*eventvwr.msc*)
 -  *PowerShell*: `Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='MyApplication'}`
 -  *Command Prompt*: `wevtutil qe Application /f:text /q:"*[System[Provider[@Name='MyApplication']]]"`

For more details, see the `getWindowsEventLogSink()` function and
`WindowsEventLogSinkOptions` interface in the API reference.



Async sink adapter
------------------

*This API is available since LogTape 1.0.0.*

LogTape sinks are synchronous by design for simplicity and performance.
However, sometimes you need to perform asynchronous operations like sending
logs to a remote server or writing to a database. The `fromAsyncSink()`
function provides a clean way to bridge async operations with LogTape's
synchronous sink interface.

### The `AsyncSink` type

The `AsyncSink` type represents an asynchronous sink function:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
export type AsyncSink = (record: LogRecord) => Promise<void>;
~~~~

### Creating an async sink

To create an async sink, define your function with the `AsyncSink` type:

~~~~ typescript twoslash
import { type AsyncSink, fromAsyncSink } from "@logtape/logtape";

const webhookSink: AsyncSink = async (record) => {
  await fetch("https://example.com/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp: record.timestamp,
      level: record.level,
      message: record.message,
      properties: record.properties,
    }),
  });
};

const sink = fromAsyncSink(webhookSink);
~~~~

### How it works

The `fromAsyncSink()` function:

 1. *Chains async operations*: Each log call is chained to the previous one
    using Promise chaining, ensuring logs are processed in order.
 2. *Handles errors gracefully*: If an async operation fails, the error is
    caught to prevent breaking the chain for subsequent logs.
 3. [*Implements `AsyncDisposable`*](#disposable-sink): The returned sink can be
    properly disposed, waiting for all pending operations to complete.

### Example: Database logging

Here's an example of logging to a database:

~~~~ typescript twoslash
// @noErrors: 2345
interface Database {
  /**
  * A hypothetical table interface.
  */
  readonly logs: Table<"logs">;
}
interface Table<TableName extends string> {
  /**
   * A hypothetical method to insert a record into the table.
   */
  insert(record: TableRecord<TableName>): Promise<void>;
}
interface TableRecord<TableName extends string> {
  timestamp: number;
  level: string;
  category: string;
  message: string;
  properties: string;
}
/**
 * A hypothetical database interface.
 */
const db = null as unknown as Database;
// ---cut-before---
import { type AsyncSink, configure, fromAsyncSink } from "@logtape/logtape";

const databaseSink: AsyncSink = async (record) => {
  await db.logs.insert({
    timestamp: record.timestamp,
    level: record.level,
    category: record.category.join("."),
    message: record.message.join(""),
    properties: JSON.stringify(record.properties),
  });
};

await configure({
  sinks: {
    database: fromAsyncSink(databaseSink),
  },
  loggers: [
    { category: [], sinks: ["database"], lowestLevel: "info" },
  ],
});
~~~~

### Important considerations

Configuration
:   Async sinks created with `fromAsyncSink()` require asynchronous disposal,
    which means they can only be used with the `configure()` function, not
    `configureSync()`. If you need synchronous configuration, you cannot use
    async sinks.

    See also the [*Synchronous configuration*
    section](./config.md#synchronous-configuration).

Error handling
:   Errors in async sinks are caught to prevent breaking
    the promise chain. Make sure to handle errors appropriately within your
    async sink if needed.

Disposal
:   Always ensure proper disposal of async sinks to wait for pending operations:

    ~~~~ typescript twoslash
    // @noErrors: 2345
    import { dispose } from "@logtape/logtape";

    // In your shutdown handler
    await dispose();
    ~~~~

    See also the [*Explicit disposal* section](#explicit-disposal) below.

For more details, see the `fromAsyncSink()` function and `AsyncSink` type
in the API reference.


Disposable sink
---------------

> [!TIP]
> If you are unfamiliar with the concept of disposables, see also the proposal
> of *[ECMAScript Explicit Resource Management]*.

A disposable sink is a sink that can be disposed of.  They are automatically
disposed of when the configuration is reset or the program exits.  The type
of a disposable sink is: `Sink & Disposable`.  You can create a disposable
sink by defining a `[Symbol.dispose]` method:

~~~~ typescript twoslash
import type { LogRecord, Sink } from "@logtape/logtape";
// ---cut-before---
const disposableSink: Sink & Disposable = (record: LogRecord) => {
  console.log(record.message);
};
disposableSink[Symbol.dispose] = () => {
  console.log("Disposed!");
};
~~~~

A sink can be asynchronously disposed of as well.  The type of an asynchronous
disposable sink is: `Sink & AsyncDisposable`.  You can create an asynchronous
disposable sink by defining a `[Symbol.asyncDispose]` method:

~~~~ typescript twoslash
import type { LogRecord, Sink } from "@logtape/logtape";
// ---cut-before---
const asyncDisposableSink: Sink & AsyncDisposable = (record: LogRecord) => {
  console.log(record.message);
};
asyncDisposableSink[Symbol.asyncDispose] = async () => {
  console.log("Disposed!");
};
~~~~

[ECMAScript Explicit Resource Management]: https://github.com/tc39/proposal-explicit-resource-management


Explicit disposal
-----------------

You can explicitly dispose of a sink by calling the `dispose()` method.  It is
useful when you want to flush the buffer of a sink without blocking returning
a response in edge functions.  Here's an example of using the `dispose()`
with [`ctx.waitUntil()`] in Cloudflare Workers:

~~~~ typescript twoslash
// @noErrors: 2345
import { type ExportedHandler, Response } from "@cloudflare/workers-types";
// ---cut-before---
import { configure, dispose } from "@logtape/logtape";

export default {
  async fetch(request, env, ctx) {
    await configure({ /* ... */ });
    // ...
    ctx.waitUntil(dispose());
    return new Response("...");
  }
} satisfies ExportedHandler;
~~~~

[`ctx.waitUntil()`]: https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil

<!-- cSpell: ignore otel -->
