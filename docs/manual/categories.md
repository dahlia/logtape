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