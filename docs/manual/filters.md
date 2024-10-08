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

~~~~ typescript{5-9} twoslash
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
      level: "debug",
      sinks: ["console"],
      filters: ["tooSlow"],  // [!code highlight]
    }
  ]
});
~~~~


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
    infoOrHigher: getLevelFilter("info"),  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~


Sink filter
-----------

A sink filter is a filter that is applied to a specific [sink](./sinks.md).
You can add a sink filter to a sink by decorating the sink with `withFilter()`:

~~~~ typescript{5-8} twoslash
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
