
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
    { category: "my-app", level: "debug", sinks: ["console"] }
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


How to log
----------

There are total 5 log levels: `debug`, `info`, `warning`, `error`, `fatal` (in
the order of verbosity).  You can log messages with the following syntax:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger([]);
const value = 0 as unknown;
// ---cut-before---
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
