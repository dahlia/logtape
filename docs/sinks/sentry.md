Sentry sink
===========

If you are using [Sentry] for error monitoring, you can use the Sentry sink to
send log messages to Sentry using *@logtape/sentry* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/sentry
~~~~

~~~~ sh [npm]
npm add @logtape/sentry
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/sentry
~~~~

~~~~ sh [Yarn]
yarn add @logtape/sentry
~~~~

~~~~ sh [Bun]
bun add @logtape/sentry
~~~~

:::

> [!NOTE]
> For Deno, you need both `@sentry/deno` and `@sentry/core` at the same version
> (e.g., both at `9.41.0`) due to Sentry's exact version pinning.

[Sentry]: https://sentry.io/


Basic usage
-----------

The quickest way to get started is to use `getSentrySink()` without any
arguments:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

await configure({
  sinks: {
    sentry: getSentrySink(),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

By default, only `error` and `fatal` level logs are captured as Sentry events.


Using your Sentry SDK namespace
-------------------------------

*This feature is available since LogTape 2.2.0.*

If your application initializes Sentry through a framework SDK such as
`@sentry/nextjs` or `@sentry/react-native`, pass the same namespace object to
`getSentrySink()`:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/nextjs";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

await configure({
  sinks: {
    sentry: getSentrySink({ sentry: Sentry }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

This ensures LogTape uses the same Sentry module instance for captures, active
spans, isolation scopes, and structured logs. It is useful in monorepos or
multi-platform apps where package resolution can install multiple
`@sentry/core` versions.


Trace correlation
-----------------

*This feature is available since LogTape 1.3.0.*

When using Sentry's performance monitoring, logs automatically correlate with
active traces and spans. This happens with zero configuration:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { getLogger } from "@logtape/logtape";

const logger = getLogger("app");

Sentry.startSpan({ name: "process-order" }, () => {
  logger.info("Processing order", { orderId: 123 });
  // Log automatically includes trace_id and span_id
});
~~~~

The trace context (`trace_id`, `span_id`, `parent_span_id`) is automatically
captured from active Sentry spans and included in all logs, breadcrumbs, and
events.


Breadcrumbs
-----------

*This feature is available since LogTape 1.3.0.*

You can enable breadcrumbs to create a debugging context trail that shows what
happened before errors:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

await configure({
  sinks: {
    sentry: getSentrySink({
      breadcrumbs: true,
    }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "info" },
  ],
});
~~~~

When enabled, non-error log levels become breadcrumbs in Sentry, providing
complete context for debugging.  Use LogTape's `lowestLevel` to control which
logs reach the sink.

You can also configure which levels become breadcrumbs:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

await configure({
  sinks: {
    sentry: getSentrySink({
      breadcrumbs: {
        level: "info",
        maxLevel: "warning",
      },
    }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

The old `enableBreadcrumbs` option is still supported, but it is deprecated.
Use `breadcrumbs: true` instead.

![LogTape records show up in the breadcrumbs of a Sentry issue.](../screenshots/sentry.png)


Structured logging
------------------

*This feature is available since LogTape 1.3.0 (requires Sentry SDK 9.41.0+).*

Send structured, searchable logs using Sentry's Logs API:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Sentry SDK 9.41.0 through 10.x only; remove this line on SDK 11+,
  // which no longer has this option:
  enableLogs: true,
});

await configure({
  sinks: {
    sentry: getSentrySink(),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

The sink automatically detects when the Logs API is available (SDK 9.41.0+)
and uses it for structured logging. Without the Logs API, the sink can still
send error events and add breadcrumbs according to their own settings.

To keep `error` and `fatal` records in Sentry Logs without sending them to
Sentry Issues, set `events: false` in `getSentrySink()`. See
[Event capture](#event-capture) for the options and their effect on routing.

Whether the Logs API actually captures logs is up to the Sentry SDK.  Sentry
SDK 9.41.0 through 10.x capture them only when `enableLogs: true` is passed to
`Sentry.init()`.  Sentry SDK 11.0.0 captures them without it, and since it
removed the `enableLogs` option, passing it there fails type checking.

Use the `logs.level` option to set the minimum level sent through Sentry's Logs
API:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true,  // Remove this line on Sentry SDK 11+
});

await configure({
  sinks: {
    sentry: getSentrySink({
      logs: { level: "warning" },
      breadcrumbs: { level: "trace", maxLevel: "info" },
    }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "trace" },
  ],
});
~~~~

This sends `warning` and higher records to Sentry's Logs API while keeping lower
levels as breadcrumbs for later error reports.


Routing logs and breadcrumbs by level
-------------------------------------

*This feature is available since LogTape 2.3.0.*

Sometimes you may want verbose records to appear only as breadcrumbs, while
sending higher-level records to Sentry's Logs API.  Do not use `withFilter()`
for this case, because it filters records before they reach the Sentry sink and
therefore prevents them from becoming breadcrumbs.

Configure the sink-level `logs` and `breadcrumbs` options instead:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true,  // Remove this line on Sentry SDK 11+
});

await configure({
  sinks: {
    sentry: getSentrySink({
      logs: { level: "warning" },
      breadcrumbs: { maxLevel: "info" },
    }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "trace" },
  ],
});
~~~~

In this configuration, `trace`, `debug`, and `info` records become breadcrumbs.
`warning`, `error`, and `fatal` records are sent through Sentry's Logs API.
By default, `error` and `fatal` records also go to Sentry Issues. The `events`
option controls that output independently.


Filtering and transformation
----------------------------

*This feature is available since LogTape 1.3.0.*

You can use `beforeSend` to filter or transform log records before they are
sent to Sentry:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

await configure({
  sinks: {
    sentry: getSentrySink({
      beforeSend: (record) => {
        // Filter out debug logs
        if (record.level === "debug") return null;

        // Redact sensitive data
        if (record.properties.password) {
          return {
            ...record,
            properties: { ...record.properties, password: "[REDACTED]" }
          };
        }

        return record;
      },
    }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "debug" },
  ],
});
~~~~

Returning `null` from `beforeSend` drops the log record entirely, including
structured logs, events, and breadcrumbs.  Use `logs.level` and `breadcrumbs`
when you only need level-based routing between Sentry outputs.


Event capture
-------------

*This feature is available since LogTape 1.3.0.*

By default, the sink sends `error` and `fatal` logs as error events to Sentry
Issues. If the log contains
an `Error` instance in its `error` property or Pino-style `err` property,
`captureException` is used for better stack traces. Otherwise,
`captureMessage` is used:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-app"]);

// Sends an exception event with a stack trace (uses captureException)
logger.error("Database connection failed", { error: new Error("timeout") });
logger.error("Job failed", { err: new Error("timeout") });

// Sends a message event (uses captureMessage)
logger.error("User not found: {userId}", { userId: 123 });

// Does not send an error event (goes to structured logs and/or breadcrumbs)
logger.info("Request received", { path: "/api/users" });
~~~~

*The `events` option is available since LogTape 2.5.0.*

Set `events: false` to turn off both kinds of error event. To turn off only
exception events, set `events: { exceptions: false }`:

~~~~ typescript
// Keep Sentry Logs, but do not send any error events from this sink.
getSentrySink({ events: false });

// Keep message events, but do not send exception events from this sink.
getSentrySink({ events: { exceptions: false } });
~~~~

The second setting skips records that would have gone to `captureException()`;
it does not send them through `captureMessage()` instead. Neither setting
changes Logs routing, adds breadcrumbs for suppressed error events, or affects
errors captured outside this sink. If the Logs API is unavailable, the SDK is
not configured to capture logs, or `logs.level` excludes a record, a record
whose error event is suppressed will not be sent to Sentry by this sink.

You can customize which property names are checked for an `Error` instance with
the `errorPropertyNames` option. Names are checked in order, and the first
matching `Error` determines whether the record takes the exception path:

~~~~ typescript twoslash
// @noErrors: 2305 2307
import * as Sentry from "@sentry/node";
import { configure } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

await configure({
  sinks: {
    sentry: getSentrySink({
      errorPropertyNames: ["exception", "error", "err"],
    }),
  },
  loggers: [
    { category: [], sinks: ["sentry"], lowestLevel: "error" },
  ],
});
~~~~

All logs are sent to Sentry's structured logging by default when the Logs API
is enabled.  Non-error logs can become breadcrumbs when `breadcrumbs` is
enabled, providing full context when errors occur.

For more details, see the `getSentrySink()` function and `SentrySinkOptions`
interface in the API reference.
