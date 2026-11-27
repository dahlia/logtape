---
links:
  '#277': https://github.com/dahlia/logtape/issues/277
  '#280': https://github.com/dahlia/logtape/pull/280
---
 -  Added `fileMode` and `fileModePolicy` to `getRotatingFileSink()`.  Set a
    POSIX creation mode for new logs, or opt in to enforcing an exact mode on
    existing and newly opened logs.  [[#277], [#280]]
