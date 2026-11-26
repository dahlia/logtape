---
links:
  '#270': https://github.com/dahlia/logtape/issues/270
  '#275': https://github.com/dahlia/logtape/pull/275
---
 -  Added the `events` option to `getSentrySink()` in *@logtape/sentry*.  Set
    `events: false` to disable all error events from the sink, or
    `events: { exceptions: false }` to disable only exception events, without
    changing what the sink sends to Sentry Logs.  [[#270], [#275]]
