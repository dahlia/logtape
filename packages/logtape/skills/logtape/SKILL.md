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

Use `logger.getChild("sub")` to derive a child logger without repeating the
full category:

~~~~ typescript
const dbLogger = logger.getChild("database");
// category = ["my-app", "users", "auth", "database"]
~~~~

See <https://logtape.org/manual/categories.md> for details.


Structured messages
-------------------

Use **named placeholders** with a properties object.  This keeps messages
parseable and properties searchable:

~~~~ typescript
// Correct: structured message with named placeholders
logger.info("User {userId} logged in from {ip}", { userId, ip });

// Correct: structured data without a message
logger.info({ userId, ip, action: "login" });

// Nested property access (since 1.2.0)
logger.info("Name: {user.name}", { user: { name: "Alice" } });
~~~~

Template literal syntax is available for quick debug logging but does **not**
produce structured data:

~~~~ typescript
// Template literal: convenient but not structured
logger.debug`User ${userId} logged in`;
~~~~

See <https://logtape.org/manual/struct.md> for full structured logging details.


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

See <https://logtape.org/manual/levels.md> for details.


Configuration
-------------

### Async configuration (most common)

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

### Synchronous configuration

Use `configureSync()` when you cannot use `await` (e.g., top-level in CommonJS,
or in a synchronous startup path):

~~~~ typescript
import { configureSync, getConsoleSink } from "@logtape/logtape";

configureSync({
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

> **Limitation:** `configureSync()` cannot use `AsyncDisposable` sinks such as
> `getStreamSink()` or sinks created with `fromAsyncSink()`.

### Key rules

 -  `configure()` returns a `Promise`; always `await` it.
 -  `configureSync()` returns `void`; do not `await` it.
 -  Call either one **once**.  Calling again without resetting first throws
    `ConfigError`.
 -  Do **not** mix async and sync: if you used `configure()`, reset with
    `await reset()`; if you used `configureSync()`, reset with `resetSync()`.
 -  For tests, call `await reset()` (or `resetSync()`) in teardown.

### Framework-specific patterns

 -  **React**: configure **before** `createRoot()`.
 -  **Vue**: configure **before** `app.mount()`.
 -  **Next.js**: use *instrumentation.js* (server) or
    *instrumentation-client.js* (client).
 -  **SvelteKit**: configure in *hooks.server.ts*.

See <https://logtape.org/manual/config.md> for all options.


Library author rule
-------------------

**Never call `configure()` or `configureSync()` in library code.**  Libraries
should only call `getLogger()` and log messages.  The application that depends
on your library decides how (or whether) to configure sinks and levels.

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

If your library wraps other LogTape-using libraries, use `withCategoryPrefix()`
to nest their logs under your category:

~~~~ typescript
import { withCategoryPrefix } from "@logtape/logtape";

export function myOperation() {
  return withCategoryPrefix(["my-lib"], () => {
    // Logs from inner libraries appear as ["my-lib", ...their-category]
    innerLib.doWork();
  });
}
~~~~

> **Note:** `withCategoryPrefix()` requires `contextLocalStorage` to be
> configured by the application.

See <https://logtape.org/manual/library.md> for the full guide.


Context with `with()` and lazy evaluation
-----------------------------------------

### Adding explicit context

Use `logger.with()` to create a child logger that attaches properties to every
subsequent log call:

~~~~ typescript
const reqLogger = logger.with({ requestId, userId });
reqLogger.info("Processing order {orderId}", { orderId });
// Log record will contain requestId, userId, AND orderId
~~~~

### Implicit context (request tracing)

Use `withContext()` to propagate context across an entire call stack without
threading loggers manually.  Requires `contextLocalStorage` in configuration:

~~~~ typescript
import { configure, getConsoleSink, withContext } from "@logtape/logtape";
import { AsyncLocalStorage } from "node:async_hooks";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: "app", sinks: ["console"] }],
  contextLocalStorage: new AsyncLocalStorage(),
});

function handleRequest(req: Request) {
  withContext({ requestId: crypto.randomUUID() }, () => {
    // All logs inside this callback automatically include requestId
    processRequest(req);
  });
}
~~~~

> **Note:** Implicit contexts are not available in browsers yet.

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

For **async** lazy evaluation, pass an async callback and `await` the result:

~~~~ typescript
await logger.info("User details", async () => ({
  user: await fetchUserDetails(),
}));
~~~~

For multiple expensive log calls, use `isEnabledFor()`:

~~~~ typescript
if (logger.isEnabledFor("debug")) {
  const snapshot = await captureExpensiveSnapshot();
  logger.debug("Snapshot: {data}", { data: snapshot });
}
~~~~

See <https://logtape.org/manual/lazy.md> and
<https://logtape.org/manual/contexts.md> for details.


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


Sinks and formatters
--------------------

### Built-in sinks

~~~~ typescript
import {
  configure,
  getConsoleSink,
  getStreamSink,
} from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
    stderr: getStreamSink(Writable.toWeb(process.stderr)),
  },
  loggers: [{ category: "app", sinks: ["console"] }],
});
~~~~

### Sink filters

Use `withFilter()` to route different levels to different sinks:

~~~~ typescript
import { configure, getConsoleSink, withFilter } from "@logtape/logtape";

await configure({
  sinks: {
    errorsOnly: withFilter(getConsoleSink(), "error"),
    allLevels: getConsoleSink(),
  },
  loggers: [
    { category: "app", sinks: ["allLevels", "errorsOnly"] },
  ],
});
~~~~

### Formatters

~~~~ typescript
import {
  configure,
  getAnsiColorFormatter,
  getConsoleSink,
  getJsonLinesFormatter,
} from "@logtape/logtape";

// Pretty ANSI-colored output for development
getConsoleSink({ formatter: getAnsiColorFormatter() });

// JSON Lines for production / log aggregation
getConsoleSink({ formatter: getJsonLinesFormatter() });
~~~~

For even nicer development output, use `@logtape/pretty`:

~~~~ typescript
import { getPrettyFormatter } from "@logtape/pretty";

getConsoleSink({ formatter: getPrettyFormatter() });
~~~~

### Disposal

Non-blocking sinks and stream sinks hold resources.  In **edge functions** or
short-lived processes, explicitly dispose before exit:

~~~~ typescript
import { dispose } from "@logtape/logtape";

// At shutdown
await dispose();
~~~~

See <https://logtape.org/manual/sinks.md> and
<https://logtape.org/manual/formatters.md> for details.


Data redaction
--------------

Use `@logtape/redaction` to prevent sensitive data from reaching log output.

### Pattern-based redaction (scans formatted text)

Wrap a formatter with `redactByPattern()` to catch data like emails, credit
card numbers, or JWTs anywhere in the log output:

~~~~ typescript
import { defaultConsoleFormatter, getConsoleSink } from "@logtape/logtape";
import {
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  redactByPattern,
} from "@logtape/redaction";

const sink = getConsoleSink({
  formatter: redactByPattern(defaultConsoleFormatter, [
    EMAIL_ADDRESS_PATTERN,
    JWT_PATTERN,
  ]),
});
~~~~

Built-in patterns: `EMAIL_ADDRESS_PATTERN`, `CREDIT_CARD_NUMBER_PATTERN`,
`JWT_PATTERN`, `US_SSN_PATTERN`, `KR_RRN_PATTERN`.

### Field-based redaction (removes/replaces properties by name)

Wrap a sink with `redactByField()` to strip sensitive fields from structured
log data before it reaches the sink:

~~~~ typescript
import { getConsoleSink } from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";

// Uses DEFAULT_REDACT_FIELDS (password, secret, token, etc.)
const sink = redactByField(getConsoleSink());

// Or customize with replacement instead of removal
const sink2 = redactByField(getConsoleSink(), {
  fieldPatterns: [/password/i, /secret/i, /api[-_]?key/i],
  action: () => "[REDACTED]",
});
~~~~

### Combining both for maximum security

~~~~ typescript
const sink = redactByField(
  getConsoleSink({
    formatter: redactByPattern(defaultConsoleFormatter, [
      EMAIL_ADDRESS_PATTERN,
      JWT_PATTERN,
    ]),
  }),
);
~~~~

See <https://logtape.org/manual/redaction.md> for details.


Adaptors for existing loggers
-----------------------------

If the project already uses winston, Pino, or log4js, use an adaptor instead
of `configure()`:

~~~~ typescript
import { install } from "@logtape/adaptor-winston";
import winston from "winston";

const winstonLogger = winston.createLogger({ /* ... */ });
install(winstonLogger);
// All LogTape logs now route through winston
~~~~

Available: `@logtape/adaptor-winston`, `@logtape/adaptor-pino`,
`@logtape/adaptor-log4js`.

See <https://logtape.org/manual/adaptors.md> for details.


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

If using `configureSync()`, reset with `resetSync()`:

~~~~ typescript
import { configureSync, resetSync } from "@logtape/logtape";

configureSync({ /* ... */ });
// ... test ...
resetSync();
~~~~

Always call `reset()` / `resetSync()` in test teardown so that each test can
configure independently.

See <https://logtape.org/manual/testing.md> for more patterns.


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

// Or use the synchronous variant if you can't await
configureSync({ /* ... */ });
~~~~

### Mixing async/sync configure and reset

~~~~ typescript
// WRONG: mismatched pair causes errors
await configure({ /* ... */ });
resetSync();  // Can't sync-reset an async config!

// CORRECT: match configure and reset variants
await configure({ /* ... */ });
await reset();

// Or:
configureSync({ /* ... */ });
resetSync();
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

### Logging sensitive data without redaction

~~~~ typescript
// WRONG: password ends up in log files
logger.info("Login attempt for {email} with {password}", { email, password });

// CORRECT: never log secrets; use @logtape/redaction if needed
logger.info("Login attempt for {email}", { email });
~~~~


Best practices summary
----------------------

 -  One `configure()` or `configureSync()` call at startup
 -  Always `await configure()`; never `await configureSync()`
 -  Match reset variant to configure variant
 -  Hierarchical array categories (e.g., `["app", "module", "sub"]`)
 -  Structured messages with named placeholders, not string interpolation
 -  `lazy()` or callback for expensive computations
 -  `logger.with()` for request-scoped context
 -  `withContext()` + `AsyncLocalStorage` for implicit context propagation
 -  `error`/`fatal` only for real failures
 -  Libraries: never configure, just `getLogger()`
 -  Tests: `reset()` / `resetSync()` in teardown, buffer sink for assertions
 -  Never log sensitive data (passwords, tokens, PII)
 -  Use `dispose()` / `disposeSync()` in edge functions or short-lived
    processes
