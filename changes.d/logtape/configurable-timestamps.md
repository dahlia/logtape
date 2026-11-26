---
links:
  '#267': https://github.com/dahlia/logtape/issues/267
  '#273': https://github.com/dahlia/logtape/pull/273
---
 -  Added an optional `timestamp` field of type `() => number` to `configure()`
    and `configureSync()`.  It supplies log record timestamps and defaults to
    `Date.now()`.  For example, Next.js apps can use it to select a clock that
    works during prerendering.  [[#267], [#273]]
