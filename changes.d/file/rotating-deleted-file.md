---
links:
  '#268': https://github.com/dahlia/logtape/issues/268
---
 -  Fixed `getRotatingFileSink()` writing to or closing an unrelated file
    descriptor after the active log file was deleted.  A missing active file
    now counts as nothing to rotate, and the sink reopens the path after every
    rotation attempt, including failed ones.  [[#268]]
