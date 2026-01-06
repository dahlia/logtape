<!-- deno-fmt-ignore-file -->

@logtape/elysia
===============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package provides an [Elysia] plugin for HTTP request logging using
[LogTape] as the backend.

[JSR]: https://jsr.io/@logtape/elysia
[JSR badge]: https://jsr.io/badges/@logtape/elysia
[npm]: https://www.npmjs.com/package/@logtape/elysia
[npm badge]: https://img.shields.io/npm/v/@logtape/elysia?logo=npm
[Elysia]: https://elysiajs.com/
[LogTape]: https://logtape.org/


Installation
------------

~~~~ sh
deno add jsr:@logtape/elysia  # for Deno
npm  add     @logtape/elysia  # for npm
pnpm add     @logtape/elysia  # for pnpm
yarn add     @logtape/elysia  # for Yarn
bun  add     @logtape/elysia  # for Bun
~~~~


Usage
-----

~~~~ typescript
import { Elysia } from "elysia";
import { configure, getConsoleSink } from "@logtape/logtape";
import { elysiaLogger } from "@logtape/elysia";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["elysia"], sinks: ["console"], lowestLevel: "info" }
  ],
});

const app = new Elysia()
  .use(elysiaLogger())
  .get("/", () => ({ hello: "world" }))
  .listen(3000);

console.log(`Server running at ${app.server?.url}`);
~~~~


Options
-------

The `elysiaLogger()` function accepts an optional options object:

~~~~ typescript
app.use(elysiaLogger({
  category: ["myapp", "http"],  // Custom category (default: ["elysia"])
  level: "debug",                // Log level (default: "info")
  format: "dev",                 // Predefined format (default: "combined")
  skip: (ctx) => ctx.path === "/health",  // Skip logging for specific paths
  logRequest: true,              // Log at request start (default: false)
  scope: "global",               // Plugin scope (default: "global")
}));
~~~~


Plugin scope
------------

Elysia supports plugin scoping to control how lifecycle hooks propagate:

 -  `"global"`: Hooks apply to all routes in the application (default)
 -  `"scoped"`: Hooks apply to the parent instance where the plugin is used
 -  `"local"`: Hooks only apply within the plugin itself


Predefined formats
------------------

The plugin supports Morgan-compatible predefined formats:

 -  `"combined"`: Apache Combined Log Format with all properties (default)
 -  `"common"`: Apache Common Log Format (without referrer/userAgent)
 -  `"dev"`: Concise output for development (e.g., `GET /path 200 1.234 ms - 123`)
 -  `"short"`: Shorter format with remote address
 -  `"tiny"`: Minimal output


Custom format function
----------------------

You can also provide a custom format function:

~~~~ typescript
app.use(elysiaLogger({
  format: (ctx, responseTime) => ({
    method: ctx.request.method,
    path: ctx.path,
    status: ctx.set.status,
    duration: responseTime,
  }),
}));
~~~~


Error logging
-------------

The plugin automatically logs errors at the error level using Elysia's
`onError` hook.  Error logs include the error message and error code
in addition to standard request properties.


Structured logging output
-------------------------

When using the `"combined"` format (default), the plugin logs structured
data that includes:

 -  `method`: HTTP request method
 -  `url`: Request URL
 -  `path`: Request path
 -  `status`: HTTP response status code
 -  `responseTime`: Response time in milliseconds
 -  `contentLength`: Response content-length header value
 -  `remoteAddr`: Remote client address (from X-Forwarded-For header)
 -  `userAgent`: User-Agent header value
 -  `referrer`: Referrer header value


See also
--------

For more information, see the [LogTape documentation][LogTape].
