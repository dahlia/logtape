---
links:
  '#219': https://github.com/dahlia/logtape/issues/219
  '#223': https://github.com/dahlia/logtape/pull/223
---
 -  Fixed `honoLogger()` reporting the response time before the response body
    stream had completed, which made streamed responses (e.g. from
    `streamText()`) look much faster than they were.  The middleware now logs
    when the body stream finishes, errors, or is cancelled, while preserving
    the implicit context that was active when the request finished.  Because
    the response body is now wrapped, a streamed response is only logged if
    the body is consumed (as a real HTTP server does), and responses are sent
    as streams rather than with runtime-generated `Content-Length` framing.
    Responses with a null or already-locked body, and `HEAD` responses, are
    logged immediately as before.
    [[#219], [#223]]
