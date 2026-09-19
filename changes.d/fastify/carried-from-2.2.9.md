---
links:
  '#218': https://github.com/dahlia/logtape/issues/218
  '#221': https://github.com/dahlia/logtape/pull/221
---
 -  Fixed the Pino-compatible logger's `%j`, `%o`, and `%O` conversions
    throwing `TypeError: Converting circular structure to JSON` when the
    corresponding argument contains a circular reference.  Such a reference is
    now rendered as the string `"[Circular]"`.
    [[#218], [#221]]
