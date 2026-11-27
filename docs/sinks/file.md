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

By default, rotated log files are named with a suffix like *.1*, *.2*, *.3*,
and so on.

For more details, see `getRotatingFileSink()` function and
`RotatingFileSinkOptions` interface in the API reference.

Since LogTape 2.4.0, positive `~RotatingFileSinkOptions.maxFiles` values must be
integers no greater than 1,000.  Larger values throw `RangeError` during sink
creation, before any file is opened.  This limits the work and memory needed
to compute and cache backup paths.  Zero or negative values still discard the
active file on rotation without keeping backups.

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

### File permissions

*These options are available since LogTape 2.5.0.*

Use `~RotatingFileSinkOptions.fileMode` to set the POSIX creation mode for new
active log files, including files created after rotation. The process umask
still applies, and existing files keep their permissions.

~~~~ typescript
import { getRotatingFileSink } from "@logtape/file";

const sink = getRotatingFileSink("app.log", { fileMode: 0o600 });
~~~~

To also set the permissions of an existing active log, opt in to
`~RotatingFileSinkOptions.fileModePolicy` with `"enforce"`:

~~~~ typescript
const sink = getRotatingFileSink("app.log", {
  fileMode: 0o600,
  fileModePolicy: "enforce",
});
~~~~

The sink sets and verifies the exact mode on the opened file before writing.
This can restore bits removed by the umask and clears any existing special
permission bits. Use a trusted directory: the sink requires a regular file and
rejects symbolic links in the final path component, but does not protect
against changes to parent directories, hard links, or access control lists.
It does not change the permissions of past backups.

The `"enforce"` policy requires Node.js or Bun on macOS or Linux. Deno only
supports `"create"`. Windows rejects either policy when specified. Omitting
both options preserves the existing behavior on all platforms.

The sink does not write to a file if it cannot verify its requested mode.
A failed check can leave an empty file behind. If a rotation failure leaves
the sink without an active file, create a new sink after correcting the
problem. The `nonBlocking` option does not make opening a file or checking
permissions asynchronous.

### Custom rotated file paths

*This option is available since LogTape 2.4.0.*

Use `~RotatingFileSinkOptions.rotatedFilePath` to choose the paths of rotated
files.  For example, to keep the *.log* extension:

~~~~ typescript twoslash
import { getRotatingFileSink } from "@logtape/file";

const sink = getRotatingFileSink("my-app.log", {
  rotatedFilePath: (path, index) => path.replace(/(\.log)?$/, `.${index}$1`),
});
~~~~

This produces *my-app.1.log*, *my-app.2.log*, and so on, instead of the default
*my-app.log.1*, *my-app.log.2*.  The active file remains *my-app.log*.  This
example also handles extensionless paths and preserves the directory.

The callback receives the original path and a backup index starting at 1 for
the newest backup.  Return a complete path; relative paths are relative to the
current working directory, not the active file's directory.  The sink computes
these paths when it is created, before opening the file, and reuses them for
subsequent rotations.  A callback exception fails sink creation in both blocking
and non-blocking modes.  The callback is not called when
`~RotatingFileSinkOptions.maxFiles` is zero or negative.

Return the same path for the same arguments, including when recreating the sink.
Each backup must have a distinct path and must not refer to the active log file.
Parent directories must already exist, and the filesystem must support renaming
between the paths.  If you change the naming scheme, handle backups created
under the previous scheme yourself; the sink does not migrate or remove them.


Time-based rotating file sink
-----------------------------

*This API is available since LogTape 2.0.0.*

> [!NOTE]
> Time-based rotating file sink is unavailable in the browser environment.

A time-based rotating file sink rotates log files based on time intervals
rather than file size.  This is useful for organizing logs by date or time
period, making it easier to find logs from specific time ranges.

Unlike the size-based rotating file sink, the time-based version:

1.  Creates new log files at specified time intervals (hourly, daily, or
    weekly).
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
`~TimeRotatingFileSinkOptions.filename` option.  When you also configure
`~TimeRotatingFileSinkOptions.maxAgeMs`, you can provide
`~TimeRotatingFileSinkOptions.parseFilename` so cleanup can extract the log
date from your custom filenames:

~~~~ typescript twoslash
// @noErrors: 2345
import { getTimeRotatingFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    file: getTimeRotatingFileSink({
      directory: "./logs",
      filename: (date: Date) => `app-${date.toISOString().slice(0, 10)}.txt`,
      parseFilename: (filename: string) => {
        const match = filename.match(/^app-(\d{4}-\d{2}-\d{2})\.txt$/);
        return match == null ? null : new Date(match[1]);
      },
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

> [!IMPORTANT]
> When `~TimeRotatingFileSinkOptions.filename` is configured and
> `~TimeRotatingFileSinkOptions.parseFilename` is omitted, cleanup uses each
> file's modification time (`mtime`) instead of parsing dates from filenames.
> It only removes files whose names match the configured `filename` function for
> that `mtime`.  Use a dedicated log directory for time-rotating file sinks so
> unrelated files are not removed when they are older than
> `~TimeRotatingFileSinkOptions.maxAgeMs`.

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
