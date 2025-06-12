Severity levels
===============

When you're logging events in your application, not all messages are created
equal. Some might be routine information, while others could be critical errors
that need immediate attention. That's where severity levels come in.
LogTape provides six severity levels to help you categorize your log messages
effectively.


Six severity levels
-------------------

LogTape uses the following severity levels, listed from lowest to highest
severity:

 1. *Trace*: The most detailed level, used for tracing the flow of execution.
 2. *Debug*: Detailed information useful for diagnosing problems.
 3. *Information*: General information about the application's operation.
 4. *Warning*: An unexpected event that doesn't prevent the application
    from functioning.
 5. *Error*: A significant problem that prevented a specific operation from
    being completed.
 6. *Fatal error*: A critical error that causes the application to abort.

> [!NOTE]
> Previous versions of LogTape had only five severity levels: *Debug*,
> *Information*, *Warning*, *Error*, and *Fatal error*.  The *Trace* level was
> introduced in LogTape 0.12.0.

> [!NOTE]
> LogTape currently does not support custom severity levels.

Let's break down when you might use each of these:

### Trace

*This API is available since LogTape 0.12.0.*

Use this level for very detailed information that is useful for tracing the
flow of execution in your application. This is typically used during development
or debugging sessions.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
const userId = "user123" as string;
// ---cut-before---
logger.trace("Entering function with user {userId}.", { userId });
~~~~

### Debug

Use this level for detailed information that is useful for diagnosing
problems. Unlike trace which focuses on execution flow, debug provides
contextual information about application state, variable values, and
business logic decisions that help identify issues.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
const queryParams = { limit: 10, offset: 0 } as Record<string, unknown>;
const results = [] as unknown[];
// ---cut-before---
logger.debug(
  "Database query returned {count} results with params: {queryParams}.",
  { count: results.length, queryParams },
);
~~~~

### Information

This level is for general information about the application's operation.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
const username = "" as string;
// ---cut-before---
logger.info("User {username} logged in successfully.", { username });
~~~~

### Warning

Use this when something unexpected happened, but the application can continue
functioning. This level is often used for events that are close to causing
errors.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
// ---cut-before---
logger.warn("API rate limit is close to exceeding, 95% of limit reached.");
~~~~

### Error

This level indicates a significant problem that prevented a specific operation
from being completed. Use this for errors that need attention but don't
necessarily cause the application to stop.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
const err = new Error();
// ---cut-before---
logger.error(
  "Failed to save user data to database.",
  { userId: "12345", error: err },
);
~~~~

### Fatal error

Use this for critical errors that cause the application to abort. Fatal errors
are typically unrecoverable and require immediate attention.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
const error = new Error();
// ---cut-before---
logger.fatal("Unrecoverable error: Database connection lost.", { error });
~~~~


Choosing the right level
------------------------

When deciding which level to use, consider:

 -  *The impact on the application*: How severely does this event affect
    the application's operation?
 -  *The urgency of response*: How quickly does someone need to act on
    this information?
 -  *The audience*: Who needs to see this message? Developers?
    System administrators? End-users?


Configuring severity levels
---------------------------

*This API is available since LogTape 0.8.0.*

You can control which severity levels are logged in different parts of your
application. For example:

~~~~ typescript{6,11} twoslash
// @noErrors: 2345
import { configure } from "@logtape/logtape";
// ---cut-before---
await configure({
// ---cut-start---
  sinks: {
    console(record) { },
    file(record) { },
  },
// ---cut-end---
  // ... other configuration ...
  loggers: [
    {
      category: ["app"],
      lowestLevel: "info",  // This will log info and above
      sinks: ["console"],
    },
    {
      category: ["app", "database"],
      lowestLevel: "trace",  // This will log everything including trace for database operations
      sinks: ["file"],
    }
  ]
});
~~~~

This configuration will log all levels from `"info"` up for most of the app,
but will include all levels including `"trace"` logs for database operations.

> [!NOTE]
> The `~LoggerConfig.lowestLevel` is applied to the logger itself, not to its
> sinks.  In other words, the `~LoggerConfig.lowestLevel` property determines
> which log records are emitted by the logger.  For example, if the parent
> logger has a `~LoggerConfig.lowestLevel` of `"debug"` with a sink `"console"`,
> and the child logger has a `~LoggerConfig.lowestLevel` of `"info"`,
> the child logger still won't emit `"debug"` records to the `"console"` sink.

The `~LoggerConfig.lowestLevel` property does not inherit from parent loggers,
but it is `"trace"` by default for all loggers.  If you want to make child
loggers inherit the severity level from their parent logger, you can use the
`~LoggerConfig.filters` option instead.

If you want make child loggers inherit the severity level from their parent
logger, you can use the `~LoggerConfig.filters` option instead:

~~~~ typescript{4,9,13} twoslash
// @noErrors: 2345
import { configure } from "@logtape/logtape";
// ---cut-before---
await configure({
  // ... other configuration ...
  filters: {
    infoAndAbove: "info",
  },
  loggers: [
    {
      category: ["app"],
      filters: ["infoAndAbove"],  // This will log info and above
    },
    {
      category: ["app", "database"],
      // This also logs info and above, because it inherits from the parent logger
    }
  ]
});
~~~~

In this example, the database logger will inherit the `aboveAndInfo` filter from
the parent logger, so it will log all levels from `"info"` up.

> [!TIP]
> The `~LoggerConfig.filters` option takes a map of filter names to
> `FilterLike`, where `FilterLike` is either a `Filter` function or a severity
> level string.  The severity level string will be resolved to a `Filter` that
> filters log records with the specified severity level and above.
>
> See also the [*Level filter* section](./filters.md#level-filter).


Comparing two severity levels
-----------------------------

*This API is available since LogTape 0.8.0.*

You can compare two severity levels to see which one is more severe by using
the `compareLogLevel()` function.  Since this function returns a number where
negative means the first argument is less severe, zero means they are equal,
and positive means the first argument is more severe, you can use it with
[`Array.sort()`] or [`Array.toSorted()`] to sort severity levels:

~~~~ typescript twoslash
// @noErrors: 2724
import { type LogLevel, compareLogLevel } from "@logtape/logtape";

const levels: LogLevel[] = ["info", "debug", "error", "warning", "fatal", "trace"];
levels.sort(compareLogLevel);
for (const level of levels) console.log(level);
~~~~

The above code will output:

~~~~
trace
debug
info
warning
error
fatal
~~~~

[`Array.sort()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
[`Array.toSorted()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted


Best practices
--------------

 1. *Be consistent*: Use levels consistently across your application.
 2. *Don't over-use lower levels*: Too many debug or info logs can make it
    harder to find important information.
 3. *Include context*: Especially for higher severity levels, include relevant
    data to help diagnose the issue.
 4. *Consider performance*: Remember that logging, especially at lower levels,
    can impact performance in high-volume scenarios.

By using severity levels effectively, you can create logs that are informative,
actionable, and easy to navigate. This will make debugging and monitoring your
application much more manageable.
