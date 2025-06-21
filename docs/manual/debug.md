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

 1. Suppresses the exception to prevent application crashes
 2. Logs the error to the meta logger
 3. Continues processing other sinks
 4. Prevents infinite recursion by bypassing the failing sink for meta logs

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
