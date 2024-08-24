<!-- deno-fmt-ignore-file -->

LogTape
=======

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]
[![Codecov][Codecov badge]][Codecov]

LogTape is a logging library for JavaScript and TypeScript.  It provides a
simple and flexible logging system that is easy to use and easy to extend.
The highlights of LogTape are:

 -  *Zero dependencies*: LogTape has zero dependencies.  You can use LogTape
    without worrying about the dependencies of LogTape.

 -  *Library support*: LogTape is designed to be used in libraries as well
    as applications.  You can use LogTape in libraries to provide logging
    capabilities to users of the libraries.

 -  *Runtime diversity*: LogTape supports Deno, Node.js, Bun, edge functions,
    and browsers.  You can use LogTape in various environments without
    changing the code.

 -  *Structured logging*: You can log messages with structured data.

 -  *Hierarchical categories*: LogTape uses a hierarchical category system
    to manage loggers.  You can control the verbosity of log messages by
    setting the log level of loggers at different levels of the category
    hierarchy.

 -  *Template literals*: LogTape supports template literals for log messages.
    You can use template literals to log messages with placeholders and
    values.

 -  *Dead simple sinks*: You can easily add your own sinks to LogTape.

Currently, LogTape provides only few sinks, but [you can easily add your own
sinks.](#sinks)

![](./screenshots/web-console.png)
![](./screenshots/terminal-console.png)

[JSR]: https://jsr.io/@logtape/logtape
[JSR badge]: https://jsr.io/badges/@logtape/logtape
[npm]: https://www.npmjs.com/package/@logtape/logtape
[npm badge]: https://img.shields.io/npm/v/@logtape/logtape?logo=npm
[GitHub Actions]: https://github.com/dahlia/logtape/actions/workflows/main.yaml
[GitHub Actions badge]: https://github.com/dahlia/logtape/actions/workflows/main.yaml/badge.svg
[Codecov]: https://codecov.io/gh/dahlia/logtape
[Codecov badge]: https://codecov.io/gh/dahlia/logtape/graph/badge.svg?token=yOejfcuX7r


Installation
------------

LogTape is available on [JSR] and [npm].  You can install LogTape for various
JavaScript runtimes and package managers:

~~~~ sh
deno add @logtape/logtape  # for Deno
npm  add @logtape/logtape  # for npm
pnpm add @logtape/logtape  # for pnpm
yarn add @logtape/logtape  # for Yarn
bun  add @logtape/logtape  # for Bun
~~~~


Quick start
-----------

Set up LogTape in the entry point of your application (if you are composing
a library, you should not set up LogTape in the library itself; it is up to
the application to set up LogTape):

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  filters: {},
  loggers: [
    { category: "my-app", level: "debug", sinks: ["console"] }
  ]
});
~~~~

And then you can use LogTape in your application or library:

~~~~ typescript
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-app", "my-module"]);

export function myFunc(value: number): void {
  logger.debug `Hello, ${value}!`;
}
~~~~


How to log
----------

There are total 5 log levels: `debug`, `info`, `warning`, `error`, `fatal` (in
the order of verbosity).  You can log messages with the following syntax:

~~~~ typescript
logger.debug `This is a debug message with ${value}.`;
logger.info  `This is an info message with ${value}.`;
logger.warn  `This is a warning message with ${value}.`;
logger.error `This is an error message with ${value}.`;
logger.fatal `This is a fatal message with ${value}.`;
~~~~

You can also log messages with a function call.  In this case, log messages
are structured data:

~~~~ typescript
logger.debug("This is a debug message with {value}.", { value });
logger.info("This is an info message with {value}.", { value });
logger.warn("This is a warning message with {value}.", { value });
logger.error("This is an error message with {value}.", { value });
logger.fatal("This is a fatal message with {value}.", { value });
~~~~

Sometimes, values to be logged are expensive to compute.  In such cases, you
can use a function to defer the computation so that it is only computed when
the log message is actually logged:

~~~~ typescript
logger.debug(l => l`This is a debug message with ${computeValue()}.`);
logger.debug("Or you can use a function call: {value}.", () => {
  return { value: computeValue() };
});
~~~~

When using the function call, the way to log single curly braces `{`  is to
double the brace `{{`:

~~~~ typescript
logger.debug("This logs {{single}} curly braces.");
~~~~


Categories
----------

LogTape uses a hierarchical category system to manage loggers.  A category is
a list of strings.  For example, `["my-app", "my-module"]` is a category.

When you log a message, it is dispatched to all loggers whose categories are
prefixes of the category of the logger.  For example, if you log a message
with the category `["my-app", "my-module", "my-submodule"]`, it is dispatched
to loggers whose categories are `["my-app", "my-module"]` and `["my-app"]`.

This behavior allows you to control the verbosity of log messages by setting
the log level of loggers at different levels of the category hierarchy.

Here's an example of setting log levels for different categories:

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    { category: ["my-app"], level: "info", sinks: ["console"] },
    { category: ["my-app", "my-module"], level: "debug", sinks: ["console"] },
  ],
})
~~~~


Contexts
--------

*Contexts are available since LogTape 0.5.0.*

LogTape provides a context system to reuse the same properties across log
messages.  A context is a key-value map.  You can set a context for a logger
and log messages with the context.  Here's an example of setting a context
for a logger:

~~~~ typescript
const logger = getLogger(["my-app", "my-module"]);
const ctx = logger.with({ userId: 1234, requestId: "abc" });
ctx.info `This log message will have the context (userId & requestId).`;
ctx.warn("Context can be used inside message template: {userId}, {requestId}.");
~~~~

The context is inherited by child loggers.  Here's an example of setting a
context for a parent logger and logging messages with a child logger:

~~~~ typescript
const logger = getLogger(["my-app"]);
const parentCtx = logger.with({ userId: 1234, requestId: "abc" });
const childCtx = parentCtx.getLogger(["my-module"]);
childCtx.debug("This log message will have the context: {userId} {requestId}.");
~~~~

Contexts are particularly useful when you want to do structured logging.


Sinks
-----

A sink is a destination of log messages.  LogTape currently provides a few
sinks: console and stream.  However, you can easily add your own sinks.
The signature of a sink is:

~~~~ typescript
export type Sink = (record: LogRecord) => void;
~~~~

Here's a simple example of a sink that writes log messages to console:

~~~~ typescript
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

### Console sink

Of course, you don't have to implement your own console sink because LogTape
provides a console sink:

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  // Omitted for brevity
});
~~~~

See also [`getConsoleSink()`] function and [`ConsoleSinkOptions`] interface
in the API reference for more details.

[`getConsoleSink()`]: https://jsr.io/@logtape/logtape/doc/~/getConsoleSink
[`ConsoleSinkOptions`]: https://jsr.io/@logtape/logtape/doc/~/ConsoleSinkOptions

### Stream sink

Another built-in sink is a stream sink.  It writes log messages to
a [`WritableStream`].  Here's an example of a stream sink that writes log
messages to the standard error:

~~~~ typescript
// Deno:
await configure({
  sinks: {
    stream: getStreamSink(Deno.stderr.writable),
  },
  // Omitted for brevity
});
~~~~

~~~~ typescript
// Node.js:
import stream from "node:stream";

await configure({
  sinks: {
    stream: getStreamSink(stream.Writable.toWeb(process.stderr)),
  },
  // Omitted for brevity
});
~~~~

> [!NOTE]
> Here we use `WritableStream` from the Web Streams API.  If you are using
> Node.js, you cannot directly pass `process.stderr` to `getStreamSink` because
> `process.stderr` is not a `WritableStream` but a [`Writable`], which is a
> Node.js stream.  You can use [`Writable.toWeb()`] method to convert a Node.js
> stream to a `WritableStream`.

See also [`getStreamSink()`] function and [`StreamSinkOptions`] interface
in the API reference for more details.

[`WritableStream`]: https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
[`Writable`]: https://nodejs.org/api/stream.html#class-streamwritable
[`Writable.toWeb()`]: https://nodejs.org/api/stream.html#streamwritabletowebstreamwritable
[`getStreamSink()`]: https://jsr.io/@logtape/logtape/doc/~/getStreamSink
[`StreamSinkOptions`]: https://jsr.io/@logtape/logtape/doc/~/StreamSinkOptions

### File sink

> [!NOTE]
> File sink is unavailable in the browser environment.

LogTape provides a file sink as well.  Here's an example of a file sink that
writes log messages to a file:

~~~~ typescript
import { getFileSink } from "@logtape/logtape";

await configure({
  sinks: {
    file: getFileSink("my-app.log"),
  },
  // Omitted for brevity
});
~~~~

See also [`getFileSink()`] function and [`FileSinkOptions`] interface
in the API reference for more details.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the file sink.

[`getFileSink()`]: https://jsr.io/@logtape/logtape/doc/~/getFileSink
[`FileSinkOptions`]: https://jsr.io/@logtape/logtape/doc/~/FileSinkOptions

### Rotating file sink

> [!NOTE]
> Rotating file sink is unavailable in the browser environment.

A rotating file sink is a file sink that rotates log files.  It creates a new
log file when the current log file reaches a certain size.  Here's an example
of a rotating file sink that writes log messages to a file:

~~~~ typescript
import { getRotatingFileSink } from "@logtape/logtape";

await configure({
  sinks: {
    file: getRotatingFileSink("my-app.log", {
      maxFileSize: 1024 * 1024,  // 1 MiB
      maxFiles: 5,
    }),
  },
  // Omitted for brevity
});
~~~~

Rotated log files are named with a suffix like *.1*, *.2*, *.3*, and so on.

For more details, see [`getRotatingFileSink()`] function and
[`RotatingFileSinkOptions`] interface in the API reference.

> [!NOTE]
> On Deno, you need to have the `--allow-write` flag and the `--unstable-fs`
> flag to use the rotating file sink.

[`getRotatingFileSink()`]: https://jsr.io/@logtape/logtape/doc/~/getRotatingFileSink
[`RotatingFileSinkOptions`]: https://jsr.io/@logtape/logtape/doc/~/RotatingFileSinkOptions

### Text formatter

A stream sink and a file sink write log messages in a plain text format.
You can customize the format by providing a text formatter.  The type of a
text formatter is:

~~~~ typescript
export type TextFormatter = (record: LogRecord) => string;
~~~~

Here's an example of a text formatter that writes log messages in a [JSON Lines]
format:

~~~~ typescript
await configure({
  sinks: {
    stream: getFileSink("log.jsonl", {
      formatter(log) {
        return JSON.stringify(log) + "\n",
      }
    }),
  },
  // Omitted for brevity
})
~~~~

> [!TIP]
> If you want to monitor log messages formatted in JSON Lines in real-time
> readably, you can utilize the `tail` and [`jq`] commands:
>
> ~~~~ sh
> tail -f log.jsonl | jq .
> ~~~~

[JSON Lines]: https://jsonlines.org/
[`jq`]: https://jqlang.github.io/jq/

### OpenTelemetry sink

If you have an [OpenTelemetry] collector running, you can use the OpenTelemetry
sink to send log messages to the collector using [@logtape/otel] package.

For more details, see the documentation of [@logtape/otel].

[OpenTelemetry]: https://opentelemetry.io/
[@logtape/otel]: https://github.com/dahlia/logtape-otel

### Disposable sink

> [!TIP]
> If you are unfamiliar with the concept of disposables, see also the proposal
> of *[ECMAScript Explicit Resource Management]*.

A disposable sink is a sink that can be disposed of.  They are automatically
disposed of when the configuration is reset or the program exits.  The type
of a disposable sink is: `Sink & Disposable`.  You can create a disposable
sink by defining a `[Symbol.dispose]` method:

~~~~ typescript
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

~~~~ typescript
const asyncDisposableSink: Sink & AsyncDisposable = (record: LogRecord) => {
  console.log(record.message);
};
asyncDisposableSink[Symbol.asyncDispose] = async () => {
  console.log("Disposed!");
};
~~~~

[ECMAScript Explicit Resource Management]: https://github.com/tc39/proposal-explicit-resource-management

### Explicit disposal

You can explicitly dispose of a sink by calling the [`dispose()`] method.  It is
useful when you want to flush the buffer of a sink without blocking returning
a response in edge functions.  Here's an example of using the `dispose()`
with [`ctx.waitUntil()`] in Cloudflare Workers:

~~~~ typescript
import { configure, dispose } from "@logtape/logtape";

export default {
  async fetch(request, env, ctx) {
    await configure({ /* ... */ });
    // ...
    ctx.waitUntil(dispose());
  }
}
~~~~

[`dispose()`]: https://jsr.io/@logtape/logtape/doc/~/dispose
[`ctx.waitUntil()`]: https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil


Filters
-------

A filter is a function that filters log messages.  A filter takes a log record
and returns a boolean value.  If the filter returns `true`, the log record is
passed to the sinks; otherwise, the log record is discarded.  Its signature is:

~~~~ typescript
export type Filter = (record: LogRecord) => boolean;
~~~~

For example, the following filter discards log messages whose property `elapsed`
is less than 100 milliseconds:

~~~~ typescript
import { configure, type LogRecord } from "@logtape/logtape";

await configure({
  // Omitted for brevity
  filters: {
    tooSlow(record: LogRecord) {
      return "elapsed" in record.properties && record.properties.elapsed >= 100;
    },
  },
  loggers: [
    {
      category: ["my-app", "database"],
      level: "debug",
      sinks: ["console"],
      filters: ["tooSlow"],
    }
  ]
});
~~~~

### Level filter

LogTape provides a built-in level filter.  You can use the level filter to
filter log messages by their log levels.  The level filter factory takes
a [`LogLevel`] string and returns a level filter.  For example, the following
level filter discards log messages whose log level is less than `info`:

~~~~ typescript
import { getLevelFilter } from "@logtape/logtape";

await configure({
  filters: {
    infoOrHigher: getLevelFilter("info");
  },
  // Omitted for brevity
});
~~~~

[`LogLevel`]: https://jsr.io/@logtape/logtape/doc/~/LogLevel

### Sink filter

A sink filter is a filter that is applied to a specific sink.  You can add a
sink filter to a sink by decorating the sink with [`withFilter()`]:

~~~~ typescript
import { getConsoleSink, withFilter } from "@logtape/logtape";

await configure({
  sinks: {
    filteredConsole: withFilter(
      getConsoleSink(),
      log => "elapsed" in log.properties && log.properties.elapsed >= 100,
    ),
  },
  // Omitted for brevity
});
~~~~

The `filteredConsoleSink` only logs messages whose property `elapsed` is greater
than or equal to 100 milliseconds to the console.

> [!TIP]
> The `withFilter()` function can take a [`LogLevel`] string as the second
> argument.  In this case, the log messages whose log level is less than
> the specified log level are discarded.

[`withFilter()`]: https://jsr.io/@logtape/logtape/doc/~/withFilter


Testing
-------

Here are some tips for testing your application or library with LogTape.

### Reset configuration

You can reset the configuration of LogTape to its initial state.  This is
useful when you want to reset the configuration between tests.  For example,
the following code shows how to reset the configuration after a test
(regardless of whether the test passes or fails) in Deno:

~~~~ typescript
import { configure, reset } from "@logtape/logtape";

Deno.test("my test", async (t) => {
  await t.step("set up", async () => {
    await configure({ /* ... */ });
  });

  await t.step("run test", () => {
    // Run the test
  });

  await t.step("tear down", async () => {
    await reset();
  });
});
~~~~

### Buffer sink

For testing purposes, you may want to collect log messages in memory.  Although
LogTape does not provide a built-in buffer sink, you can easily implement it:

~~~~ typescript
import { type LogRecord, configure } from "@logtape/logtape";

const buffer: LogRecord[] = [];

await configure({
  sinks: {
    buffer: buffer.push.bind(buffer),
  },
  // Omitted for brevity
});
~~~~

<!-- cSpell: ignore otel -->
