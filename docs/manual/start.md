Quick start
===========

Setting up
----------

Set up LogTape in the entry point of your application using `configure()`:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: "my-app", lowestLevel: "debug", sinks: ["console"] }
  ]
});
~~~~

> [!WARNING]
> If you are composing a library, you should not set up LogTape in the library
> itself.  It is up to the application to set up LogTape.
>
> See also [*Using in libraries*](./library.md).

And then you can use LogTape in your application or library:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-app", "my-module"]);

export function myFunc(value: number): void {
  logger.debug `Hello, ${value}!`;
}
~~~~

For detailed information, see [*Configuration*](./config.md).


Already using another logging library?
--------------------------------------

*This API is available since LogTape 1.0.0.*

If your application already uses an existing logging library (winston, Pino,
log4js, etc.) and you want to use LogTape-enabled libraries without completely
migrating your logging setup, LogTape adapters provide a seamless solution.

Adapters allow you to:

 -  Use LogTape-enabled libraries with your existing logging infrastructure
 -  Maintain consistent log formatting and routing across your application
 -  Gradually migrate to LogTape without disrupting your current setup
 -  Leverage your existing log management and monitoring systems

Instead of configuring LogTape directly, you can use an adapter to forward
all LogTape logs to your existing logger:

~~~~ typescript twoslash
// @noErrors
import { install } from "@logtape/adaptor-winston";  // or @logtape/adaptor-pino
import winston from "winston";

const logger = winston.createLogger({
  // your existing winston configuration
});

// That's it! All LogTape logs will now route through winston
install(logger);
~~~~

For detailed information about available adapters and configuration options,
see [*Adapters* section](./adaptors.md).


How to log
----------

There are total 6 log levels: `trace`, `debug`, `info`, `warning`, `error`,
`fatal` (in the order of verbosity).  You can log messages with the following
syntax:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger([]);
const value = 0 as unknown;
// ---cut-before---
logger.trace `This is a trace message with ${value}.`;
logger.debug `This is a debug message with ${value}.`;
logger.info  `This is an info message with ${value}.`;
logger.warn  `This is a warning message with ${value}.`;
logger.error `This is an error message with ${value}.`;
logger.fatal `This is a fatal message with ${value}.`;
~~~~

### Structured logging

You can also log messages with a function call.  In this case, log messages
are structured data:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger([]);
const value = 0 as unknown;
// ---cut-before---
logger.trace("This is a trace message with {value}.", { value });
logger.debug("This is a debug message with {value}.", { value });
logger.info("This is an info message with {value}.", { value });
logger.warn("This is a warning message with {value}.", { value });
logger.error("This is an error message with {value}.", { value });
logger.fatal("This is a fatal message with {value}.", { value });
~~~~

For detailed information, see [*Structured logging*](./struct.md).

### Lazy evaluation

Sometimes, values to be logged are expensive to compute.  In such cases, you
can use a function to defer the computation so that it is only computed when
the log message is actually logged:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger([]);
/**
 * A hypothetical function that computes a value, which is expensive.
 * @returns The computed value.
 */
function computeValue(): unknown { return 0; }
// ---cut-before---
logger.debug(l => l`This is a debug message with ${computeValue()}.`);
logger.debug("Or you can use a function call: {value}.", () => {
  return { value: computeValue() };
});
~~~~

### Checking if a level is enabled

*This API is available since LogTape 1.4.0.*

For async operations, lazy evaluation callbacks cannot be used because they
must return synchronously.  In such cases, you can use the `isEnabledFor()`
method to check if a log level is enabled before performing expensive async
computations:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger([]);
/**
 * A hypothetical async function that is expensive.
 * @returns The computed value.
 */
async function expensiveAsync(): Promise<unknown> { return 0; }
// ---cut-before---
if (logger.isEnabledFor("debug")) {
  const value = await expensiveAsync();
  logger.debug("Async result: {value}", { value });
}
~~~~

This method checks both the logger's `lowestLevel` and whether any sinks are
configured to receive logs at that level.
