---
links:
  '#234': https://github.com/dahlia/logtape/issues/234
  '#235': https://github.com/dahlia/logtape/pull/235
---
 -  Added the `FingersCrossedOptions.afterTrigger` option and the
    `FingersCrossedAfterTrigger` type.  Setting it to `"buffer"` makes
    `fingersCrossed()` go back to buffering after each trigger instead of
    passing every subsequent record through, so long-running processes can
    output each error together with the records that led up to it.
    [[#234], [#235]]
