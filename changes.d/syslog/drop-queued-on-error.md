---
links:
  '#259': https://github.com/dahlia/logtape/issues/259
  '#264': https://github.com/dahlia/logtape/pull/264
---
 -  Added the `dropQueuedOnError` option to `getSyslogSink()` to discard queued
    records after a connection or send failure.  The default is `false`,
    preserving queued records.  Failed records are not retried.
    [[#259], [#264]]
