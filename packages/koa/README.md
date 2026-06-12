<!-- deno-fmt-ignore-file -->

@logtape/koa: Koa adapter for LogTape
=====================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package provides [Koa] middleware for HTTP request logging using [LogTape]
as the backend. It serves as an alternative to [koa-logger] with structured
logging support.

[JSR badge]: https://jsr.io/badges/@logtape/koa
[JSR]: https://jsr.io/@logtape/koa
[npm badge]: https://img.shields.io/npm/v/@logtape/koa?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/koa
[Koa]: https://koajs.com/
[LogTape]: https://logtape.org/
[koa-logger]: https://github.com/koajs/logger


Installation
------------

~~~~ sh
deno add jsr:@logtape/koa  # Deno
npm add @logtape/koa       # npm
pnpm add @logtape/koa      # pnpm
yarn add @logtape/koa      # Yarn
bun add @logtape/koa       # Bun
~~~~


Usage
-----

~~~~ typescript
import Koa from "koa";
import { configure, getConsoleSink } from "@logtape/logtape";
import { koaLogger } from "@logtape/koa";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["koa"], sinks: ["console"], lowestLevel: "info" }
  ],
});

const app = new Koa();

// Basic usage - should be used near the top of middleware stack
app.use(koaLogger());

app.use((ctx) => {
  ctx.body = { hello: "world" };
});

app.listen(3000);
~~~~


Options
-------

~~~~ typescript
app.use(koaLogger({
  category: ["myapp", "http"],  // Custom category (default: ["koa"])
  level: "debug",                // Log level (default: "info")
  format: "dev",                 // Predefined format (default: "combined")
  skip: (ctx) => ctx.path === "/health",  // Skip health check endpoint
  logRequest: false,             // Log after response (default: false)
  context: true,                 // Add requestId to request-scoped logs
}));
~~~~


Request context
---------------

Set `context: true` to add request-scoped correlation fields.  By default,
the middleware reads the `x-request-id` request header, generates an ID when
the header is missing, writes the resolved ID to the `x-request-id` response
header, and adds `requestId` to the request log record.

To make logs emitted by your route handlers inherit the same `requestId`, also
configure LogTape with `contextLocalStorage`:

~~~~ typescript
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  // ... sinks and loggers ...
  contextLocalStorage: new AsyncLocalStorage(),
});

app.use(koaLogger({ context: true }));
~~~~

The context is still established when `skip` suppresses the request log, so
application logs inside the skipped request can keep the same request ID.

You can customize request ID headers and add more request fields:

~~~~ typescript
app.use(koaLogger({
  context: {
    requestId: {
      headerNames: ["x-correlation-id", "x-request-id"],
      responseHeader: "x-request-id",
    },
    include: ["requestId", "method", "path", "remoteAddr"],
    enrich: (ctx) => ({ route: ctx.path }),
  },
}));
~~~~


Predefined formats
------------------

 -  `"combined"` - Apache Combined Log Format with all properties (default)
 -  `"common"` - Apache Common Log Format (without referrer/userAgent)
 -  `"dev"` - Concise output for development
 -  `"short"` - Shorter format with remote address
 -  `"tiny"` - Minimal output


Custom format
-------------

~~~~ typescript
app.use(koaLogger({
  format: (ctx, responseTime) => ({
    method: ctx.method,
    path: ctx.path,
    status: ctx.status,
    duration: responseTime,
  }),
}));
~~~~


License
-------

Distributed under the MIT License.  See the *LICENSE* file for details.
