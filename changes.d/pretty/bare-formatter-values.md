---
links:
  '#236': https://github.com/dahlia/logtape/issues/236
  '#237': https://github.com/dahlia/logtape/pull/237
---
 -  Added the `PrettyFormatterOptions.value` option, which takes the same
    values as `TextFormatterOptions.value`.  Setting it to `"bare"` renders
    interpolated string values without the quotes and escapes that
    `inspect()` adds, sanitizing them instead; a function customizes how
    values are rendered, and receives an `inspect()` function that applies
    the `inspectOptions` and `colors` options.  [[#236], [#237]]
