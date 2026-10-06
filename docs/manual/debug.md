Debugging and error handling
============================

This guide covers troubleshooting LogTape issues, debugging configuration
problems, and understanding LogTape's internal error handling mechanisms.


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
