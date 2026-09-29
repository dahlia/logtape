---
links:
  '#230': https://github.com/dahlia/logtape/issues/230
  '#231': https://github.com/dahlia/logtape/pull/231
---
 -  Fixed response body failures and process crashes when `honoLogger()` was
    used with GraphQL Yoga responses.  Stream forwarding failures now cancel
    the source and finalize request logging without causing unhandled
    rejections.
    [[#230], [#231]]
