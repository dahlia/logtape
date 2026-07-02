<!-- deno-fmt-ignore-file -->

@logtape/graphql-yoga
=====================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/graphql-yoga* is a [GraphQL Yoga] logger adapter that allows you to
use [LogTape] as Yoga's logging backend.  This routes Yoga's internal debug,
info, warning, and error logs through LogTape's structured logging system.

[JSR badge]: https://jsr.io/badges/@logtape/graphql-yoga
[JSR]: https://jsr.io/@logtape/graphql-yoga
[npm badge]: https://img.shields.io/npm/v/@logtape/graphql-yoga?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/graphql-yoga
[GraphQL Yoga]: https://the-guild.dev/graphql/yoga-server
[LogTape]: https://logtape.org/


Installation
------------

~~~~ sh
deno add jsr:@logtape/graphql-yoga  # for Deno
npm  add     @logtape/graphql-yoga  # for npm
pnpm add     @logtape/graphql-yoga  # for pnpm
yarn add     @logtape/graphql-yoga  # for Yarn
bun  add     @logtape/graphql-yoga  # for Bun
~~~~


Usage
-----

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";
import { getYogaLogger } from "@logtape/graphql-yoga";
import { createSchema, createYoga } from "graphql-yoga";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["graphql-yoga"], sinks: ["console"], lowestLevel: "debug" }
  ],
});

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String!
      }
    `,
    resolvers: {
      Query: {
        hello: () => "world",
      },
    },
  }),
  logging: getYogaLogger(),
});
~~~~


Custom category
---------------

You can specify a custom category for the logger:

~~~~ typescript
const yoga = createYoga({
  schema,
  logging: getYogaLogger({
    category: ["myapp", "graphql"],
  }),
});
~~~~


Custom log levels
-----------------

Yoga exposes `debug`, `info`, `warn`, and `error` logger methods.  By default,
these map to LogTape's `debug`, `info`, `warning`, and `error` levels.  You can
customize the mapping:

~~~~ typescript
const yoga = createYoga({
  schema,
  logging: getYogaLogger({
    levelsMap: {
      debug: "trace",
      warn: "error",
    },
  }),
});
~~~~


Docs
----

The docs of this package is available at
<https://logtape.org/manual/integrations#graphql-yoga>.
For the API references, see <https://jsr.io/@logtape/graphql-yoga/doc>.
