<!-- deno-fmt-ignore-file -->

@logtape/fastify
================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/fastify* is a [Pino]-compatible logger adapter that allows you to use
[LogTape] as [Fastify]'s logging backend.  This enables seamless integration
between Fastify applications and LogTape's structured logging capabilities.

[JSR]: https://jsr.io/@logtape/fastify
[JSR badge]: https://jsr.io/badges/@logtape/fastify
[npm]: https://www.npmjs.com/package/@logtape/fastify
[npm badge]: https://img.shields.io/npm/v/@logtape/fastify?logo=npm
[LogTape]: https://logtape.org/
[Fastify]: https://fastify.dev/
[Pino]: https://getpino.io/


Installation
------------

~~~~ sh
deno add jsr:@logtape/fastify  # for Deno
npm  add     @logtape/fastify  # for npm
pnpm add     @logtape/fastify  # for pnpm
yarn add     @logtape/fastify  # for Yarn
bun  add     @logtape/fastify  # for Bun
~~~~


Usage
-----

~~~~ typescript
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
  request.log.info("Handling request");
  return { hello: "world" };
});

await fastify.listen({ port: 3000 });
~~~~


Custom category
---------------

You can specify a custom category for the logger:

~~~~ typescript
const fastify = Fastify({
  loggerInstance: getLogTapeFastifyLogger({
    category: ["myapp", "http"],
  }),
});
~~~~


Docs
----

The docs of this package is available at
<https://logtape.org/manual/integrations#fastify>.
For the API references, see <https://jsr.io/@logtape/fastify/doc>.
