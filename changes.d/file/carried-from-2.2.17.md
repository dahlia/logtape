---
links:
  '#268': https://github.com/dahlia/logtape/issues/268
  '#274': https://github.com/dahlia/logtape/pull/274
---
 -  Fixed a bug where `getRotatingFileSink()` could stop logging after the
    active log file was deleted.  The sink now recreates the file on the next
    rotation.  It also no longer reuses a closed file handle if rotation fails.
    [[#268], [#274]]
