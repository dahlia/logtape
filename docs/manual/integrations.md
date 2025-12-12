Third-party integrations
========================

This guide shows how to integrate LogTape with popular web frameworks, ORMs,
and other third-party libraries for unified logging across different
JavaScript environments.


Drizzle ORM
-----------

[Drizzle ORM] is a lightweight, TypeScript-first ORM that supports PostgreSQL,
MySQL, and SQLite.  LogTape provides a Drizzle ORM adapter through the
*@logtape/drizzle-orm* package, allowing you to use LogTape as Drizzle's
logging backend for database query logging:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/drizzle-orm
~~~~

~~~~ sh [npm]
npm add @logtape/drizzle-orm
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/drizzle-orm
~~~~

~~~~ sh [Yarn]
yarn add @logtape/drizzle-orm
~~~~

~~~~ sh [Bun]
bun add @logtape/drizzle-orm
~~~~

:::

Here's an example of using LogTape with Drizzle ORM:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
import { getLogger } from "@logtape/drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["drizzle-orm"], sinks: ["console"], lowestLevel: "debug" }
  ],
});

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, {
  logger: getLogger(),
});

// Now all database queries will be logged through LogTape
~~~~

#### Custom category

You can specify a custom category for the logger:

~~~~ typescript twoslash
import { getLogger } from "@logtape/drizzle-orm";
// ---cut-before---
const logger = getLogger({
  category: ["myapp", "database"],
});
~~~~

#### Custom log level

By default, queries are logged at the `debug` level.  You can change this:

~~~~ typescript twoslash
import { getLogger } from "@logtape/drizzle-orm";
// ---cut-before---
const logger = getLogger({
  level: "info",
});
~~~~

#### Structured logging output

The adapter logs queries with structured data that includes:

- `formattedQuery`: The query with parameter placeholders (e.g., `$1`, `$2`)
  replaced with actual values for easier reading
- `query`: The original query string with placeholders
- `params`: The original parameters array

This allows you to:

- Get human-readable output with text formatters
- Get machine-parseable output with JSON Lines formatter
- Use full query and params data with OpenTelemetry, Sentry, and other sinks

[Drizzle ORM]: https://orm.drizzle.team/


Express
-------

[Express] is the most popular Node.js web framework.  LogTape provides
an Express middleware adapter through the *@logtape/express* package,
which provides HTTP request logging using LogTape as the backend,
as an alternative to [Morgan]:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/express
~~~~

~~~~ sh [npm]
npm add @logtape/express
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/express
~~~~

~~~~ sh [Yarn]
yarn add @logtape/express
~~~~

~~~~ sh [Bun]
bun add @logtape/express
~~~~

:::

Here's an example of using LogTape with Express:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
import { expressLogger } from "@logtape/express";
import express from "express";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["express"], sinks: ["console"], lowestLevel: "info" }
  ],
});

const app = express();
app.use(expressLogger());

app.get("/", (req, res) => {
  res.json({ hello: "world" });
});

app.listen(3000);
~~~~

### Custom category

You can specify a custom category for the logger:

~~~~ typescript twoslash
import { expressLogger } from "@logtape/express";
// ---cut-before---
const middleware = expressLogger({
  category: ["myapp", "http"],
});
~~~~

### Options

The middleware accepts the following options:

~~~~ typescript twoslash
import { expressLogger } from "@logtape/express";
// ---cut-before---
const middleware = expressLogger({
  category: ["myapp", "http"],  // Custom category (default: ["express"])
  level: "debug",                // Log level (default: "info")
  format: "dev",                 // Predefined format (default: "combined")
  skip: (req, res) => res.statusCode < 400,  // Skip successful requests
  immediate: false,              // Log after response (default: false)
});
~~~~

### Predefined formats

The middleware supports Morgan-compatible predefined formats:

- `"combined"`: Apache Combined Log Format with all properties (default)
- `"common"`: Apache Common Log Format (without referrer/userAgent)
- `"dev"`: Concise output for development (e.g., `GET /path 200 1.234 ms - 123`)
- `"short"`: Shorter format with remote address
- `"tiny"`: Minimal output

### Custom format function

You can also provide a custom format function that returns either a string
or an object with structured properties:

~~~~ typescript twoslash
import { expressLogger } from "@logtape/express";
// ---cut-before---
const middleware = expressLogger({
  format: (req, res, responseTime) => ({
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration: responseTime,
  }),
});
~~~~

### Structured logging output

When using the `"combined"` format (default), the middleware logs structured
data that includes:

- `method`: HTTP request method
- `url`: Request URL
- `status`: HTTP response status code
- `responseTime`: Response time in milliseconds
- `contentLength`: Response content-length header value
- `remoteAddr`: Remote client address
- `userAgent`: User-Agent header value
- `referrer`: Referrer header value
- `httpVersion`: HTTP version (e.g., `"1.1"`)

[Express]: https://expressjs.com/
[Morgan]: https://github.com/expressjs/morgan


Hono
----

[Hono] is a modern web framework that works across multiple JavaScript runtimes.
Here's how to integrate LogTape:

~~~~ typescript twoslash
import {
  configure,
  getConsoleSink,
  getLogger,
  withContext,
} from "@logtape/logtape";
import { Hono } from "hono";
import { AsyncLocalStorage } from "node:async_hooks";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["hono"], sinks: ["console"], lowestLevel: "info" }
  ],
  contextLocalStorage: new AsyncLocalStorage(),
});

const app = new Hono();
const logger = getLogger(["hono"]);

// Request logging middleware
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  await withContext({
    requestId,
    method: c.req.method,
    url: c.req.url,
    userAgent: c.req.header("User-Agent"),
    ipAddress: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")
  }, async () => {
    logger.info("Request started", {
      method: c.req.method,
      url: c.req.url,
      requestId
    });

    await next();

    const duration = Date.now() - startTime;
    logger.info("Request completed", {
      status: c.res.status,
      duration,
      requestId
    });
  });
});

// Error handling middleware
app.onError((err, c) => {
  logger.error("Request error", {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    },
    method: c.req.method,
    url: c.req.url
  });

  return c.json({ error: "Internal server error" }, 500);
});

// Routes
app.get("/", (c) => {
  return c.json({ message: "Hello from Hono!" });
});

// Works in Deno, Node.js, Bun, Cloudflare Workers, etc.
export default app;
~~~~

[Hono]: https://hono.dev/


Fastify
-------

[Fastify] is a fast and low-overhead web framework for Node.js.
LogTape provides a [Pino]-compatible logger adapter through the
*@logtape/fastify* package, allowing you to use LogTape as Fastify's
logging backend with seamless integration:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/fastify
~~~~

~~~~ sh [npm]
npm add @logtape/fastify
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/fastify
~~~~

~~~~ sh [Yarn]
yarn add @logtape/fastify
~~~~

~~~~ sh [Bun]
bun add @logtape/fastify
~~~~

:::

Here's an example of using LogTape with Fastify:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
import { getLogTapeFastifyLogger } from "@logtape/fastify";
import Fastify from "fastify";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["fastify"], sinks: ["console"], lowestLevel: "info" }
  ],
});

const fastify = Fastify({
  loggerInstance: getLogTapeFastifyLogger(),
});

fastify.get("/", async (request, reply) => {
  // Uses LogTape under the hood with request context
  request.log.info("Handling request");
  return { hello: "world" };
});

await fastify.listen({ port: 3000 });
~~~~

### Custom category

You can specify a custom category for the logger:

~~~~ typescript twoslash
import { getLogTapeFastifyLogger } from "@logtape/fastify";
// ---cut-before---
const logger = getLogTapeFastifyLogger({
  category: ["myapp", "http"],
});
~~~~

### Child loggers

Fastify automatically creates child loggers with request-scoped bindings
(like `reqId`). These bindings are passed to LogTape's structured logging:

~~~~ typescript twoslash
import Fastify from "fastify";
import { getLogTapeFastifyLogger } from "@logtape/fastify";
// ---cut-before---
const fastify = Fastify({
  loggerInstance: getLogTapeFastifyLogger(),
});

fastify.get("/users/:id", async (request, reply) => {
  // Child logger automatically includes reqId and any additional bindings
  request.log.info({ userId: request.params }, "Fetching user");
  return { user: "data" };
});
~~~~

### Pino method signatures

The adapter supports all Pino-style logging signatures:

~~~~ typescript twoslash
import { getLogTapeFastifyLogger } from "@logtape/fastify";
const logger = getLogTapeFastifyLogger();
// ---cut-before---
// Simple message
logger.info("Hello world");

// Printf-style interpolation
logger.info("User %s logged in %d times", "alice", 3);

// Object with message
logger.info({ userId: 123, action: "login" }, "User logged in");

// Object with msg property
logger.info({ msg: "User logged in", userId: 123 });

// Object only
logger.info({ data: { key: "value" } });
~~~~

[Fastify]: https://fastify.dev/
[Pino]: https://getpino.io/


Koa
---

[Koa] uses async/await throughout and works well with LogTape's context system:

~~~~ typescript twoslash
import {
  configure,
  getConsoleSink,
  getLogger,
  withContext,
} from "@logtape/logtape";
import Koa from "koa";
import { AsyncLocalStorage } from "node:async_hooks";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["koa"], sinks: ["console"], lowestLevel: "info" }
  ],
  contextLocalStorage: new AsyncLocalStorage(),
});

const app = new Koa();
const logger = getLogger(["koa"]);

// Request logging middleware
app.use(async (ctx, next) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  await withContext({
    requestId,
    method: ctx.method,
    url: ctx.url,
    userAgent: ctx.get("User-Agent"),
    ipAddress: ctx.ip
  }, async () => {
    logger.info("Request started", {
      method: ctx.method,
      url: ctx.url,
      requestId
    });

    try {
      await next();

      const duration = Date.now() - startTime;
      logger.info("Request completed", {
        status: ctx.status,
        duration,
        requestId
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Request error", {
        error: {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        },
        status: ctx.status,
        duration,
        requestId
      });

      throw error; // Re-throw for Koa's error handling
    }
  });
});

// Routes
app.use(async (ctx) => {
  ctx.body = { message: "Hello from Koa!" };
});

app.listen(3000, () => {
  logger.info("Koa server started", { port: 3000 });
});
~~~~

[Koa]: https://koajs.com/


SvelteKit
---------

[SvelteKit] can use LogTape in both server-side hooks and API routes.
Use hooks for global request logging:

~~~~ typescript [src/hooks.server.ts] twoslash
import {
  configure,
  getConsoleSink,
  getLogger,
  withContext,
} from "@logtape/logtape";
import type { Handle } from "@sveltejs/kit";
import { AsyncLocalStorage } from "node:async_hooks";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["sveltekit"], sinks: ["console"], lowestLevel: "info" }
  ],
  contextLocalStorage: new AsyncLocalStorage(),
});

const logger = getLogger(["sveltekit"]);

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  return await withContext({
    requestId,
    method: event.request.method,
    url: event.url.pathname,
    userAgent: event.request.headers.get("user-agent")
  }, async () => {
    logger.info("Request started", {
      method: event.request.method,
      url: event.url.pathname,
      requestId
    });

    try {
      const response = await resolve(event);

      const duration = Date.now() - startTime;
      logger.info("Request completed", {
        status: response.status,
        duration,
        requestId
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Request error", {
        error: {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error)
        },
        duration,
        requestId
      });

      throw error;
    }
  });
};
~~~~

And in individual API routes:

~~~~ typescript [src/routes/api/users/+server.ts] twoslash
import { getLogger } from "@logtape/logtape";
import { json, type RequestHandler } from "@sveltejs/kit";

const logger = getLogger(["sveltekit", "api"]);

export const GET: RequestHandler = async ({ request }) => {
  logger.info("Users API called");

  try {
    const users = await getUsers();

    logger.info("Users retrieved successfully", {
      count: users.length
    });

    return json(users);
  } catch (error) {
    logger.error("Failed to retrieve users", {
      error: error instanceof Error ? error.message : String(error)
    });

    return json({ error: "Internal server error" }, { status: 500 });
  }
};

async function getUsers(): Promise<any[]> {
  return [];
}
~~~~

[SvelteKit]: https://svelte.dev/docs/kit


Third-party log integration
---------------------------

*This API is available since LogTape 1.1.0.*

When integrating logs from external systems, you may want to preserve their
original timestamps and metadata. LogTape provides the `Logger.emit()` method
for this purpose, giving you full control over log record fields.

### Basic usage

The `Logger.emit()` method accepts a log record without the category field:

~~~~ typescript twoslash
const externalLog = {
  id: "evt-12345",
  timestamp: 1712345678901, // Original event timestamp
  level: "info", // External log level
  message: "External system event",
  // Additional metadata from the external system
  metadata: {
    userId: "user-67890",
    operation: "data-sync"
  }
};
// ---cut-before---
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-app", "external"]);

// Forward external log with preserved timestamp
logger.emit({
  timestamp: externalLog.timestamp,
  level: "info",
  message: ["External system event"],
  rawMessage: "External system event",
  properties: {
    source: "external-service",
    eventId: externalLog.id,
  },
});
~~~~


Best practices
--------------

 1. *Request ID correlation*: Always generate and use request IDs to correlate
    logs across your application:

    ~~~~ typescript
    const requestId = crypto.randomUUID(); // Preferred method
    // For environments without crypto.randomUUID():
    const requestId = Math.random().toString(36).substring(2, 11);
    ~~~~

 2. *Context management*: Use [`withContext()`](./contexts.md#implicit-contexts)
    to automatically include request metadata in all logs within the request
    scope.

 3. *Error handling*: Always log errors with structured information including
    exception object and request context.

 4. *Performance monitoring*: Log request duration and response sizes to monitor
    application performance.

 5. *Security considerations*: Be careful not to log sensitive information like
    passwords, tokens, or personal data.
    Use the [*@logtape/redaction*](./redaction.md) package for data sanitization
    patterns.

 6. *Environment-specific configuration*: Configure different log levels and
    sinks for development vs production environments to balance verbosity with
    performance.
