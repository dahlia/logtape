---
links:
  '#245': https://github.com/dahlia/logtape/issues/245
  '#249': https://github.com/dahlia/logtape/pull/249
---
 -  Added optional `onDrop` and `onError` callbacks to non-blocking console
    and stream sinks to report aggregated buffer overflow counts and output
    failures without exposing dropped records.  Added the `SinkDropReason`,
    `SinkDropEvent`, and `SinkErrorEvent` types for these notifications.
    [[#245], [#249]]

 -  Fixed concurrent or repeated disposal of a non-blocking stream sink so
    pending output finishes before its writer is closed or released.
    [[#245], [#249]]
