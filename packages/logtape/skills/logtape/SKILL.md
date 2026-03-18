---
name: logtape
description: >
  Use this skill when writing any code that uses LogTape for logging in
  JavaScript or TypeScript.  Covers getting loggers, the structured message
  syntax, configuration, library author rules, context, lazy evaluation,
  testing, and common mistakes to avoid.  Trigger whenever the user is
  adding logging to a project, debugging log output, or integrating LogTape
  with a framework.
license: MIT
---

LogTape skill for AI coding assistants
======================================

LogTape is a zero-dependency, library-first logging framework for JavaScript
and TypeScript that works across Deno, Node.js, Bun, browsers, and edge
functions.

Full documentation: <https://logtape.org/>


Getting a logger
----------------

Always use `getLogger()` with an **array** category to enable hierarchical
filtering.  The hierarchy works like a path: a parent category's configuration
applies to all children.

~~~~ typescript
import { getLogger } from "@logtape/logtape";

// Good: array form enables hierarchical filtering
const logger = getLogger(["my-app", "users", "auth"]);

// Acceptable shorthand for a single-segment category
const rootLogger = getLogger("my-app");
~~~~

Choose category segments that reflect your module structure so that operators
can selectively enable/disable logging per subsystem.

See <https://logtape.org/manual/categories> for details.


Structured messages
-------------------

Use **named placeholders** with a properties object.  This keeps messages
parseable and properties searchable:

~~~~ typescript
// Correct: structured message with named placeholders
logger.info("User {userId} logged in from {ip}", { userId, ip });

// Correct: structured data without a message
logger.info({ userId, ip, action: "login" });
~~~~

Template literal syntax is available for quick debug logging but does **not**
produce structured data:

~~~~ typescript
// Template literal: convenient but not structured
logger.debug`User ${userId} logged in`;
~~~~

See <https://logtape.org/manual/struct> for full structured logging details.


Severity levels
---------------

LogTape provides six levels, from most to least verbose:

| Level     | Use for                                               |
| --------- | ----------------------------------------------------- |
| `trace`   | Very fine-grained diagnostic output                   |
| `debug`   | Developer-facing diagnostic messages                  |
| `info`    | Normal operational events (startup, shutdown, etc.)   |
| `warning` | Unexpected but recoverable situations                 |
| `error`   | Errors that affect a single operation                 |
| `fatal`   | Unrecoverable errors that require process termination |

Use the lowest appropriate level.  Reserve `error`/`fatal` for actual failures;
avoid using them for expected conditions like validation errors.

See <https://logtape.org/manual/levels> for details.


Configuration
-------------

`configure()` is **application-only**.  It must be `await`ed and called
**exactly once** at startup (e.g., in your entry point):

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: "my-app",
      lowestLevel: "debug",
      sinks: ["console"],
    },
  ],
});
~~~~

Key rules:

 -  Always `await` the call; it returns a `Promise`.
 -  Call it once.  Calling it again without `await reset()` first throws.
 -  For tests, call `await reset()` in teardown to allow reconfiguration.

See <https://logtape.org/manual/config> for all options.


Library author rule
-------------------

**Never call `configure()` in library code.**  Libraries should only call
`getLogger()` and log messages.  The application that depends on your library
decides how (or whether) to configure sinks and levels.

~~~~ typescript
// my-lib/src/client.ts — library code
import { getLogger } from "@logtape/logtape";

// Good: just get a logger, don't configure
const logger = getLogger(["my-lib", "client"]);

export function fetchData(url: string) {
  logger.debug("Fetching {url}", { url });
  // ...
}
~~~~

See <https://logtape.org/manual/library> for the full guide.


Context with `with()` and lazy evaluation
-----------------------------------------

### Adding context

Use `logger.with()` to create a child logger that attaches properties to every
subsequent log call:

~~~~ typescript
const reqLogger = logger.with({ requestId, userId });
reqLogger.info("Processing order {orderId}", { orderId });
// Log record will contain requestId, userId, AND orderId
~~~~

### Lazy evaluation

Wrap expensive computations with `lazy()` so they only run when the level is
enabled:

~~~~ typescript
import { getLogger, lazy } from "@logtape/logtape";

const logger = getLogger(["my-app"]);
logger.debug("System state: {state}", {
  state: lazy(() => JSON.stringify(getExpensiveState())),
});
~~~~

For structured data, pass a callback as the second argument:

~~~~ typescript
logger.debug("Diagnostics", () => ({
  heap: process.memoryUsage().heapUsed,
  uptime: process.uptime(),
}));
~~~~

See <https://logtape.org/manual/lazy> and
<https://logtape.org/manual/contexts> for details.


Logging errors
--------------

Pass `Error` objects directly to `error()` or `fatal()`.  You can attach
extra properties as a second argument:

~~~~ typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error(error, { operation: "riskyOperation", userId });
}
~~~~


Testing
-------

For tests, configure a buffer sink and assert on collected records:

~~~~ typescript
import { configure, getLogger, reset, type LogRecord } from "@logtape/logtape";

const buffer: LogRecord[] = [];

await configure({
  sinks: { buffer: buffer.push.bind(buffer) },
  loggers: [{ category: "test", sinks: ["buffer"] }],
});

const logger = getLogger(["test"]);
logger.info("hello");

// Assert
assert(buffer.length === 1);
assert(buffer[0].level === "info");

await reset();
~~~~

Always call `await reset()` in test teardown so that each test can call
`configure()` independently.

See <https://logtape.org/manual/testing> for more patterns.


Available packages
------------------

### Sink packages

| Package                     | Description            |
| --------------------------- | ---------------------- |
| `@logtape/file`             | File and rotating file |
| `@logtape/otel`             | OpenTelemetry          |
| `@logtape/sentry`           | Sentry                 |
| `@logtape/syslog`           | Syslog                 |
| `@logtape/cloudwatch-logs`  | AWS CloudWatch Logs    |
| `@logtape/windows-eventlog` | Windows Event Log      |

### Framework integrations

| Package                | Description               |
| ---------------------- | ------------------------- |
| `@logtape/express`     | Express HTTP logging      |
| `@logtape/fastify`     | Fastify HTTP logging      |
| `@logtape/hono`        | Hono HTTP logging         |
| `@logtape/koa`         | Koa HTTP logging          |
| `@logtape/elysia`      | Elysia HTTP logging       |
| `@logtape/drizzle-orm` | Drizzle ORM query logging |

### Formatters

| Package              | Description              |
| -------------------- | ------------------------ |
| `@logtape/pretty`    | Pretty console formatter |
| `@logtape/redaction` | Sensitive data redaction |

### Adaptors (for existing loggers)

| Package                    | Description           |
| -------------------------- | --------------------- |
| `@logtape/adaptor-pino`    | Pino compatibility    |
| `@logtape/adaptor-winston` | Winston compatibility |
| `@logtape/adaptor-log4js`  | log4js compatibility  |


Common mistakes
---------------

### Using template literals for structured data

~~~~ typescript
// WRONG: template literals don't produce structured data
logger.info`User ${userId} performed ${action}`;

// CORRECT: use placeholders for structured, searchable logs
logger.info("User {userId} performed {action}", { userId, action });
~~~~

### String concatenation

~~~~ typescript
// WRONG: loses structure, always evaluates
logger.info("User " + userId + " logged in from " + ip);

// CORRECT
logger.info("User {userId} logged in from {ip}", { userId, ip });
~~~~

### Calling `configure()` in library code

~~~~ typescript
// WRONG: library must never configure LogTape
import { configure } from "@logtape/logtape";
await configure({ /* ... */ });  // Don't do this in a library!

// CORRECT: just use getLogger()
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-lib"]);
~~~~

### Forgetting to `await configure()`

~~~~ typescript
// WRONG: configure() returns a Promise; without await, logging may
// not work when you expect it to
configure({ /* ... */ });

// CORRECT
await configure({ /* ... */ });
~~~~

### Using `console.log` alongside LogTape

~~~~ typescript
// WRONG: bypasses LogTape's filtering, formatting, and routing
console.log("User logged in:", userId);

// CORRECT: use the logger so the message goes through configured sinks
logger.info("User {userId} logged in", { userId });
~~~~

### Flat categories

~~~~ typescript
// WRONG: single flat string prevents granular filtering
const logger = getLogger("myapp");

// CORRECT: hierarchical array enables per-module control
const logger = getLogger(["myapp", "auth", "oauth"]);
~~~~


Best practices summary
----------------------

 -  One `configure()` call at startup, always `await`ed
 -  Hierarchical array categories (e.g., `["app", "module", "sub"]`)
 -  Structured messages with named placeholders, not string interpolation
 -  `lazy()` or callback for expensive computations
 -  `logger.with()` for request-scoped context
 -  `error`/`fatal` only for real failures
 -  Libraries: never `configure()`, just `getLogger()`
 -  Tests: `reset()` in teardown, buffer sink for assertions
