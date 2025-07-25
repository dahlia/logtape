Adapters
========

*This API is available since LogTape 1.0.0.*

LogTape adapters enable seamless integration between LogTape-enabled libraries
and applications using existing logging infrastructure. They bridge the gap
between LogTape's library-friendly design and established logging ecosystems.


Overview
--------

LogTape's zero-dependency, tree-shakable design makes it ideal for library
authors who want to provide logging without imposing dependencies on their
users. However, this creates a practical challenge: when a library uses LogTape
but an application already has an established logging system (like winston,
Pino, or log4js), developers face an integration dilemma.

Adapters solve this by forwarding LogTape log records to existing logging
systems, allowing applications to:

 -  Use LogTape-enabled libraries without changing their logging infrastructure
 -  Maintain consistent log formatting and routing across their entire
    application
 -  Leverage existing log management, monitoring, and alerting systems
 -  Gradually adopt LogTape without requiring a complete migration


When to use adapters
--------------------

### Library integration scenarios

 -  Your application uses winston/Pino/log4js and you want to use a library that
    logs with LogTape
 -  You need all logs to flow through your existing logging pipeline
 -  You have established log formatting, filtering, or routing requirements
 -  You want to maintain consistency with existing operational procedures

### Migration scenarios

 -  Transitioning from another logging library to LogTape incrementally
 -  Testing LogTape compatibility before a full migration
 -  Running LogTape alongside existing loggers during a transition period

### Not recommended when

 -  Starting a new project where you can choose LogTape directly
 -  Your existing logging system has significant performance or
    functionality limitations
 -  You want to take full advantage of LogTape's structured logging capabilities


Pino adapter
------------

*This API is available since LogTape 1.0.0.*

The *@logtape/adaptor-pino* forwards LogTape log records to [Pino] loggers,
preserving structured logging data and providing flexible category formatting:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/adaptor-pino
~~~~

~~~~ sh [npm]
npm add @logtape/adaptor-pino
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/adaptor-pino
~~~~

~~~~ sh [Yarn]
yarn add @logtape/adaptor-pino
~~~~

~~~~ sh [Bun]
bun add @logtape/adaptor-pino
~~~~

:::

[Pino]: https://getpino.io/

### Manual configuration

The adapter provides a `getPinoSink()` function that creates a LogTape sink
that forwards log records to a Pino logger. This allows you to configure LogTape
to use Pino as a sink, enabling LogTape-enabled libraries to log directly to
your existing Pino logger:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getPinoSink } from "@logtape/adaptor-pino";
import { pino } from "pino";

const logger = pino({
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
    pino: getPinoSink(logger, {
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

### Using the [`install()`] function

The [`install()`] function provides a convenient way to automatically configure
LogTape to route all logs to a Pino logger:

~~~~ typescript twoslash
import { pino } from "pino";
import { install } from "@logtape/adaptor-pino";

const pinoLogger = pino({
  level: "info",
  transport: {
    target: "pino-pretty"
  }
});

// Install with custom logger and options
install(pinoLogger, {
  category: {
    position: "start",
    decorator: "[]",
    separator: "."
  }
});

// Now any LogTape-enabled library will log through Pino
import { getLogger } from "@logtape/logtape";
const logger = getLogger("my-app");
logger.info("This will be logged through Pino");
~~~~

[`install()`]: https://jsr.io/@logtape/adaptor-pino/doc/~/install


winston adapter
---------------

*This API is available since LogTape 1.0.0.*

The *@logtape/adaptor-winston* forwards LogTape log records to [winston] loggers,
providing flexible level mapping and category formatting options:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/adaptor-winston
~~~~

~~~~ sh [npm]
npm add @logtape/adaptor-winston
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/adaptor-winston
~~~~

~~~~ sh [Yarn]
yarn add @logtape/adaptor-winston
~~~~

~~~~ sh [Bun]
bun add @logtape/adaptor-winston
~~~~

:::

[winston]: https://github.com/winstonjs/winston

### Quick setup

The simplest way to integrate LogTape with winston is using the auto-installer:

~~~~ typescript twoslash
import "@logtape/adaptor-winston/install";

// All LogTape logs will now be routed to winston's default logger
import { getLogger } from "@logtape/logtape";
const logger = getLogger("my-app");
logger.info("This will be logged through winston");
~~~~

### Manual configuration

For more control, you can configure LogTape to use winston as a sink:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getWinstonSink } from "@logtape/adaptor-winston";
import winston from "winston";

const winstonLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" })
  ]
});

await configure({
  sinks: {
    winston: getWinstonSink(winstonLogger, {
      category: {
        position: "start",
        decorator: "[]",
        separator: "."
      }
    })
  },
  loggers: [
    { category: "my-library", sinks: ["winston"] }
  ]
});
~~~~

### Using the `install()` function

The `install()` function provides a convenient middle ground between automatic
setup and manual configuration:

~~~~ typescript twoslash
import winston from "winston";
import { install } from "@logtape/adaptor-winston";

const customLogger = winston.createLogger({
  transports: [new winston.transports.File({ filename: "app.log" })]
});

// Install with custom logger and options
install(customLogger, {
  category: { position: "start", decorator: "[]" },
  levelsMap: {
    "trace": "silly",
    "debug": "debug",
    "info": "verbose",
    "warning": "info",
    "error": "warn",
    "fatal": "error",
  }
});
~~~~


Planned adapters
----------------

The following adapters are planned for future releases:

log4js adapter (*@logtape/adaptor-log4js*)
:   Integration with log4js for applications using log4j-style logging

bunyan adapter (*@logtape/adaptor-bunyan*)
:   Integration with Bunyan structured logging

To request priority for a specific adapter or contribute an implementation,
please see the [adapter development roadmap] on GitHub.


Best practices
--------------

*Use your existing logger's adapter* when:

 -  You have established logging infrastructure
 -  Your team is familiar with the existing logging system
 -  You need compatibility with existing log processing tools

*Consider migrating to native LogTape* when:

 -  Starting new projects
 -  Your current logging system lacks features you need
 -  You want to simplify dependencies and improve performance


Creating custom adapters
------------------------

If you need an adapter for a logging system not yet supported, you can create
your own by implementing the `Sink` interface:

~~~~ typescript twoslash
/**
 * A hypothetical custom logger library's logging levels.
 */
type CustomLoggerLevel = "verbose" | "debug" | "info" | "warn" | "error" | "critical";

/**
 * A hypothetical custom logger library's logger interface.
 */
type CustomLogger = {
  verbose(message: string, properties?: Record<string, unknown>): void;
  debug(message: string, properties?: Record<string, unknown>): void;
  info(message: string, properties?: Record<string, unknown>): void;
  warn(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
  critical(message: string, properties?: Record<string, unknown>): void;
}
// ---cut-before---
import type { LogLevel, LogRecord, Sink } from "@logtape/logtape";

export function getCustomLoggerSink(customLogger: CustomLogger): Sink {
  return (record: LogRecord) => {
    // Map LogTape levels to your logger's levels
    const level = mapLogLevel(record.level);

    // Format the message (handle LogTape's template system)
    const message = formatMessage(record.message);

    // Forward to your logging system
    customLogger[level](message, record.properties);
  };
}

function mapLogLevel(logTapeLevel: LogLevel): CustomLoggerLevel {
  switch (logTapeLevel) {
    case "trace": return "verbose";
    case "debug": return "debug";
    case "info": return "info";
    case "warning": return "warn";
    case "error": return "error";
    case "fatal": return "critical";
    default: return "info";
  }
}

function formatMessage(messageParts: readonly (string | unknown)[]): string {
  let result = "";
  for (let i = 0; i < messageParts.length; i += 2) {
    result += messageParts[i];
    if (i + 1 < messageParts.length) {
      // Handle interpolated values appropriately for your logger
      result += JSON.stringify(messageParts[i + 1]);
    }
  }
  return result;
}
~~~~

### Contribution guidelines

When creating adapters for popular logging libraries:

 1. *Follow naming conventions*: Use `@logtape/adaptor-{library-name}`
 2. *Implement comprehensive tests*: Cover level mapping, category formatting,
    and error scenarios
 3. *Provide TypeScript definitions*: Ensure full type safety
 4. *Document thoroughly*: Include usage examples and configuration options
 5. *Consider performance*: Minimize overhead in the adaptation layer

See the [*@logtape/adaptor-pino* source code] as a reference implementation.

[adapter development roadmap]: https://github.com/dahlia/logtape/issues/52
[*@logtape/adaptor-pino* source code]: https://github.com/dahlia/logtape/tree/main/adaptor-pino
