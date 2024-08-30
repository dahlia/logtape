Categories
==========

LogTape uses a hierarchical category system to manage loggers.  A category is
a list of strings.  For example, `["my-app", "my-module"]` is a category.

When you log a message, it is dispatched to all loggers whose categories are
prefixes of the category of the logger.  For example, if you log a message
with the category `["my-app", "my-module", "my-submodule"]`, it is dispatched
to loggers whose categories are `["my-app", "my-module"]` and `["my-app"]`.

This behavior allows you to control the verbosity of log messages by setting
the log level of loggers at different levels of the category hierarchy.

Here's an example of setting log levels for different categories:

~~~~ typescript{9-10}
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


Child loggers
-------------

You can get a child logger from a parent logger by calling `~Logger.getChild()`:

~~~~ typescript
const logger = getLogger(["my-app"]);
const childLogger = logger.getChild("my-module");
// equivalent: const childLogger = getLogger(["my-app", "my-module"]);
~~~~

The `~Logger.getChild()` method can take an array of strings as well:

~~~~ typescript
const logger = getLogger(["my-app"]);
const childLogger = logger.getChild(["my-module", "foo"]);
// equivalent: const childLogger = getLogger(["my-app", "my-module", "foo"]);
~~~~


Meta logger
-----------

The meta logger is a special logger in LogTape designed to handle internal
logging within the LogTape system itself.  It serves as a mechanism for LogTape
to report its own operational status, errors, and important events.  This is
particularly useful for debugging issues with LogTape configuration or for
monitoring the health of your logging system.

It is logged to the category `["logtape", "meta"]`, and it is automatically
enabled when you call `configure()` without specifying the meta logger.
To disable the meta logger, you can set the `sinks` property of the meta logger
to an empty array.

> [!NOTE]
> On sink errors, the meta logger is used to log the error messages, but these
> messages are not logged to the same sink that caused the error.  This is to
> prevent infinite loops of error messages when a sink error is caused by the
> sink itself.

> [!TIP]
> Consider using a separate sink for the meta logger.  This ensures that
> if there's an issue with your main sink, you can still receive meta logs about
> the issue:
>
> ~~~~ typescript
> import { configure, getConsoleSink } from "@logtape/logtape";
> import { getYourMainSink } from "./your-main-sink.ts";
>
> await configure({
>   sinks: {
>     console: getConsoleSink(),
>     main: getYourMainSink(),
>   },
>   filters: {},
>   loggers: [
>     { category: ["logtape", "meta"], sinks: ["console"] },
>     { category: ["your-app"], sinks: ["main"] },
>   ],
> });
