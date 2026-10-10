---
links:
  '#255': https://github.com/dahlia/logtape/issues/255
  '#257': https://github.com/dahlia/logtape/pull/257
---
 -  Fixed OpenTelemetry sinks losing their asynchronous cleanup hooks in
    browsers without `Symbol.asyncDispose`, including Safari.  `reset()` now
    waits for provider shutdown, and `configureSync()` correctly rejects these
    asynchronous sinks.
    [[#255], [#257]]
