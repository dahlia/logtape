Debugging and error handling
============================

This guide covers troubleshooting LogTape issues, debugging configuration
problems, understanding LogTape's internal error handling mechanisms, and
finding where in your code a log record was made.


Understanding LogTape's error handling
--------------------------------------

LogTape is designed to be resilient and non-intrusive.  When errors occur in
the logging system itself, LogTape handles them gracefully to prevent disrupting
your application.

### Meta logger

LogTape uses a special internal logger called the *meta logger* to report its
own operational issues.  The meta logger has the category `["logtape", "meta"]`
and handles:

 -  Sink errors and exceptions
 -  Configuration issues
 -  Internal LogTape errors

~~~~ typescript {8-9} twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    // Configure the meta logger to see LogTape's internal messages
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
    { category: ["app"], sinks: ["console"], lowestLevel: "info" }
  ]
});
~~~~

> [!TIP]
> It's recommended to configure the meta logger with a separate sink so you can
> easily notice if logging itself fails or is misconfigured.

### Sink error handling

When a sink throws an exception, LogTape:

1.  Suppresses the exception to prevent application crashes
2.  Logs the error to the meta logger
3.  Continues processing other sinks
4.  Prevents infinite recursion by bypassing the failing sink for meta logs

~~~~ typescript {19,22} twoslash
import {
  configure,
  getConsoleSink,
  type LogRecord,
  type Sink,
} from "@logtape/logtape";

// Example: A sink that sometimes fails
const unreliableSink: Sink = (record: LogRecord) => {
  if (Math.random() < 0.1) { // 10% failure rate
    throw new Error("Sink temporarily unavailable");
  }
  console.log("Reliable log:", record.message);
};

await configure({
  sinks: {
    unreliable: unreliableSink,
    meta: getConsoleSink()  // Meta logger will report sink failures here
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["meta"], lowestLevel: "error" },
    { category: ["app"], sinks: ["unreliable"], lowestLevel: "info" }
  ]
});
~~~~


Configuration errors
--------------------

LogTape validates your configuration and throws specific errors when it detects
problems. Understanding these error types and their common causes will help you
quickly diagnose and fix configuration issues.

### `ConfigError`

LogTape throws `ConfigError` for configuration-related issues. This is
a specific error type that indicates problems with your LogTape configuration
rather than application logic errors. Common scenarios include attempting to
reconfigure LogTape without the `reset` flag, duplicate logger configurations,
or mismatched async/sync configurations.

~~~~ typescript {19-22} twoslash
import { configure, ConfigError, getConsoleSink } from "@logtape/logtape";

try {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [
      { category: ["app"], sinks: ["console"], lowestLevel: "info" }
    ]
  });

  // This will throw ConfigError: Already configured
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [
      { category: ["app"], sinks: ["console"], lowestLevel: "debug" }
    ]
  });
} catch (error) {
  if (error instanceof ConfigError) {
    console.error("Configuration error:", error.message);
    // Handle configuration error appropriately
  }
}
~~~~

### Common configuration errors

#### Duplicate configuration

This error occurs when you try to configure multiple loggers for
the same category.  LogTape requires each category to have a unique
configuration to avoid conflicts and ambiguous behavior.

~~~~ typescript {7-8} twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

try {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [
      { category: ["app"], sinks: ["console"] },
      { category: ["app"], sinks: ["console"] }  // Duplicate!
    ]
  });
} catch (error) {
  console.error(error);
  // "Duplicate logger configuration for category: [\"app\"]"
}
~~~~

#### Missing `reset` flag

LogTape prevents accidental reconfiguration by default.  If you need to change
the configuration after it's already been set up, you must explicitly use
the `reset: true` flag.  This safety mechanism helps prevent configuration
conflicts in complex applications where multiple parts might try to configure
LogTape.

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

// First configuration
await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: ["app"], sinks: ["console"] }]
});

try {
  // This fails without reset: true
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: ["app"], sinks: ["console"] }]
  });
} catch (error) {
  console.error(error);
  // "Already configured; if you want to reset, turn on the reset flag."
}
~~~~

Here's correct way to reconfigure LogTape with the `reset` flag:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
// ---cut-before---
await configure({
  reset: true,  // Add this flag  // [!code highlight]
  sinks: { console: getConsoleSink() },
  loggers: [{ category: ["app"], sinks: ["console"] }]
});
~~~~

#### Async/sync configuration mismatch

This error occurs when you try to use `configureSync()` while there are still
active async disposables (like async sinks) from a previous configuration.
LogTape cannot mix synchronous and asynchronous configurations because they have
different disposal mechanisms.  You must properly dispose of async resources
before switching to a sync configuration, or use `configure()` instead.

~~~~ typescript twoslash
import {
  configure,
  configureSync,
  fromAsyncSink,
  getConsoleSink,
} from "@logtape/logtape";

// Configure with async sink
await configure({
  sinks: {
    async: fromAsyncSink(async (record) => {
      await fetch("/logs", { method: "POST", body: JSON.stringify(record) });
    })
  },
  loggers: [{ category: ["app"], sinks: ["async"] }]
});

try {
  // This fails because async disposables are still active
  configureSync({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: ["app"], sinks: ["console"] }]
  });
} catch (error) {
  console.error(error);
  // "Previously configured async disposables are still active..."
}
~~~~


Inspecting the effective configuration
--------------------------------------

*This API is available since LogTape 2.4.0.*

When a logger's records do not show up where you expect, `getConfig()` tells
you what you configured, but not how a particular logger's level, its
ancestors' sinks, and their filters combine.  `inspectLogger()` explains that
for one logger in the current execution context:

~~~~ typescript twoslash
import { configure, getConsoleSink, inspectLogger } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["my-app"], lowestLevel: "info", sinks: ["console"] },
    { category: ["my-app", "db"], lowestLevel: "debug" },
  ],
});

const report = inspectLogger(["my-app", "db"], { level: "debug" });
for (const path of report.sinkPaths) {
  console.log(path.id, path.category, path.status, path.gates);
}
// console [ "my-app" ] disabled [
//   { category: [ "my-app", "db" ], lowestLevel: "debug" },
//   { category: [ "my-app" ], lowestLevel: "info" }
// ]
~~~~

The `"debug"` record is accepted by `["my-app", "db"]`, but the `console` sink
belongs to `["my-app"]`, whose `lowestLevel` is `"info"`.  Configuring the
child with `parentSinks: "forward"` would let the record through; see
[*Forwarding sinks regardless of ancestor levels*][forwarding].

The report contains:

`source`
:   Whether the report reflects a scoped configuration set by `withConfig()`
    or `withConfigSync()` (`"scoped"`), the process-global configuration
    (`"global"`), or neither (`"unconfigured"`).

`categoryPrefix` and `effectiveCategory`
:   The category prefix set by `withCategoryPrefix()`, and the category
    records are actually dispatched under.

`loggers`
:   Each category from the root to the effective category, with whether it is
    configured and its own `lowestLevel`, `parentSinks`, sink identifiers,
    and filter identifiers.

`sinkPaths`
:   Every way a record can reach a sink, in the order the sinks are called.
    A sink that would receive a record more than once appears more than once.
    Each path names the category that has the sink, the `lowestLevel` gates
    on the way along with the categories that supply them, and a status.

`filters`
:   The filters that apply, and the category that supplies them.

`inheritanceBoundary`
:   The nearest category configured with `parentSinks: "override"`, beyond
    which no sinks are inherited, or the root.

`status`
:   Whether records can reach any sink.

Each status is one of:

`"enabled"`
:   Records are delivered without consulting any custom filter.

`"conditional"`
:   Records are delivered only if custom filters accept them.  Since the
    outcome of a custom filter is only known when a record is logged, the
    report cannot tell more than that.

`"disabled"`
:   Records are never delivered, because a `lowestLevel` gate or a level
    filter rejects them.

Pass the `level` option to evaluate statuses for records of that level.
Without it, a status tells whether records of some level can be delivered,
and each path's `lowestLevel` tells which levels.

`inspectLogger()` has no side effects: it does not log anything, invoke sinks
or filters, evaluate lazy properties, or create loggers.  Sinks are opaque to
it, so a sink that filters records by itself, such as one made by
`withFilter()` or `fingersCrossed()`, may still drop records that are reported
as delivered.

> [!TIP]
> The report makes category mistakes visible.  `inspectLogger("my-app:http")`
> shows a single category segment `"my-app:http"` whose only ancestor is the
> root, not a child of `["my-app"]`; use `["my-app", "http"]` instead.

[forwarding]: ./categories.md#forwarding-sinks-regardless-of-ancestor-levels


Showing where log records come from
-----------------------------------

*This API is available since LogTape 2.4.0.*

Browser consoles show a link to the place that called `console.log()`, which
is always inside LogTape's console sink rather than the code that logged the
message.  To find the logging call itself during development, you can let
LogTape capture the *source location* of each logging call and show it in
the formatted output.

Capturing and showing are configured separately, so that, for example, a file
sink can keep the locations without adding them to every console message.
Turn on capturing with the `~LoggerConfig.captureSourceLocation` option of
a logger configuration, and showing with the `sourceLocation` option of
a formatter:

~~~~ typescript twoslash
import {
  configure,
  getConsoleFormatter,
  getConsoleSink,
} from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: getConsoleFormatter({ sourceLocation: true }), // [!code highlight]
    }),
  },
  loggers: [
    {
      category: "my-app",
      lowestLevel: "debug",
      sinks: ["console"],
      captureSourceLocation: true, // [!code highlight]
    },
  ],
});
~~~~

The console then shows the location after the category, e.g.:

~~~~
12:34:56.789 INF my-app (http://localhost:5173/src/main.ts:42:7) Hello, world!
~~~~

The text formatters take the same option,
`~TextFormatterOptions.sourceLocation`, and accept a function that renders the
location, e.g., to show only the file name:

~~~~ typescript twoslash
import { getTextFormatter } from "@logtape/logtape";

const formatter = getTextFormatter({
  sourceLocation: ({ file, line }) =>
    `${file.slice(file.lastIndexOf("/") + 1)}:${line}`,
});
// 2023-11-14 22:13:20.000 +00:00 [INF] my-app (main.ts:42): Hello, world!
~~~~

Captured locations are in the `~LogRecord.sourceLocation` field of log
records, as `SourceLocation` objects with `file`, `line`, and `column` fields,
so that custom sinks and formatters can use them as well.  The other built-in
formatters, such as the JSON Lines and logfmt formatters, and the formatters
of other packages, such as *@logtape/pretty*, do not output them.

> [!WARNING]
> Capturing a source location builds a stack trace for every logging call
> whose level is not filtered out by the logger's `lowestLevel`, which costs
> several microseconds per call, or tens of microseconds on Deno.  Use it for
> development, and leave it off in production.  While no configuration turns it
> on, it costs next to nothing.

### Which loggers capture source locations

The `~LoggerConfig.captureSourceLocation` option is inherited by child
categories: a logger without the option uses the setting of its nearest
ancestor that has it, and the root logger's default is `false`.  So you can
turn it on for a whole application and off for some noisy part of it:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
// ---cut-before---
await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: "my-app", sinks: ["console"], captureSourceLocation: true },
    { category: ["my-app", "hot-loop"], captureSourceLocation: false },
  ],
});
~~~~

The inheritance does not depend on the `parentSinks` option.  Within
a `withConfig()` or `withConfigSync()` callback, the scoped configuration's
loggers decide instead, just as they decide the sinks.  Under
`withCategoryPrefix()`, the setting of the prefixed category applies.  The
meta logger never captures source locations.

### Which location is reported

The location is where your code calls a logging method such as
`~Logger.info()` or `~Logger.error()`, in every form of the call:

 -  For a logger made by `~Logger.with()` or `~Logger.getChild()`, it is where
    the logging method of that logger is called, not where the logger was
    made.
 -  For tagged templates, callbacks, and lazy or asynchronous property
    callbacks, it is where the logging method is called.  The location is
    captured before any callback runs and before the record reaches any sink,
    so buffering sinks such as `fingersCrossed()` keep it as well.
 -  For `~Logger.warn()` or `~Logger.error()` with an `Error`, it is where the
    logging method is called, not where the error was thrown.
 -  `~Logger.emit()` does not capture a location, but keeps
    the `sourceLocation` field of the record you pass to it.
 -  If you wrap LogTape's logging methods in functions of your own, it is
    the call inside your wrapper.  If you pass a logging method as a callback,
    e.g., to `Promise.prototype.then()`, it is where that callback is called,
    which can be inside the runtime.

### Limitations

The location is read from the runtime's stack trace, so it is not always
available or exact:

 -  It points to the code that actually runs.  LogTape does not resolve source
    maps, so bundled or minified code may report positions in the generated
    code, unless the runtime applies source maps to stack traces itself, as
    Deno and Bun do for TypeScript, and Node.js does with
    `--enable-source-maps`.
 -  Runtimes format stack traces differently.  This feature has been tested
    on Node.js, Deno, Bun, Chromium, and Firefox; it has not been tested on
    Safari or other runtimes.  The column may point to a different part of the
    call depending on the runtime.
 -  JavaScriptCore, the engine of Bun and Safari, omits the frame of
    a function that ends with a call in tail position, e.g., an arrow function
    like `() => logger.info("…")` or `return logger.info("…")`.  For such
    calls, the location of the caller is reported, or no location at all.
 -  If the stack trace cannot be read unambiguously, for example, because
    `Error.stackTraceLimit` is too small, `Error.prepareStackTrace` fails or
    returns an unusual format, or the code was created by `eval()`, the
    location is left out rather than guessed.  The logging call still
    succeeds.  A custom `Error.prepareStackTrace` that adds or removes frames
    while keeping the usual format can make the location inaccurate.
 -  The clickable link in the browser console still points to LogTape's console
    sink.  The location only appears in the message text.
