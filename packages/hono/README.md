<!-- deno-fmt-ignore-file -->

@logtape/hono
=============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package provides [Hono] middleware for HTTP request logging using
[LogTape] as the backend, as an alternative to Hono's built-in logger
middleware.

[JSR badge]: https://jsr.io/badges/@logtape/hono
[JSR]: https://jsr.io/@logtape/hono
[npm badge]: https://img.shields.io/npm/v/@logtape/hono?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/hono
[Hono]: https://hono.dev/
[LogTape]: https://logtape.org/


Installation
------------

~~~~ sh
deno add jsr:@logtape/hono  # for Deno
npm  add     @logtape/hono  # for npm
pnpm add     @logtape/hono  # for pnpm
yarn add     @logtape/hono  # for Yarn
bun  add     @logtape/hono  # for Bun
~~~~


Usage
-----

~~~~ typescript
import { Hono } from "hono";
import { configure, getConsoleSink } from "@logtape/logtape";
import { honoLogger } from "@logtape/hono";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["hono"], sinks: ["console"], lowestLevel: "info" }
  ],
});

const app = new Hono();
app.use(honoLogger());

app.get("/", (c) => c.json({ hello: "world" }));

export default app;
~~~~


Options
-------

The `honoLogger()` function accepts an optional options object:

~~~~ typescript
app.use(honoLogger({
  category: ["myapp", "http"],  // Custom category (default: ["hono"])
  level: "debug",                // Log level (default: "info")
  format: "dev",                 // Predefined format (default: "combined")
  skip: (c) => c.req.path === "/health",  // Skip logging for specific paths
  logRequest: true,              // Log at request start (default: false)
}));
~~~~


Streamed responses
------------------

With the default `logRequest: false`, the access log is written when the
response body stream completes, errors, or is cancelled, so `responseTime`
covers the whole stream.  Register `honoLogger()` before any middleware that
may replace `c.res` after the chain returns, and make sure the response body
is consumed as a real HTTP server does; a `Response` whose body is dropped
without being read or cancelled is never logged.  Responses with a null or
already-locked body, and `HEAD` responses, are logged immediately.  Because
the body is wrapped, responses are sent as streams rather than with
runtime-generated `Content-Length` framing.


Predefined formats
------------------

The middleware supports Morgan-compatible predefined formats:

 -  `"combined"`: Apache Combined Log Format with all properties (default)
 -  `"common"`: Apache Common Log Format (without referrer/userAgent)
 -  `"dev"`: Concise output for development (e.g., `GET /path 200 1.234 ms - 123`)
 -  `"short"`: Shorter format with remote address
 -  `"tiny"`: Minimal output


Custom format function
----------------------

You can also provide a custom format function:

~~~~ typescript
app.use(honoLogger({
  format: (c, responseTime) => ({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration: responseTime,
  }),
}));
~~~~


Structured logging output
-------------------------

When using the `"combined"` format (default), the middleware logs structured
data that includes:

 -  `method`: HTTP request method
 -  `url`: Request URL
 -  `path`: Request path
 -  `status`: HTTP response status code
 -  `responseTime`: Response time in milliseconds
 -  `contentLength`: Response content-length header value
 -  `userAgent`: User-Agent header value
 -  `referrer`: Referrer header value


See also
--------

For more information, see the [LogTape documentation][LogTape].
