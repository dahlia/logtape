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

To show where each logging call was made in the console during development,
use the console formatter that `getConsoleFormatter()` returns with its
`~ConsoleFormatterOptions.sourceLocation` option (available since LogTape
2.4.0); see [*Showing where log records come
from*](./debug.md#showing-where-log-records-come-from).

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

By default, disposing a stream sink closes its `WritableStream`.  For a
caller-owned stream that needs to remain open, such as a Node.js standard
stream, set `closeStream` to `false`:

~~~~ typescript twoslash
// @noErrors: 2345
import "@types/node";
import { getStreamSink } from "@logtape/logtape";
import stream from "node:stream";

const stderrSink = getStreamSink(
  stream.Writable.toWeb(process.stderr),
  { closeStream: false },
);
~~~~

Disposing the sink still waits for pending writes, flushes buffered records
when non-blocking mode is enabled, and releases the writer lock without closing
the stream.

To wait for pending writes while keeping the sink open, call its `drain()`
method instead of disposing it.  See the [*Draining sinks*
section](#draining-sinks) for details.

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

### Loss notifications

*This API is available since LogTape 2.4.0.*

Set `onDrop` and `onError` inside the `nonBlocking` object to monitor loss
through a separate diagnostic path.  Both console and stream sinks accept
these callbacks:

~~~~ typescript twoslash
import { getConsoleSink, type SinkErrorEvent } from "@logtape/logtape";
declare function reportFailure(event: SinkErrorEvent): void;
// ---cut-before---
let droppedRecords = 0;
const sink = getConsoleSink({
  nonBlocking: {
    bufferSize: 1000,
    flushInterval: 50,
    onDrop(event) {
      droppedRecords += event.count;
    },
    onError: reportFailure,
  },
});
~~~~

`SinkDropEvent` contains only `count` and `reason`, with no record payloads.
The `SinkDropReason` is currently `"overflow"`, independently of which queue
policy discarded the records.  Counts are aggregated for `flushInterval`
milliseconds after the first drop.  Reporting uses its own timer, so a
stalled stream write does not prevent loss notifications.  Disposal reports
any remaining count immediately.  A long flush interval also means a long
notification window.

`SinkErrorEvent` contains the original `error`, the sink kind (`"console"`
or `"stream"`), and the failed `operation`: `"format"`, `"encode"`,
`"write"`, or `"close"`.  Waiting for stream readiness is part of `"write"`.
Each event except `"close"` represents one failed record; a close failure
reports a resource operation rather than another dropped record.  A closure
can identify an individual sink when several sinks share the same handler.
Reasons and operation names may gain members in future versions.

Callback exceptions and rejected promises are suppressed.  Callback promises
are not awaited and do not delay output completion.  Calls that reach the
same sink synchronously from its callback are ignored without a further
notification.  This guard does not cover logs that arrive later, such as
after an `await`, through a buffering wrapper, or from another sink's error
handler.  Use a separate diagnostic path to avoid feedback loops.  Calls
after disposal are also ignored; overflow counts do not include these calls
or callback reentry.

Stream disposal shares one completion promise across concurrent or repeated
calls and waits for pending output before closing or releasing the writer.
Console disposal flushes synchronously.  If a console callback invokes
disposal during an output batch, that batch finishes after the nested call
returns and may report further errors.

### Important considerations

When using non-blocking sinks:

Disposal
:   Non-blocking sinks implement `Disposable` (console) or `AsyncDisposable`
    (stream) to ensure all buffered logs are flushed on cleanup.  Usually,
    they are automatically disposed when the application exits or when
    the configuration is reset.  However, you may need to
    [explicitly dispose](#explicit-disposal) them to ensure all logs are
    flushed on some platforms (e.g., Cloudflare Workers).  The stream sink can
    also be [drained](#draining-sinks), which writes the buffered records
    right away without waiting for the flush interval and keeps the sink
    open.

Error handling
:   Errors during background flushing are suppressed to avoid disrupting the
    application.  Set `nonBlocking.onError` to report them through a separate
    diagnostic path.

Buffer overflow protection
:   To prevent unbounded memory growth during high-volume logging, both sinks
    implement overflow protection. When the internal buffer exceeds twice the
    configured buffer size, the oldest log records are automatically dropped
    to make room for new ones.  Set `nonBlocking.onDrop` to receive aggregated
    counts of these dropped records.

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
 -  Subsequent logs pass through directly instead of being buffered (see
    [*Buffering again after a trigger*](#buffering-again-after-a-trigger) to
    change this)

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

### Snapshotting buffered values

*This API is available since LogTape 2.4.0.*

Nested objects and arrays can change while a record waits in the buffer.
LogTape resolves top-level lazy properties and copies the outer properties
object, but nested values remain shared.  Use the optional
`~FingersCrossedOptions.snapshot` callback to copy them synchronously when a
record is about to be buffered:

~~~~ typescript twoslash
import { fingersCrossed, getConsoleSink } from "@logtape/logtape";

const sink = fingersCrossed(getConsoleSink(), {
  snapshot({ message, properties, ...rest }) {
    return { ...rest, ...structuredClone({ message, properties }) };
  },
});
~~~~

Copy both `~LogRecord.message` and `~LogRecord.properties`.  Copying only
properties leaves mutable interpolated message values shared with the caller.
Cloning them together also keeps references shared between those fields in
the copy.  Preserve the other fields, including `~LogRecord.timestamp`, which
controls TTL expiry and the order of records flushed from isolated buffers.

This example uses `structuredClone()`, which can throw for values such as
functions and can change class instances.  JSON serialization and
domain-specific copies make different choices for errors, unsupported values,
and shared references.  Choose a policy that fits your values; LogTape does
not provide a default deep copy.  Spreading the remaining fields preserves
record metadata and record-level enumerable symbol properties, which a
whole-record JSON or structured clone can lose.

Reading `message` or `rawMessage` evaluates a lazy message callback at intake.
The example captures the resulting message as a value.  A hook that retains
the original message getter can still defer evaluation until the wrapped sink
reads it.  Without the option, message evaluation remains lazy.

The hook runs once for each record entering the buffering path, including
records later dropped by size limits, TTL, LRU eviction, or discard.  It does
not run for trigger records, records passing through above `bufferLevel` or
after a trigger, records handled by `bufferAction`, or records with a zero
buffer capacity.  Manual or triggered flushes deliver the retained snapshots
without calling the hook again.  With `afterTrigger: "buffer"`, each new
buffering cycle snapshots its incoming buffered records.

The original record determines levels, category/context isolation, and
`bufferAction`; the returned record is retained for later delivery.  Buffered
records reach the wrapped sink as snapshots, while immediately delivered
records retain their original values.  A JSON copy, for example, may turn a
`Date` into a string in buffered records while trigger records still contain
the original `Date`.

The callback must return a record synchronously.  Throws and invalid
non-object or Promise/thenable results fail intake before buffer state changes,
and the original record is never buffered as a fallback.  Direct sink calls
throw; logger calls report the failure to the `["logtape", "meta"]` logger
while bypassing this sink.  Configure a separate healthy meta sink to receive
that diagnostic.

Do not mutate the input, which can be shared with other sinks, or log to the
same sink from the hook.  Records logged from a hook are processed first, and
the record being snapshotted may then remain buffered even if a nested record
triggered a flush.

### Buffering again after a trigger

*This API is available since LogTape 2.4.0.*

By default, a trigger switches the sink into pass-through mode: once an error
has flushed the buffer, every subsequent record is output immediately.  That
suits short-lived requests or jobs, but in a long-running process a single
error would turn the sink into a plain sink for the rest of its lifetime.

Set `~FingersCrossedOptions.afterTrigger` to `"buffer"` to make the sink go
back to buffering after each trigger, so that every error is output together
with the records that led up to it:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, fingersCrossed, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: fingersCrossed(getConsoleSink(), {
      triggerLevel: "warning",
      maxBufferSize: 100,
      afterTrigger: "buffer",
    }),
  },
  // Omitted for brevity
});
~~~~

With this configuration, the following sequence:

1.  `debug` A, `debug` B
2.  `warning` W1
3.  `debug` C
4.  `error` E2

outputs A, B, and W1 when W1 arrives, then C and E2 when E2 arrives.  Each
trigger emits the records currently retained in the selected buffers, followed
by the trigger record.  Records flushed by an earlier trigger are not repeated,
and `~FingersCrossedOptions.maxBufferSize`, TTL cleanup, and LRU eviction can
still drop older records before the next trigger.

The option also applies to isolated buffers: the buffers flushed by a trigger
start buffering again, while other buffers keep their records.  Since
`~FingersCrossedOptions.maxBufferSize` applies per buffer, a trigger that
selects several buffers can emit more records than that limit.

Records between `~FingersCrossedOptions.bufferLevel` and
`~FingersCrossedOptions.triggerLevel` still pass through immediately, and
actions returned by `~FingersCrossedOptions.bufferAction` take precedence over
this option.

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

### Record-driven buffer actions

*This API is available since LogTape 2.4.0.*

Use the `~FingersCrossedOptions.bufferAction` callback when a log record marks
the end of a request, job, or other isolated lifecycle.  Return `"flush"` to
emit the matching buffered records and the action record, or `"discard"` to
drop both:

~~~~ typescript twoslash
// @noErrors: 2345
import { fingersCrossed, getConsoleSink } from "@logtape/logtape";

const sink = fingersCrossed(getConsoleSink(), {
  isolateByContext: { keys: ["requestId"] },
  bufferAction(record) {
    const status = record.properties.status;
    if (typeof status !== "number") return undefined;
    return status >= 500 ? "flush" : "discard";
  },
});
~~~~

Returning `undefined` applies the regular `triggerLevel` and `bufferLevel`
behavior.  The callback runs before LogTape checks whether the matching buffer
has already been triggered, so a final request record also releases an active
triggered context.

Both callback actions are terminal.  After flushing or discarding, the same
isolation key starts a fresh buffer if it appears again.  This differs from a
`triggerLevel` match, which by default flushes the buffer and lets subsequent
records for the triggered isolation pass through directly, unless
`~FingersCrossedOptions.afterTrigger` is set to `"buffer"`.

### Manual buffer control

*This API is available since LogTape 2.4.0.*

The sink returned by `fingersCrossed()` implements `FingersCrossedSink`.  Use
its `~FingersCrossedSink.flush()` and `~FingersCrossedSink.discard()` methods
when the lifecycle ends outside the logging stream:

~~~~ typescript twoslash
// @noErrors: 2345
import { fingersCrossed, getConsoleSink } from "@logtape/logtape";

const sink = fingersCrossed(getConsoleSink(), {
  isolateByContext: { keys: ["requestId"] },
});

// ---cut-before---
function finishRequest(requestId: string, succeeded: boolean) {
  if (succeeded) {
    // A successful request no longer needs its diagnostic logs.
    sink.discard({ context: { requestId } });
  } else {
    // Emit diagnostic logs when an external failure signal arrives.
    sink.flush({ context: { requestId } });
  }
}
~~~~

A context-only selector applies to every category for that context.  Every key
configured in `~FingersCrossedOptions.isolateByContext` must be present in the
selector.  Adding `category` narrows the operation using the configured
category isolation matcher.  Omit the selector to flush or discard every
buffer.

Both methods release buffered and triggered state.  Calling either method for
an already-triggered isolation resets it, so the next record with the same key
is buffered again.

These methods are unrelated to [draining](#draining-sinks).  When the wrapped
sink is drainable, the fingers crossed sink's `~Drainable.drain()` method waits
only for the records it has already passed to the wrapped sink, and leaves the
buffers untouched.

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
    using Promise chaining, ensuring logs are processed in order, one at
    a time.  Each record is processed in the async context of the logging
    call that produced it.
2.  *Handles errors gracefully*: If an async operation fails, the error is
    caught to prevent breaking the chain for subsequent logs.
3.  [*Implements `AsyncDisposable`*](#disposable-sink): The returned sink can be
    properly disposed, waiting for all pending operations to complete.
4.  [*Implements `Drainable`*](#draining-sinks): The returned sink's
    `drain()` method waits for the operations of the records logged so far,
    without disposing the sink.

By default, the number of records waiting for the async sink is unbounded.
The second parameter of `fromAsyncSink()` takes options to
[limit the queue](#bounding-pending-records) and to
[keep serverless requests alive](#keeping-serverless-requests-alive) until
their records have been sent.

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

### Bounding pending records

*This API is available since LogTape 2.4.0.*

If records arrive faster than the async sink can process them, they pile up
in memory.  The `~AsyncSinkOptions.maxQueueSize` option limits how many
records may wait for the async sink.  The record currently being processed
does not count toward the limit, and it is never dropped or canceled.

When a record arrives while the queue is full, the
`~AsyncSinkOptions.overflow` option decides what happens:

`"drop-oldest"` (default)
:   Drops the record that has been waiting the longest, and accepts the new
    one.

`"drop-newest"`
:   Drops the new record, and leaves the queue as it is.

Since a sink cannot make a logging call wait, a full queue never blocks the
application; it drops records instead.  The `~AsyncSinkOptions.onDrop`
callback is called synchronously whenever that happens.  It receives
a `SinkDropEvent` with the number of dropped records and the reason, but not
the records themselves, so you can count them, for example, in a metric:

~~~~ typescript twoslash
import { type AsyncSink, fromAsyncSink } from "@logtape/logtape";
const webhookSink: AsyncSink = async () => {};
/**
 * A hypothetical counter of dropped log records.
 */
const droppedLogs = { add(_count: number, _attributes: object): void {} };
// ---cut-before---
const sink = fromAsyncSink(webhookSink, {
  maxQueueSize: 1000,
  overflow: "drop-oldest",
  onDrop: ({ count, reason }) => droppedLogs.add(count, { reason }),
});
~~~~

Records are still processed one at a time and in order; dropped records are
simply skipped.

> [!NOTE]
> The `~AsyncSinkOptions.maxQueueSize` option limits how many records the
> sink keeps queued, not its total memory use.  With `"drop-oldest"`,
> the sink lets go of a dropped record right away, but the promise
> bookkeeping for it, including any async context (such as request context)
> the runtime captured for it, remains until the record being processed at
> that time settles.  If your async sink can hang, give it a timeout.  If
> that bookkeeping must stay bounded as well, use `"drop-newest"`, which
> leaves nothing behind for rejected records.

If the `~AsyncSinkOptions.onDrop` callback logs through a logger that sends
records back to the same sink, the drops that this causes are not reported
from inside the callback.  They are added to the next drop notification, or
reported when the sink is disposed.  Errors thrown by the callback, and
rejections of a promise it returns, are reported to the
[meta logger](./debug.md) and never reach the logging call.

### Keeping serverless requests alive

*This API is available since LogTape 2.4.0.*

Serverless platforms may suspend or end a function as soon as it returns
a response, before the async sink has sent its records.  Many platforms let
you extend the lifetime of the current request by passing a promise to
a `waitUntil()` function.

The `~AsyncSinkOptions.waitUntil` option takes such a function.  The sink
calls it synchronously inside each logging call that accepts a record, with
a promise that settles once that record and every record accepted before it
have been processed or dropped.  Because the call happens inside the logging
call, a `waitUntil()` function that looks up the current request attaches the
promise to the request that logged the record.  The sink itself does not keep
any request context around.

For example, on Vercel, you can pass the `waitUntil()` function from
the *@vercel/functions* package:

~~~~ typescript twoslash
// @noErrors: 2307
import { type AsyncSink, fromAsyncSink } from "@logtape/logtape";
const webhookSink: AsyncSink = async () => {};
// ---cut-before---
import { waitUntil } from "@vercel/functions";

const sink = fromAsyncSink(webhookSink, { waitUntil });
~~~~

On Cloudflare Workers, you can pass the `waitUntil()` function from
`cloudflare:workers`:

~~~~ typescript twoslash
// @noErrors: 2307
import { type AsyncSink, fromAsyncSink } from "@logtape/logtape";
const webhookSink: AsyncSink = async () => {};
// ---cut-before---
import { waitUntil } from "cloudflare:workers";

const sink = fromAsyncSink(webhookSink, { waitUntil });
~~~~

On platforms that expose `waitUntil()` only on a per-request object, pass
a function that finds that object for the current request, for example
through `AsyncLocalStorage`.

A few things to keep in mind:

 -  The promise never rejects.  If the async sink fails, the error is
    reported to the [meta logger](./debug.md) before the promise settles.
 -  It does not wait for records logged after the one it was created for,
    so a request is not kept alive by records that other requests log later.
    It does wait for records that were logged earlier, by any request,
    because records are sent one at a time.
 -  Passing a promise to `waitUntil()` only asks the platform for more time.
    The platform's own limits on how long a request can run after its
    response still apply.
 -  Errors thrown by the callback, and rejections of a promise it returns,
    are reported to the meta logger and never reach the logging call.
    The callback must not log through the same sink, since that would call
    it again recursively.

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
    To wait for pending operations without disposing the sink, see the
    [*Draining sinks* section](#draining-sinks).

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


Draining sinks
--------------

*This API is available since LogTape 2.4.0.*

Disposal ends a sink's lifetime: a disposed stream sink closes its stream or
releases its writer, and stops accepting records.  When you only need to wait
for the records logged so far, for example at the end of each job in
a long-running process, drain the sinks instead.  Draining waits for pending
output while keeping the sinks open for the next job.

The `drain()` function drains every drainable sink in the active
configuration:

~~~~ typescript twoslash
// @noErrors: 2345
import { type ExportedHandler, Response } from "@cloudflare/workers-types";
// ---cut-before---
import { configure, drain } from "@logtape/logtape";

await configure({ /* ... */ });

export default {
  async fetch(request, env, ctx) {
    // ...
    ctx.waitUntil(drain());
    return new Response("...");
  }
} satisfies ExportedHandler;
~~~~

A sink is drainable if it implements the `Drainable` interface, which has
a `~Drainable.drain()` method.  You can also drain a single sink by calling
the method directly:

~~~~ typescript twoslash
// @noErrors: 2345
import { getStreamSink } from "@logtape/logtape";
declare const stream: WritableStream;
async function runJob(): Promise<void> {}
// ---cut-before---
const sink = getStreamSink(stream);

for (let i = 0; i < 3; i++) {
  await runJob();
  await sink.drain();  // The sink is still open for the next job.
}
~~~~

A drain waits only for the records the sink accepted before the call, so
records logged afterwards cannot keep it waiting.  It finishes once each of
those records has *settled*: its output has finished, failed, or the record
was dropped (for example, by the overflow protection of a non-blocking sink).
This does not mean that the output was synchronized to disk or durably stored
by a remote service.  Concurrent drains are allowed.

The following sinks are drainable:

`getStreamSink()`
:   Waits for pending writes.  In non-blocking mode, it writes the buffered
    records right away instead of waiting for the flush interval.  A failed
    write makes the drain reject, except in non-blocking mode, where write
    errors are suppressed or passed to `nonBlocking.onError` instead.

`fromAsyncSink()`
:   Waits for the async operations of the records logged so far.  Failed
    operations are reported to the [meta logger] as usual, and do not make the
    drain reject.

`withFilter()`, `fingersCrossed()`
:   Forward `~Drainable.drain()` to the wrapped sink if it is drainable.
    Draining a fingers crossed sink does not emit the records that are still
    buffered waiting for a trigger; use `~FingersCrossedSink.flush()` for that.

The `drain()` function skips sinks that are not drainable, drains a sink
configured under multiple identifiers only once, and rejects if any sink fails
to drain.  Inside a `withConfig()` callback, it drains the sinks of the scoped
configuration instead of the process-wide ones.

[meta logger]: ./categories.md#meta-logger

<!-- cSpell: ignore otel -->
