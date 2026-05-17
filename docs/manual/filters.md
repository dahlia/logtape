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


Throttling filter
-----------------

*This API is available since LogTape 2.1.0.*

LogTape provides a built-in throttling filter for suppressing repeated log
records during bursts.  The filter tracks records by category, level, and raw
message template by default, so records with different substitution values are
treated as the same pattern:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getThrottlingFilter } from "@logtape/logtape";

await configure({
  filters: {
    throttle: getThrottlingFilter({
      limit: 5,
      windowMs: 10_000,
    }),
  },
  loggers: [
    {
      category: ["my-app"],
      sinks: ["console"],
      filters: ["throttle"],
    }
  ],
});
~~~~

The default `mode` is `"fixed"`.  A fixed window starts when the first record
for a key arrives, allows up to `limit` records during `windowMs`, and
suppresses the rest until the window closes.  Use `"sliding"` to count records
accepted during the most recent `windowMs` instead:

~~~~ typescript twoslash
import { getThrottlingFilter } from "@logtape/logtape";

const throttle = getThrottlingFilter({
  limit: 5,
  windowMs: 10_000,
  mode: "sliding",
});
~~~~

By default, the filter uses `Date.now()` for window calculations.  Set
`timeSource` to `"record"` to use each record's `timestamp` instead, or pass
`clock` when you need a custom clock:

~~~~ typescript twoslash
import { getThrottlingFilter } from "@logtape/logtape";

const throttle = getThrottlingFilter({
  limit: 5,
  windowMs: 10_000,
  timeSource: "record",
});
~~~~

Use `key` to define what counts as the same record.  The following filter
throttles per tenant regardless of message template:

~~~~ typescript twoslash
import { getThrottlingFilter } from "@logtape/logtape";

const throttle = getThrottlingFilter({
  limit: 20,
  windowMs: 60_000,
  key(record) {
    return String(record.properties.tenantId);
  },
});
~~~~

The filter keeps up to 1,000 keys by default and evicts the least recently used
key when the cap is reached.  Use `maxKeys` to change the cap, or `null` to
disable it:

~~~~ typescript twoslash
import { getThrottlingFilter } from "@logtape/logtape";

const throttle = getThrottlingFilter({
  limit: 5,
  windowMs: 10_000,
  maxKeys: 10_000,
});
~~~~

You can emit a summary when suppressed records are reported.  Summary logging
is a side effect of the filter: it happens when suppression ends, when a
suppressed key is evicted, or when the filter is disposed.  Prefer a dedicated
summary logger so the summary is easy to route separately from application log
traffic:

~~~~ typescript twoslash
// @noErrors: 2345
import {
  configure,
  getConsoleSink,
  getLogger,
  getThrottlingFilter,
} from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {
    throttle: getThrottlingFilter({
      limit: 5,
      windowMs: 10_000,
      summary: {
        logger: getLogger(["my-app", "log-throttle"]),
        level: "warning",
        message: "Last log message was suppressed {suppressed} times.",
      },
    }),
  },
  loggers: [
    {
      category: ["my-app"],
      sinks: ["console"],
      filters: ["throttle"],
    },
    {
      category: ["my-app", "log-throttle"],
      sinks: ["console"],
    },
  ],
});
~~~~

Summary records receive structured properties including `key`, `suppressed`,
`allowed`, `reason`, `startTime`, `endTime`, `firstRecord`, and `lastRecord`.
The filter lets summary records pass through reentrantly while it is emitting
them, but using a separate summary logger still avoids surprising category
inheritance and routing.


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
> The `withFilter()` function can take a `LogLevel` string as the second
> argument.  In this case, the log messages whose log level is less than
> the specified log level are discarded.
