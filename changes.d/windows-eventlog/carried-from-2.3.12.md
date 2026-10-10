---
links:
  '#255': https://github.com/dahlia/logtape/issues/255
  '#257': https://github.com/dahlia/logtape/pull/257
---
 -  Fixed Windows Event Log sinks losing their synchronous cleanup hooks when
    `Symbol.dispose` is unavailable.  `configureSync()` now accepts these
    sinks, and `reset()` and `resetSync()` release their Event Log resources.
    [[#255], [#257]]
