Categories
==========

LogTape uses a hierarchical category system to manage loggers.  A category is
a list of strings.  For example, `["my-app", "my-module"]` is a category.

When you log a message, it is dispatched to all loggers whose categories are
prefixes of the category of the logger.  For example, if you log a message
with the category `["my-app", "my-module", "my-submodule"]`, it is dispatched
to loggers whose categories are `["my-app"]` and `["my-app", "my-module"]`.

This behavior allows you to control the verbosity of log messages by setting
the `~LoggerConfig.lowestLevel` of loggers at different levels of the category
hierarchy.

Here's an example of setting log levels for different categories:

~~~~ typescript{10-11} twoslash
import { getFileSink } from "@logtape/file";
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
    file:    getFileSink("app.log"),
  },
  loggers: [
    { category: ["my-app"],              lowestLevel: "info",  sinks: ["file"] },
    { category: ["my-app", "my-module"], lowestLevel: "debug", sinks: ["console"] },
  ],
})
~~~~


Sink inheritance and overriding
-------------------------------

When you configure a logger, you can specify multiple sinks for the logger.
The logger inherits the sinks from its parent loggers.  If a logger has multiple
sinks, the logger sends log messages to all of its sinks.

For example, the following configuration sets up two sinks, `a` and `b`, and
configures two loggers.  The logger `["my-app"]` sends log messages to sink `a`,
and the logger `["my-app", "my-module"]` sends log messages to sink both `a` and
`b`:

~~~~ typescript twoslash
import { type LogRecord, configure, getLogger } from "@logtape/logtape";

const a: LogRecord[] = [];
const b: LogRecord[] = [];

await configure({
  sinks: {
    a: a.push.bind(a),
    b: b.push.bind(b),
  },
  loggers: [
    { category: ["my-app"], sinks: ["a"] },
    { category: ["my-app", "my-module"], sinks: ["b"] },
  ],
});

getLogger(["my-app"]).info("foo");
// a = [{ message: "foo", ... }]
// b = []

getLogger(["my-app", "my-module"]).info("bar");
// a = [{ message: "foo", ... }, { message: "bar", ... }]
// b = [                         { message: "bar", ... }]
~~~~


You can override the sinks inherited from the parent loggers by specifying
`parentSinks: "override"` in the logger configuration.  This is useful when you
want to replace the inherited sinks with a different set of sinks:

~~~~ typescript twoslash
import { type LogRecord, configure, getLogger } from "@logtape/logtape";

const a: LogRecord[] = [];
const b: LogRecord[] = [];

await configure({
  sinks: {
    a: a.push.bind(a),
    b: b.push.bind(b),
  },
  loggers: [
    { category: ["my-app"], sinks: ["a"] },
    {
      category: ["my-app", "my-module"],
      sinks: ["b"],
      parentSinks: "override", // [!code highlight]
    },
  ],
});

getLogger(["my-app"]).info("foo");
// a = [{ message: "foo", ... }]
// b = []

getLogger(["my-app", "my-module"]).info("bar");
// a = [{ message: "foo", ... }]
// b = [{ message: "bar", ... }]
~~~~


Root logger
-----------

The root logger is a special logger that acts as the parent of all other loggers
in the hierarchical category system.  It is represented by an empty array `[]`
as its category.  This logger is particularly useful for catch-all logging
configurations where you want to capture logs from all categories without
knowing the specific categories in advance.

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    // Root logger catches all log messages
    { category: [], sinks: ["console"], lowestLevel: "info" },
  ],
});
~~~~

The root logger will capture logs from all categories in your application and
any libraries you're using.  This is perfect for scenarios where you want to
ensure you don't miss any logs without needing to know all the specific
categories beforehand.

You can also combine the root logger with more specific loggers:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    // Catch-all logger for everything at info level
    { category: [], sinks: ["console"], lowestLevel: "info" },
    // More verbose logging for your specific app
    { category: ["my-app"], sinks: ["console"], lowestLevel: "debug" },
  ],
});
~~~~

In this configuration, the root logger will handle all log messages at the
`info` level or higher, while the `["my-app"]` logger will handle messages
from the `my-app` category at the `debug` level or higher.


Child loggers
-------------

You can get a child logger from a parent logger by calling `~Logger.getChild()`:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
// ---cut-before---
const logger = getLogger(["my-app"]);
const childLogger = logger.getChild("my-module");
// equivalent: const childLogger = getLogger(["my-app", "my-module"]);
~~~~

The `~Logger.getChild()` method can take an array of strings as well:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
// ---cut-before---
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
> ~~~~ typescript twoslash
> // @noErrors: 2307
> import { type Sink } from "@logtape/logtape";
> /**
>  * A hypothetical function to get your main sink.
>  * @returns The main sink.
>  */
> function getYourMainSink(): Sink {
>   return 0 as unknown as Sink;
> }
> // ---cut-before---
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


Category prefix
---------------

*Category prefix is available since LogTape 1.3.0.*

When building layered library architectures (core libraries → SDKs →
applications), you may want logs from internal libraries to appear under your
SDK's category.  The `withCategoryPrefix()` function allows you to prepend a
category prefix to all log records within a callback context.

### Settings

> [!CAUTION]
> In order to use `withCategoryPrefix()`, your JavaScript runtime must support
> context-local states (like Node.js's [`node:async_hooks`] module).  If your
> JavaScript runtime doesn't support context-local states, LogTape will silently
> ignore the category prefix.
>
> As of November 2025, Node.js, Deno, and Bun support this feature.
> Web browsers don't support it yet.
>
> See also [TC39 Async Context proposal] for web browsers.

To enable `withCategoryPrefix()`, you need to set a `~Config.contextLocalStorage`
option in the `configure()` function.  In Node.js, Deno, and Bun, you can use
[`AsyncLocalStorage`] from the [`node:async_hooks`] module:

~~~~ typescript twoslash
// @noErrors: 2307
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  // ... other settings ...
  // ---cut-start---
  sinks: {},
  loggers: [],
  // ---cut-end---
  contextLocalStorage: new AsyncLocalStorage(),
});
~~~~

> [!NOTE]
> Without the `~Config.contextLocalStorage` option, `withCategoryPrefix()`
> will not prepend any prefix and will log a warning to the meta logger
> (`["logtape", "meta"]`).

[`node:async_hooks`]: https://nodejs.org/api/async_context.html
[TC39 Async Context proposal]: https://tc39.es/proposal-async-context/
[`AsyncLocalStorage`]: https://nodejs.org/api/async_context.html#class-asynclocalstorage


### Basic usage

~~~~ typescript twoslash
// @noErrors: 2307
import { getLogger, withCategoryPrefix } from "@logtape/logtape";
import { coreLibraryFunction } from "core-library";

export function sdkFunction() {
  return withCategoryPrefix(["my-sdk"], () => {
    // Any logs from core-library within this context
    // will have ["my-sdk"] prepended to their category
    return coreLibraryFunction();
  });
}
~~~~

If `coreLibraryFunction()` logs with `getLogger(["core-library"])`, the final
category will become `["my-sdk", "core-library"]`.

You can also pass a string instead of an array:

~~~~ typescript twoslash
import { withCategoryPrefix } from "@logtape/logtape";

withCategoryPrefix("my-sdk", () => {
  // Equivalent to withCategoryPrefix(["my-sdk"], () => { ... })
});
~~~~


### Nesting

Category prefixes can be nested and accumulate:

~~~~ typescript twoslash
import { getLogger, withCategoryPrefix } from "@logtape/logtape";

withCategoryPrefix(["app"], () => {
  withCategoryPrefix(["sdk-1"], () => {
    getLogger(["core-lib"]).info("Hello");
    // Category: ["app", "sdk-1", "core-lib"]
  });
});
~~~~


### Combining with implicit contexts

`withCategoryPrefix()` works seamlessly with `withContext()`:

~~~~ typescript twoslash
import { getLogger, withContext, withCategoryPrefix } from "@logtape/logtape";

withCategoryPrefix(["my-sdk"], () => {
  withContext({ requestId: "abc-123" }, () => {
    getLogger(["internal"]).info("Processing request: {requestId}");
    // Category: ["my-sdk", "internal"]
    // Properties include: { requestId: "abc-123" }
  });
});
~~~~
