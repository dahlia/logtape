---
links:
  '#227': https://github.com/dahlia/logtape/issues/227
  '#228': https://github.com/dahlia/logtape/pull/228
---
 -  Improved the performance of logging calls that are disabled by the
    logger's `lowestLevel`, or whose category has neither a sink nor a filter
    to reach.  Such calls now return before building a log record, instead of
    building and then discarding one.  For example, `logger.debug("...")` on
    a logger configured with `lowestLevel: "info"` is now about ten times
    faster on Node.js and Deno.  [[#227], [#228]]

    As a result, `lazy()` values given to `Logger.with()` are no longer
    evaluated for such calls made with a template literal or a callback,
    matching the behavior of calls made with a message string.
