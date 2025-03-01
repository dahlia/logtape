Filters
=======

A filter is a function that filters log messages.  A filter takes a log record
and returns a boolean value.  If the filter returns `true`, the log record is
passed to the sinks; otherwise, the log record is discarded.  The signature of
`Filter` is:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
export type Filter = (record: LogRecord) => boolean;
~~~~

The `configure()` function takes a `~Config.filters` object that maps filter
names to filter functions.  You can use the filter names in
the `~Config.loggers` object to assign filters to loggers.

For example, the following filter discards log messages whose property `elapsed`
is less than 100 milliseconds:

~~~~ typescript{5-10} twoslash
// @noErrors: 2345
import { configure, type LogRecord } from "@logtape/logtape";

await configure({
  // Omitted for brevity
  filters: {
    tooSlow(record: LogRecord) {
      return "elapsed" in record.properties
        && typeof record.properties.elapsed === "number"
        && record.properties.elapsed >= 100;
    },
  },
  loggers: [
    {
      category: ["my-app", "database"],
      sinks: ["console"],
      filters: ["tooSlow"],  // [!code highlight]
    }
  ]
});
~~~~


Inheritance
-----------

Child loggers inherit filters from their parent loggers.  Even if a child logger
has its own filters, the child logger filters out log messages that are filtered
out by its parent logger filters plus its own filters.

For example, the following example sets two filters, `hasUserInfo` and
`tooSlow`, and assigns the `hasUserInfo` filter to the parent logger and
the `tooSlow` filter to the child logger:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, type LogRecord } from "@logtape/logtape";
// ---cut-before---
await configure({
  // Omitted for brevity
  filters: {
    hasUserInfo(record: LogRecord) {
      return "userInfo" in record.properties;
    },
    tooSlow(record: LogRecord) {
      return "elapsed" in record.properties
        && typeof record.properties.elapsed === "number"
        && record.properties.elapsed >= 100;
    },
  },
  loggers: [
    {
      category: ["my-app"],
      sinks: ["console"],
      filters: ["hasUserInfo"],  // [!code highlight]
    },
    {
      category: ["my-app", "database"],
      sinks: [],
      filters: ["tooSlow"],  // [!code highlight]
    }
  ]
});
~~~~

In this example, any log messages under the `["my-app"]` category including
the `["my-app", "database"]` category are passed to the console sink only if
they have the `userInfo` property.  In addition, the log messages under the
`["my-app", "database"]` category are passed to the console sink only if they
have the `elapsed` with a value greater than or equal to 100 milliseconds.


Level filter
------------

LogTape provides a built-in level filter.  You can use the level filter to
filter log messages by their log levels.  The level filter factory takes
a `LogLevel` string and returns a level filter.  For example, the following
level filter discards log messages whose log level is less than `info`:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getLevelFilter } from "@logtape/logtape";

await configure({
  filters: {
    infoAndAbove: getLevelFilter("info"),  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~

The `~Config.filters` takes a map of filter names to `FilterLike`, instead of
just `Filter`, where `FilterLike` is either a `Filter` function or a severity
level string.  The severity level string will be resolved to a `Filter` that
filters log records with the specified severity level and above.  Hence, you
can simplify the above example as follows:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure } from "@logtape/logtape";
// ---cut-before---
await configure({
  filters: {
    infoAndAbove: "info",  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~


Sink filter
-----------

A sink filter is a filter that is applied to a specific [sink](./sinks.md).
You can add a sink filter to a sink by decorating the sink with `withFilter()`:

~~~~ typescript{7-9} twoslash
// @noErrors: 2345
import { configure, getConsoleSink, withFilter } from "@logtape/logtape";

await configure({
  sinks: {
    filteredConsole: withFilter(
      getConsoleSink(),
      log => "elapsed" in log.properties &&
        typeof log.properties.elapsed === "number" &&
        log.properties.elapsed >= 100,
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
