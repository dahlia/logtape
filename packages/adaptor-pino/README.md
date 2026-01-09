<!-- deno-fmt-ignore-file -->

@logtape/adaptor-pino
=====================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/adaptor-pino* is a [LogTape] adapter that forwards log records to
[Pino] loggers, enabling seamless integration between LogTape-enabled libraries
and applications using Pino for logging infrastructure.

[JSR badge]: https://jsr.io/badges/@logtape/adaptor-pino
[JSR]: https://jsr.io/@logtape/adaptor-pino
[npm badge]: https://img.shields.io/npm/v/@logtape/adaptor-pino?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/adaptor-pino
[LogTape]: https://logtape.org/
[Pino]: https://getpino.io/


Installation
------------

~~~~ sh
deno add jsr:@logtape/adaptor-pino  # for Deno
npm  add     @logtape/adaptor-pino  # for npm
pnpm add     @logtape/adaptor-pino  # for pnpm
yarn add     @logtape/adaptor-pino  # for Yarn
bun  add     @logtape/adaptor-pino  # for Bun
~~~~


Usage
-----

### Using the install() function

The simplest way to integrate LogTape with Pino is to use the `install()`
function:

~~~~ typescript
import pino from "pino";
import { install } from "@logtape/adaptor-pino";

// With a custom Pino logger
const pinoLogger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true
    }
  }
});

install(pinoLogger);

// That's it! All LogTape logs will now be routed to your Pino logger
import { getLogger } from "@logtape/logtape";
const logger = getLogger("my-app");
logger.info("This will be logged through Pino");
~~~~

You can also pass configuration options:

~~~~ typescript
import { install } from "@logtape/adaptor-pino";

// With custom options
install(pinoLogger, {
  category: {
    position: "start",
    decorator: "[]",
    separator: "."
  }
});
~~~~

### Manual configuration

For full control over the Pino integration, configure LogTape manually:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getPinoSink } from "@logtape/adaptor-pino";
import pino from "pino";

const pinoLogger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true
    }
  }
});

await configure({
  sinks: {
    pino: getPinoSink(pinoLogger, {
      category: {
        position: "start",
        decorator: "[]",
        separator: "."
      }
    })
  },
  loggers: [
    { category: "my-library", sinks: ["pino"] }
  ]
});
~~~~


Category formatting
-------------------

The adapter supports flexible category formatting options:

~~~~ typescript
import { getPinoSink } from "@logtape/adaptor-pino";

// Hide categories completely
const sink1 = getPinoSink(logger, { category: false });

// Use default formatting (category with ":" separator)
const sink2 = getPinoSink(logger, { category: true });

// Custom formatting
const sink3 = getPinoSink(logger, {
  category: {
    position: "end",      // "start" or "end"
    decorator: "[]",      // "[]", "()", "<>", "{}", ":", "-", "|", "/", ""
    separator: "::"       // custom separator for multi-part categories
  }
});
~~~~


Docs
----

See the [API reference] on JSR for further details.

[API reference]: https://jsr.io/@logtape/adaptor-pino/doc
