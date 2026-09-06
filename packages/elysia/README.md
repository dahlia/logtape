<!-- deno-fmt-ignore-file -->

@logtape/elysia
===============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package provides an [Elysia] plugin for HTTP request logging using
[LogTape] as the backend.

[JSR badge]: https://jsr.io/badges/@logtape/elysia
[JSR]: https://jsr.io/@logtape/elysia
[npm badge]: https://img.shields.io/npm/v/@logtape/elysia?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/elysia
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


Compatibility
-------------

Since LogTape 2.4.0, this adapter supports Elysia 1.4 and Elysia 2 starting
with *2.0.0-beta.12*.  Elysia 2 is still in beta.  The `elysiaLogger()` options
are the same for both versions; application routes and hooks use the native
API of the installed Elysia version.

The application and adapter must resolve the same Elysia package copy and
module format.  Use ESM throughout or CommonJS throughout, including imported
child plugins.  Local request context relies on Elysia 2's internal hook and
route representation, which the compatibility tests check against the pinned
beta version.

When using `scope: "local"` with request context enabled, the adapter registers
an internal macro in Elysia 2.  Elysia 2 rejects adding macros to the parent app
from an async plugin function after `await`.  Register the logger before that
`await`, or return a separate logger plugin for Elysia to merge:

~~~~ typescript
const app = new Elysia().use(async () => {
  await initializeDatabase();
  return elysiaLogger({ scope: "local", context: true })
    .get("/", () => "Hello");
});
~~~~

Do not use `return app.use(elysiaLogger(...))` after `await` inside
`.use(async (app) => { ... })` with these options.  Returning the separate
plugin lets Elysia merge it in its ordered async plugin queue.  This restriction
does not affect `await` inside request handlers.

For Elysia 2 on Deno, add these overrides to your *deno.json* `imports` map,
alongside the LogTape imports.  The exact npm specifiers also redirect the
adapter's JSR dependencies, so the application and adapter share Elysia:

~~~~ json
{
  "imports": {
    "elysia": "npm:elysia@2.0.0-beta.12",
    "npm:elysia@^1.4.0": "npm:elysia@2.0.0-beta.12",
    "npm:elysia@^1.4.0/utils": "npm:elysia@2.0.0-beta.12/utils"
  }
}
~~~~

Keep all three mappings on the same Elysia version when upgrading.


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
  context: true,                 // Add requestId to request-scoped logs
}));
~~~~


Request context
---------------

Set `context: true` to add request-scoped correlation fields.  By default,
the plugin reads the `x-request-id` request header, generates an ID when the
header is missing, writes the resolved ID to the `x-request-id` response
header, and adds `requestId` to request and error log records.

To make logs emitted by your route handlers inherit the same `requestId`, also
configure LogTape with `contextLocalStorage`:

~~~~ typescript
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  // ... sinks and loggers ...
  contextLocalStorage: new AsyncLocalStorage(),
});

new Elysia()
  .use(elysiaLogger({ context: true }))
  .get("/", () => ({ hello: "world" }));
~~~~

The context is still established when `skip` suppresses the request log, so
application logs inside the skipped request can keep the same request ID.

You can customize request ID headers and add more request fields:

~~~~ typescript
app.use(elysiaLogger({
  context: {
    requestId: {
      headerNames: ["x-correlation-id", "x-request-id"],
      responseHeader: "x-request-id",
    },
    include: ["requestId", "method", "path", "userAgent"],
    enrich: (ctx) => ({ route: ctx.path }),
  },
}));
~~~~


Plugin scope
------------

Elysia supports plugin scoping to control how lifecycle hooks propagate:

 -  `"global"`: Hooks apply to all routes in the application (default)
 -  `"scoped"`: Hooks apply to the parent instance where the plugin is used
    (Elysia 2 calls this scope `"plugin"`)
 -  `"local"`: Hooks only apply within the plugin itself


Predefined formats
------------------

The plugin supports structured presets and text presets:

 -  `"structured-combined"`: Structured request properties (default)
 -  `"structured-common"`: Structured request properties without
    `referrer`/`userAgent`
 -  `"combined"`: Deprecated alias for `"structured-combined"`
 -  `"common"`: Deprecated alias for `"structured-common"`
 -  `"morgan-combined"`: Morgan-compatible Apache combined access log output
 -  `"morgan-common"`: Morgan-compatible Apache common access log output
 -  `"dev"`: Concise output for development (e.g.,
    `GET /path 200 1.234 ms - 123`)
 -  `"short"`: Shorter format with URL
 -  `"tiny"`: Minimal output

Elysia does not expose socket-level fields consistently across runtimes.  The
Morgan-compatible text formats use `X-Forwarded-For` for the remote address and
render unavailable fields, such as the HTTP version, as `-`.


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
`onError` hook in Elysia 1 or `error` hook in Elysia 2.  Error logs include
`errorMessage` in addition to standard request properties.  `errorCode` is
Elysia 1's context code, or Elysia 2's `error.code` when it is a string or
number; it is omitted when Elysia 2 supplies no code.


Structured logging output
-------------------------

When using the `"structured-combined"` format (default), the plugin logs
structured data that includes:

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
