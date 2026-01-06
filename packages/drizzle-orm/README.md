<!-- deno-fmt-ignore-file -->

@logtape/drizzle-orm
====================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/drizzle-orm* is a [Drizzle ORM] adapter that allows you to use
[LogTape] as Drizzle's logging backend for database query logging.  This
enables seamless integration between Drizzle ORM applications and LogTape's
structured logging capabilities.

[JSR]: https://jsr.io/@logtape/drizzle-orm
[JSR badge]: https://jsr.io/badges/@logtape/drizzle-orm
[npm]: https://www.npmjs.com/package/@logtape/drizzle-orm
[npm badge]: https://img.shields.io/npm/v/@logtape/drizzle-orm?logo=npm
[LogTape]: https://logtape.org/
[Drizzle ORM]: https://orm.drizzle.team/


Installation
------------

~~~~ sh
deno add jsr:@logtape/drizzle-orm  # for Deno
npm  add     @logtape/drizzle-orm  # for npm
pnpm add     @logtape/drizzle-orm  # for pnpm
yarn add     @logtape/drizzle-orm  # for Yarn
bun  add     @logtape/drizzle-orm  # for Bun
~~~~


Usage
-----

~~~~ typescript
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


Custom category
---------------

You can specify a custom category for the logger:

~~~~ typescript
const db = drizzle(client, {
  logger: getLogger({
    category: ["myapp", "database"],
  }),
});
~~~~


Custom log level
----------------

By default, queries are logged at the `debug` level.  You can change this:

~~~~ typescript
const db = drizzle(client, {
  logger: getLogger({
    level: "info",
  }),
});
~~~~


Structured logging
------------------

The adapter logs queries with structured data that includes:

 -  `formattedQuery`: The query with parameter placeholders (e.g., `$1`, `$2`)
    replaced with actual values for easier reading
 -  `query`: The original query string with placeholders
 -  `params`: The original parameters array

This allows you to:

 -  Get human-readable output with text formatters
 -  Get machine-parseable output with JSON Lines formatter
 -  Use full query and params data with OpenTelemetry, Sentry, and other sinks


Docs
----

The docs of this package is available at
<https://logtape.org/manual/integrations#drizzle-orm>.
For the API references, see <https://jsr.io/@logtape/drizzle-orm/doc>.
