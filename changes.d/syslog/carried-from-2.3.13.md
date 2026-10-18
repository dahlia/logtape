---
links:
  '#259': https://github.com/dahlia/logtape/issues/259
  '#262': https://github.com/dahlia/logtape/pull/262
---
 -  Fixed `getSyslogSink()` permanently stopping after a connection or send
    failure and causing unhandled promise rejections for later records.  The
    sink now reconnects for subsequent records, preserves queued records in
    order, and reports failures through the meta logger.
    [[#259], [#262]]
