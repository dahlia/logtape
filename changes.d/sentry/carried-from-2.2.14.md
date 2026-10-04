---
links:
  '#232': https://github.com/dahlia/logtape/issues/232
  '#233': https://github.com/dahlia/logtape/pull/233
---
 -  Fixed `getSentrySink()` not sending records to Sentry's Logs API with
    Sentry SDK 11.0.0 or later, which removed the `enableLogs` option.
    The sink no longer checks the `enableLogs` option itself, and leaves it to
    the Sentry SDK to decide whether to capture logs.
    [[#232], [#233]]
 -  Fixed `getSentrySink()` not sending records to Sentry's Logs API with
    Sentry SDK 9.x and 10.0.0 through 10.12.x, where *@sentry/core* does not
    export the structured `logger`.  On those versions, the sink now sends
    logs through the SDK's internal log capture function instead.
    [[#233]]
