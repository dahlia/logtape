---
links:
  '#240': https://github.com/dahlia/logtape/issues/240
  '#248': https://github.com/dahlia/logtape/pull/248
---
 -  Added the `completionLevel` option to `ElysiaLogTapeOptions`, which
    chooses the log level of a completed request's log record from the
    response outcome, for example `"error"` for server errors and
    `"warning"` for slow responses.  Added the `CompletionLevelFunction`
    type, `(ctx, completion) => LogLevel`, and the `RequestCompletion`
    interface, which has the `status`, `responseTime`, and, for the record
    written by the plugin's error hook, the `error`.  The callback also
    chooses that error record's level, which otherwise stays `"error"`,
    without adding another record.  The `level` option still applies to
    `logRequest` logs.  When the callback throws or returns an invalid level,
    the record uses `level`, or `"error"` for the error record; such failures
    are reported to the meta logger and never change the response.
    [[#240], [#248]]
