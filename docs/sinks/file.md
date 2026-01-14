File sink
=========

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


Standard file sink
------------------

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
> File sinks also support non-blocking mode through the
> `~FileSinkOptions.nonBlocking` option. When enabled, flush operations are
> performed asynchronously to prevent blocking the main thread during file I/O
> operations. In non-blocking mode, the sink returns `Sink & AsyncDisposable`
> instead of `Sink & Disposable`. Errors during background flushing are
> silently ignored to prevent application disruption.


High-performance stream file sink
---------------------------------

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

### When to use the stream file sink

Use `getStreamFileSink()` when you need:

 -  *High-performance file logging* for production applications
 -  *Non-blocking I/O behavior* for real-time applications
 -  *Automatic backpressure handling* for high-volume scenarios
 -  *Simple file output* without complex buffering configuration

### Performance characteristics

 -  *Optimized for high-volume logging* scenarios
 -  *Non-blocking*: Uses asynchronous I/O that doesn't block the main thread
 -  *Memory efficient*: Automatic backpressure prevents memory buildup
 -  *Stream-based*: Leverages Node.js native stream optimizations

### Stream vs. standard file sink comparison

| Feature         | Stream File Sink                              | Standard File Sink                                           |
| --------------- | --------------------------------------------- | ------------------------------------------------------------ |
| *Performance*   | Higher throughput, optimized for volume       | Good performance with configurable buffering                 |
| *Configuration* | Simple (just `highWaterMark` and `formatter`) | Comprehensive (buffer size, flush intervals, blocking modes) |
| *Buffering*     | Automatic via PassThrough streams             | Manual control with size and time-based flushing             |
| *Use case*      | High-volume production logging                | General-purpose with fine-grained control                    |

For more control over buffering behavior and advanced options like non-blocking
modes, lazy loading, and custom flush intervals, use the standard
`getFileSink()` function instead.

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

1.  When the current log file reaches a specified maximum size, it is closed and
    renamed.
2.  A new log file is created with the original name to continue logging.
3.  Old log files are kept up to a specified maximum number, with the oldest
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


Time-based rotating file sink
-----------------------------

*This API is available since LogTape 2.0.0.*

> [!NOTE]
> Time-based rotating file sink is unavailable in the browser environment.

A time-based rotating file sink rotates log files based on time intervals
rather than file size.  This is useful for organizing logs by date or time
period, making it easier to find logs from specific time ranges.

Unlike the size-based rotating file sink, the time-based version:

1.  Creates new log files at specified time intervals (hourly, daily, or weekly).
2.  Names files based on the date/time they cover.
3.  Can automatically delete old log files based on age.

To use the time-based rotating file sink, use the `getTimeRotatingFileSink()`
function from the *@logtape/file* package:

~~~~ typescript twoslash
// @noErrors: 2345
import { getTimeRotatingFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getTimeRotatingFileSink({
      directory: "./logs",
      interval: "daily",
    }),
  },
  // Omitted for brevity
});
~~~~

### Rotation intervals

The `~TimeRotatingFileSinkOptions.interval` option controls how often log files
are rotated:

`"daily"` (default)
:   Creates a new log file each day.  Files are named `YYYY-MM-DD.log`
    (e.g., *2025-01-15.log*).

`"hourly"`
:   Creates a new log file each hour.  Files are named `YYYY-MM-DD-HH.log`
    (e.g., *2025-01-15-09.log*).

`"weekly"`
:   Creates a new log file each week.  Files are named `YYYY-WNN.log`
    using ISO week numbers (e.g., *2025-W03.log*).

### Custom filename patterns

You can customize the filename pattern using the
`~TimeRotatingFileSinkOptions.filename` option:

~~~~ typescript twoslash
// @noErrors: 2345
import { getTimeRotatingFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getTimeRotatingFileSink({
      directory: "./logs",
      filename: (date: Date) => `app-${date.toISOString().slice(0, 10)}.txt`,
    }),
  },
  // Omitted for brevity
});
~~~~

### Automatic cleanup of old files

Use the `~TimeRotatingFileSinkOptions.maxAgeMs` option to automatically delete
log files older than a specified age:

~~~~ typescript twoslash
// @noErrors: 2345
import { getTimeRotatingFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getTimeRotatingFileSink({
      directory: "./logs",
      interval: "daily",
      maxAgeMs: 60 * 24 * 60 * 60 * 1000,  // Delete files older than 60 days
    }),
  },
  // Omitted for brevity
});
~~~~

> [!TIP]
> Like regular file sinks, time-based rotating file sinks support buffering
> through the `~FileSinkOptions.bufferSize` option (default: 8192 characters)
> and time-based flushing through the `~FileSinkOptions.flushInterval` option
> (default: 5000ms).  They also support non-blocking mode through the
> `~FileSinkOptions.nonBlocking` option for asynchronous flush operations.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the time-based rotating file sink.

For more details, see `getTimeRotatingFileSink()` function and
`TimeRotatingFileSinkOptions` interface in the API reference.
