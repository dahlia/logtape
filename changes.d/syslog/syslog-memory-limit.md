---
links:
  '#260': https://github.com/dahlia/logtape/issues/260
  '#263': https://github.com/dahlia/logtape/pull/263
---
 -  Added the `maxBufferedBytes` option to `getSyslogSink()` to limit pending
    Syslog message bytes.  Messages that exceed the limit are dropped, with a
    warning through the meta logger.  The default remains unlimited.
    [[#260], [#263]]
