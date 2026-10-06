---
links:
  '#236': https://github.com/dahlia/logtape/issues/236
  '#237': https://github.com/dahlia/logtape/pull/237
---
 -  Added the `"bare"` preset to the `TextFormatterOptions.value` option, so
    that `getTextFormatter()` and `getAnsiColorFormatter()` can render
    interpolated string values without the quotes and escapes that
    `inspect()` adds.  Other values, including strings nested in objects and
    arrays, are rendered as before.  Bare strings are sanitized instead: SGR
    sequences are always escaped, and newlines are escaped unless
    `TextFormatterOptions.sanitize` explicitly preserves them.  [[#236], [#237]]

 -  Changed the type of the `TextFormatterOptions.value` option to
    `"bare" | ((value: unknown, inspect: (value: unknown, options?: { colors?: boolean }) => string) => string)`
    (was
    `(value: unknown, inspect: (value: unknown, options?: { colors?: boolean }) => string) => string`).
    Code that calls the option directly now has to check that it is a function
    first.  [[#236], [#237]]
