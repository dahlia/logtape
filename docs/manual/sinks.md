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
:

 -  **Buffer-full flushes**: When the buffer reaches capacity, flushes are
    scheduled asynchronously (non-blocking) rather than executed
    immediately
 -  **Memory overhead**: Small, bounded by the overflow protection mechanism
 -  **Latency**: Log visibility may be delayed by up to the flush interval
 -  **Throughput**: Significantly higher than blocking mode for high-volume
    scenarios

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

See [*File* sink] documentation.

[*File* sink]: ../sinks/file.md


Rotating file sink
------------------

See [*Rotating file* sink] documentation.

[*Rotating file* sink]: ../sinks/file.md#rotating-file-sink


Time-based rotating file sink
-----------------------------

See [*Time-based rotating file* sink] documentation.

[*Time-based rotating file* sink]: ../sinks/file.md#time-based-rotating-file-sink


Fingers crossed sink
--------------------

*This API is available since LogTape 1.1.0.*

The fingers crossed sink implements a “fingers crossed” logging pattern
where debug and low-level logs are buffered in memory and only output when a
significant event (like an `"error"`) occurs. This pattern reduces log noise in
normal operations while providing detailed context when issues arise, making
logs more readable and actionable.

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

### Custom buffer level

*This API is available since LogTape 2.0.0.*

By default, all log records below the trigger level are buffered.  You can
customize which severity levels are buffered using the
`~FingersCrossedOptions.bufferLevel` option:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      bufferLevel: "debug",     // Only buffer trace and debug
      triggerLevel: "warning",  // Trigger on warning or higher
    }),
  },
  loggers: [
    { category: [], sinks: ["console"], lowestLevel: "trace" },
  ],
});
~~~~

With this configuration:

 -  `trace` and `debug` logs are buffered (at or below `bufferLevel`)
 -  `info` logs pass through immediately (above `bufferLevel`, below
    `triggerLevel`)
 -  `warning`, `error`, and `fatal` logs trigger the buffer flush

This is useful when you want to:

 -  Always see `info` level logs in real-time
 -  Only see detailed `trace`/`debug` logs when something goes wrong
 -  Reduce log noise while preserving debugging context

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

### Context isolation

*This API is available since LogTape 1.2.0.*

When using implicit contexts (see [*Implicit contexts*](./contexts.md) section),
you can isolate buffers by context values to handle scenarios like HTTP request
tracing:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink, withContext, getLogger } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByContext: { keys: ["requestId"] },
    }),
  },
  // Omitted for brevity
});

const logger = getLogger();
// ---cut-before---
// Logs are isolated by requestId context
function handleRequest(requestId: string) {
  withContext({ requestId }, () => {
    // These logs are buffered separately per requestId
    logger.debug("Processing request");
    logger.info("Validating input");

    // Only logs from this specific requestId are flushed on error
    logger.error("Request failed");
  });
}
~~~~

You can also isolate by multiple context keys:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByContext: { keys: ["requestId", "sessionId"] },
    }),
  },
  // Omitted for brevity
});
~~~~

Context isolation can be combined with category isolation:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByCategory: "descendant",
      isolateByContext: { keys: ["requestId"] },
    }),
  },
  // Omitted for brevity
});
~~~~

With both isolations enabled, buffers are only flushed when both the category
relationship matches and the context values are the same.

### Buffer management

The fingers crossed sink provides several mechanisms to manage memory usage
and prevent unbounded buffer growth, especially when using context isolation
where multiple buffers may be created.

#### Basic buffer size limit

The basic buffer size limit prevents any single buffer from growing too large:

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

When a buffer exceeds the maximum size, the oldest records are automatically
dropped to prevent unbounded memory growth.

#### Time-based cleanup (TTL)

*This API is available since LogTape 1.2.0.*

For context-isolated buffers, you can enable automatic cleanup based on time
to prevent memory leaks from unused contexts:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByContext: {
        keys: ["requestId"],
        bufferTtlMs: 300000,        // Remove buffers after 5 minutes
        cleanupIntervalMs: 60000,   // Check for expired buffers every minute
      },
    }),
  },
  // Omitted for brevity
});
~~~~

TTL (time to live) cleanup automatically removes context buffers that haven't
received new log records within the specified time period. This is particularly
useful for request-scoped contexts that may never trigger an error but should
not remain in memory indefinitely.

#### Capacity-based eviction (LRU)

*This API is available since LogTape 1.2.0.*

You can limit the total number of context buffers using LRU (least recently
used) eviction:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByContext: {
        keys: ["requestId"],
        maxContexts: 100,  // Keep at most 100 context buffers
      },
    }),
  },
  // Omitted for brevity
});
~~~~

When the number of context buffers reaches the limit, the least recently used
buffers are automatically evicted to make room for new ones. This prevents
memory usage from growing unbounded in high-traffic applications.

#### Hybrid memory management

TTL and LRU can be used together for comprehensive memory management:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      isolateByContext: {
        keys: ["requestId", "sessionId"],
        maxContexts: 200,           // LRU limit: keep at most 200 contexts
        bufferTtlMs: 600000,        // TTL: remove after 10 minutes
        cleanupIntervalMs: 120000,  // Check for expired buffers every 2 minutes
      },
      maxBufferSize: 500,  // Each buffer keeps at most 500 records
    }),
  },
  // Omitted for brevity
});
~~~~

This configuration provides three layers of memory protection:

Per-buffer size limit
:   Each context buffer is limited to 500 records

Total buffer count limit
:   At most 200 context buffers can exist simultaneously

Time-based cleanup
:   Unused buffers are removed after 10 minutes

The combination ensures predictable memory usage even in high-volume,
long-running applications with many unique context combinations.

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
    your application's memory constraints. When using context isolation,
    memory usage scales with the number of unique context combinations.

Trigger frequency
:   Frequent trigger events (like `"warning"`s) may reduce the effectiveness of
    buffering. Choose trigger levels carefully.

Category isolation overhead
:   Category isolation adds some overhead for category matching.
    For high-volume logging, consider using a single buffer
    if isolation isn't needed.

Context isolation overhead
:   Context isolation creates separate buffers for each unique context
    combination, which adds memory and lookup overhead. Use TTL and LRU
    limits to bound resource usage in high-traffic applications.

TTL cleanup overhead
:   TTL cleanup runs periodically to remove expired buffers. The
    `cleanupIntervalMs` setting affects how often this cleanup occurs.
    More frequent cleanup reduces memory usage but increases CPU overhead.

LRU eviction overhead
:   LRU eviction tracks access times for each buffer and performs eviction
    when capacity is exceeded. The overhead is generally minimal but scales
    with the number of context buffers.

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
[2m2025-06-12 10:34:10.465 +00[0m [1m[32mINF[0m [2mlogtape·meta:[0m LogTape loggers are configured.  Note that LogTape itself uses the meta logger, which has category [ [32m"logtape"[39m, [32m"meta"[39m ].  The meta logger purposes to log internal errors such as sink exceptions.  If you are seeing this message, the meta logger is automatically configured.  It's recommended to configure the meta logger with a separate sink so that you can easily notice if logging itself fails or is misconfigured.  To turn off this message, configure the meta logger with higher log levels than [32m"info"[39m.  See also <https://logtape.org/manual/categories#meta-logger>.
[2m2025-06-12 10:34:10.472 +00[0m [1mTRC[0m [2mmy-app·module:[0m This is a trace log.
[2m2025-06-12 10:34:10.473 +00[0m [1m[34mDBG[0m [2mmy-app·module:[0m This is a debug log with value: { foo: [33m123[39m }
[2m2025-06-12 10:34:10.473 +00[0m [1m[32mINF[0m [2mmy-app:[0m This is an informational log.
[2m2025-06-12 10:34:10.474 +00[0m [1m[33mWRN[0m [2mmy-app:[0m This is a warning.
[2m2025-06-12 10:34:10.475 +00[0m [1m[31mERR[0m [2mmy-app·module:[0m This is an error with exception: Error: This is an exception.
    at file:///tmp/test.ts:28:10
[2m2025-06-12 10:34:10.475 +00[0m [1m[35mFTL[0m [2mmy-app:[0m This is a fatal error.
~~~~


OpenTelemetry sink
------------------

See [*OpenTelemetry* sink] documentation.

[*OpenTelemetry* sink]: ../sinks/otel.md


Sentry sink
-----------

See [*Sentry* sink] documentation.

[*Sentry* sink]: ../sinks/sentry.md


Syslog sink
-----------

See [*Syslog* sink] documentation.

[*Syslog* sink]: ../sinks/syslog.md


AWS CloudWatch Logs sink
------------------------

See [*AWS CloudWatch Logs* sink] documentation.

[*AWS CloudWatch Logs* sink]: ../sinks/cloudwatch-logs.md


Windows Event Log sink
----------------------

See [*Windows Event Log* sink] documentation.

[*Windows Event Log* sink]: ../sinks/windows-eventlog.md


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

1.  *Chains async operations*: Each log call is chained to the previous one
    using Promise chaining, ensuring logs are processed in order.
2.  *Handles errors gracefully*: If an async operation fails, the error is
    caught to prevent breaking the chain for subsequent logs.
3.  [*Implements `AsyncDisposable`*](#disposable-sink): The returned sink can be
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
