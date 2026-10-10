---
links:
  '#255': https://github.com/dahlia/logtape/issues/255
  '#257': https://github.com/dahlia/logtape/pull/257
---
 -  Fixed file sinks losing their cleanup hooks when `Symbol.dispose` or
    `Symbol.asyncDispose` is unavailable.  Synchronous file sinks now work with
    `configureSync()`, and `reset()` invokes and awaits asynchronous cleanup,
    flushing buffered records for non-blocking and stream file sinks.
    [[#255], [#257]]
