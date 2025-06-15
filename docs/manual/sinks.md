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


File sink
---------

> [!NOTE]
> File sink is unavailable in the browser environment.

LogTape provides a file sink through a separate package *@logtape/file*:

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

Here's an example of a file sink that writes log messages to a file:

~~~~ typescript twoslash
// @noErrors: 2345
import { getFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getFileSink("my-app.log", { lazy: true }),
  },
  // Omitted for brevity
});
~~~~

See also `getFileSink()` function and `FileSinkOptions` interface
in the API reference for more details.

> [!TIP]
> File sinks support buffering for improved performance through
> the `~FileSinkOptions.bufferSize` option (default: 8192 characters).
> To prevent log loss during unexpected process termination, you can use
> the `~FileSinkOptions.flushInterval` option (default: 5000ms) to
> automatically flush buffered logs after a specified time interval.
> Set `flushInterval: 0` to disable time-based flushing, or `bufferSize: 0` to
> disable buffering entirely for immediate writes.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the file sink.


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
> to prevent log loss during unexpected process termination. These options work
> the same way as in regular file sinks.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the rotating file sink.


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

~~~~ syslog
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


Buffered sink
-------------

*This API is available since LogTape 1.0.0.*

A buffered sink is a decorator that wraps another sink to provide memory
buffering functionality. It collects log records in memory and flushes them
to the underlying sink either when the buffer reaches a specified size or
after a certain time interval.

This is particularly useful for:

 -  Reducing the frequency of expensive I/O operations
 -  Batching log records for better performance
 -  Controlling when logs are actually written to their destination

You can create a buffered sink using the `withBuffer()` function:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink, withBuffer } from "@logtape/logtape";

await configure({
  sinks: {
    buffered: withBuffer(getConsoleSink(), {
      bufferSize: 5,        // Flush after 5 records
      flushInterval: 1000,  // Flush every 1 second
    }),
  },
  // Omitted for brevity
});
~~~~

### Buffer options

The `withBuffer()` function accepts the following options:

`~BufferSinkOptions.bufferSize`
:   The maximum number of log records to buffer before flushing to the
    underlying sink. Defaults to 10. When the buffer reaches this size,
    all buffered records are immediately flushed.

`~BufferSinkOptions.flushInterval`
:   The maximum time in milliseconds to wait before flushing buffered records
    to the underlying sink. Defaults to 5000 (5 seconds). Set to 0 or negative
    to disable time-based flushing. When this interval elapses, all buffered
    records are flushed regardless of the buffer size.

### Automatic flushing

Buffered sinks automatically flush their contents when:

 1. The buffer reaches the specified `~BufferSinkOptions.bufferSize`
 2. The `~BufferSinkOptions.flushInterval` time elapses (if enabled)
 3. The sink is disposed (either explicitly or during configuration reset)

### Example usage

Here's a practical example of using a buffered sink with a file sink:

~~~~ typescript twoslash
// @noErrors: 2345
import { getFileSink } from "@logtape/file";
import { configure, withBuffer } from "@logtape/logtape";

await configure({
  sinks: {
    // Buffer file writes for better performance
    file: withBuffer(getFileSink("app.log"), {
      bufferSize: 20,       // Write to file every 20 log records
      flushInterval: 3000,  // Or every 3 seconds, whichever comes first
    }),
  },
  loggers: [
    { category: [], sinks: ["file"], lowestLevel: "info" },
  ],
});
~~~~

> [!TIP]
> Buffered sinks are especially beneficial when used with sinks that perform
> expensive operations like file I/O or network requests. The buffering reduces
> the frequency of these operations while ensuring logs are not lost.

> [!WARNING]
> Be aware that buffered logs may be lost if the application crashes before
> they are flushed. Consider the trade-off between performance and reliability
> when choosing buffer settings.

For more details, see the `withBuffer()` function and `BufferSinkOptions`
interface in the API reference.


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

Performance
:   Async operations can be slower than synchronous ones.
    Consider using `withBuffer()` to batch operations:

    ~~~~ typescript twoslash
    // @noErrors: 2345
    import { type AsyncSink, fromAsyncSink, withBuffer } from "@logtape/logtape";

    const asyncSink: AsyncSink = async (record) => {
      // Async operation
    };

    const sink = withBuffer(fromAsyncSink(asyncSink), {
      bufferSize: 20,
      flushInterval: 1000,
    });
    ~~~~

    See also the [*Buffered sink* section](#buffered-sink) above.

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
