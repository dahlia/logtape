---
links:
  '#218': https://github.com/dahlia/logtape/issues/218
  '#221': https://github.com/dahlia/logtape/pull/221
---
 -  Fixed the default formatter throwing
    `TypeError: Converting circular structure to JSON` when an interpolated
    message value or a property contains a circular reference.  Such a
    reference is now rendered as the string `"[Circular]"`.
    [[#218], [#221]]
