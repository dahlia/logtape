---
links:
  '#255': https://github.com/dahlia/logtape/issues/255
  '#257': https://github.com/dahlia/logtape/pull/257
---
 -  Fixed CloudWatch Logs sinks losing their asynchronous cleanup hooks when
    `Symbol.asyncDispose` is unavailable.  `reset()` now waits for buffered
    records to be flushed, and `configureSync()` correctly rejects these
    asynchronous sinks.
    [[#255], [#257]]
