---
links:
  '#255': https://github.com/dahlia/logtape/issues/255
  '#257': https://github.com/dahlia/logtape/pull/257
---
 -  Fixed `redactByField()` dropping sink cleanup hooks in browsers without
    `Symbol.dispose` or `Symbol.asyncDispose`, including Safari, preventing
    `reset()` from flushing or closing wrapped sinks.  Wrapped sinks now
    preserve distinct synchronous and asynchronous cleanup hooks.
    [[#255], [#257]]
 -  Fixed `redactByFieldAsync()` losing its asynchronous cleanup hook when
    disposal symbols are unavailable.  `reset()` now waits for pending
    redaction and wrapped sink cleanup, and `configureSync()` rejects these
    asynchronous wrappers.
    [[#255], [#257]]
