---
links:
  '#240': https://github.com/dahlia/logtape/issues/240
  '#248': https://github.com/dahlia/logtape/pull/248
---
 -  Added the `completionLevel` option to `ExpressLogTapeOptions`, which
    chooses the log level of a completed request's log record from the
    response outcome, for example `"error"` for server errors and
    `"warning"` for slow responses.  Added the `CompletionLevelFunction`
    type, `(req, res, completion) => LogLevel`, and the `RequestCompletion`
    interface, which has the final `status` and `responseTime`.  The `level`
    option still applies to `immediate` logs, and is used when the callback
    throws or returns an invalid level; such failures are reported to
    the meta logger and never change the response.  [[#240], [#248]]
