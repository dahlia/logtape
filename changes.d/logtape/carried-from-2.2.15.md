---
links:
  '#255': https://github.com/dahlia/logtape/issues/255
  '#257': https://github.com/dahlia/logtape/pull/257
---
 -  Fixed `configureSync()` rejecting synchronous disposable sinks and filters
    in browsers without `Symbol.dispose` or `Symbol.asyncDispose`, including
    Safari. Sinks and filters now retain their distinct cleanup hooks,
    preventing duplicate cleanup and asynchronous cleanup during `resetSync()`.
    Sink wrappers preserve these hooks, and disposable sinks also work with
    `using` and `await using` transpiled with registry-symbol fallbacks
    (`Symbol.for("Symbol.dispose")` and `Symbol.for("Symbol.asyncDispose")`).
    Scoped configurations now also preserve cleanup hooks and correctly
    distinguish synchronous and asynchronous resources in `withConfig()`
    and `withConfigSync()`.  [[#255], [#257]]
