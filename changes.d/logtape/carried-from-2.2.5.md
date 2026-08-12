---
links:
  '#201': https://github.com/dahlia/logtape/issues/201
---
 -  Fixed a bug where `fingersCrossed()` did not preserve `Disposable` and
    `AsyncDisposable` cleanup methods from wrapped sinks, preventing them from
    flushing buffered records or releasing resources during logging shutdown.
    As a result, `configureSync()` now rejects wrapped sinks that implement
    `AsyncDisposable`; use `configure()` for such sinks.
    [[#201]]
