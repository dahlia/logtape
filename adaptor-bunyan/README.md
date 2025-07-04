<!-- deno-fmt-ignore-file -->

@logtape/adaptor-bunyan
=======================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/adaptor-bunyan* is a [LogTape] adapter that forwards log records to
[Bunyan] loggers, enabling seamless integration between LogTape-enabled libraries
and applications using Bunyan for logging infrastructure.

[JSR]: https://jsr.io/@logtape/adaptor-bunyan
[JSR badge]: https://jsr.io/badges/@logtape/adaptor-bunyan
[npm]: https://www.npmjs.com/package/@logtape/adaptor-bunyan
[npm badge]: https://img.shields.io/npm/v/@logtape/adaptor-bunyan?logo=npm
[LogTape]: https://logtape.org/
[Bunyan]: https://github.com/trentm/node-bunyan


Installation
------------

~~~~ sh
deno add jsr:@logtape/adaptor-bunyan  # for Deno
npm  add     @logtape/adaptor-bunyan  # for npm
pnpm add     @logtape/adaptor-bunyan  # for pnpm
yarn add     @logtape/adaptor-bunyan  # for Yarn
bun  add     @logtape/adaptor-bunyan  # for Bun
~~~~


Usage
-----

### Using the install() function

The simplest way to integrate LogTape with Bunyan is to use the `install()` function:

~~~~ typescript
import bunyan from "bunyan";
import { install } from "@logtape/adaptor-bunyan";

// With a custom Bunyan logger
const bunyanLogger = bunyan.createLogger({ name: "my-app" });

install(bunyanLogger);

// That's it! All LogTape logs will now be routed to your Bunyan logger
import { getLogger } from "@logtape/logtape";
const logger = getLogger("my-app");
logger.info("This will be logged through Bunyan");
~~~~

You can also pass configuration options:

~~~~ typescript
import { install } from "@logtape/adaptor-bunyan";

// With custom options
install(bunyanLogger, {
  category: {
    position: "start",
    decorator: "[]",
    separator: "."
  }
});
~~~~

### Manual configuration

For full control over the Bunyan integration, configure LogTape manually:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getBunyanSink } from "@logtape/adaptor-bunyan";
import bunyan from "bunyan";

const bunyanLogger = bunyan.createLogger({ name: "my-app" });

await configure({
  sinks: {
    bunyan: getBunyanSink(bunyanLogger, {
      category: {
        position: "start",
        decorator: "[]",
        separator: "."
      }
    })
  },
  loggers: [
    { category: "my-library", sinks: ["bunyan"] }
  ]
});
~~~~


Category formatting
-------------------

The adapter supports flexible category formatting options:

~~~~typescript
import { getBunyanSink } from "@logtape/adaptor-bunyan";

// Hide categories completely
const sink1 = getBunyanSink(logger, { category: false });

// Use default formatting (category with ":" separator)
const sink2 = getBunyanSink(logger, { category: true });

// Custom formatting
const sink3 = getBunyanSink(logger, {
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

[API reference]: https://jsr.io/@logtape/adaptor-bunyan/doc 
