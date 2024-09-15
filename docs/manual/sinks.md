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

See also `getConsoleSink()` function and `ConsoleSinkOptions` interface
in the API reference for more details.


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

LogTape provides a file sink as well.  Here's an example of a file sink that
writes log messages to a file:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getFileSink } from "@logtape/logtape";

await configure({
  sinks: {
    file: getFileSink("my-app.log"),
  },
  // Omitted for brevity
});
~~~~

See also `getFileSink()` function and `FileSinkOptions` interface
in the API reference for more details.

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

To use the rotating file sink, you can use the `getRotatingFileSink()` function.
Here's an example of a rotating file sink that writes log messages to a file:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getRotatingFileSink } from "@logtape/logtape";

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

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the rotating file sink.


Text formatter
--------------

The sinks introduced above write log messages in a plain text format.
You can customize the format by providing a text formatter.  The type of a
text formatter is:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
export type TextFormatter = (record: LogRecord) => string;
~~~~

Here's an example of a text formatter that writes log messages in a [JSON Lines]
format:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getFileSink } from "@logtape/logtape";
// ---cut-before---
await configure({
  sinks: {
    stream: getFileSink("log.jsonl", {
      formatter(log) {
        return JSON.stringify(log) + "\n";
      }
    }),
  },
  // Omitted for brevity
});
~~~~

Or you can colorize log messages in your terminal using
the `ansiColorFormatter()`:

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

![A preview of ansiColorFormatter.](https://i.imgur.com/I8LlBUf.png)

[JSON Lines]: https://jsonlines.org/


OpenTelemetry sink
------------------

If you have an [OpenTelemetry] collector running, you can use the OpenTelemetry
sink to send log messages to the collector using [@logtape/otel] package:

::: code-group

~~~~ sh [Deno]
deno add @logtape/otel
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

The quickest way to get started is to use the [`getOpenTelemetrySink()`]
function without any arguments:

~~~~ typescript twoslash
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

For more details, see the documentation of [@logtape/otel].

[OpenTelemetry]: https://opentelemetry.io/
[@logtape/otel]: https://github.com/dahlia/logtape-otel
[`getOpenTelemetrySink()`]: https://jsr.io/@logtape/otel/doc/~/getOpenTelemetrySink


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
