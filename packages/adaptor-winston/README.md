<!-- deno-fmt-ignore-file -->

@logtape/adaptor-winston
========================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/adaptor-winston* is a [LogTape] adapter that forwards log records to
[winston] loggers, enabling seamless integration between LogTape-enabled
libraries and applications using winston for logging infrastructure.

[JSR badge]: https://jsr.io/badges/@logtape/adaptor-winston
[JSR]: https://jsr.io/@logtape/adaptor-winston
[npm badge]: https://img.shields.io/npm/v/@logtape/adaptor-winston?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/adaptor-winston
[LogTape]: https://logtape.org/
[winston]: https://github.com/winstonjs/winston


Installation
------------

~~~~ sh
deno add jsr:@logtape/adaptor-winston  # for Deno
npm  add     @logtape/adaptor-winston  # for npm
pnpm add     @logtape/adaptor-winston  # for pnpm
yarn add     @logtape/adaptor-winston  # for Yarn
bun  add     @logtape/adaptor-winston  # for Bun
~~~~


Quick start
-----------

The simplest way to integrate LogTape with winston is to import the
auto-installer:

~~~~ typescript
import "@logtape/adaptor-winston/install";

// That's it! All LogTape logs will now be routed to winston's default logger
import { getLogger } from "@logtape/logtape";
const logger = getLogger("my-app");
logger.info("This will be logged through winston");
~~~~

You can also use it with Node.js's `-r` flag:

~~~~ sh
node -r @logtape/adaptor-winston/install app.js
~~~~

For custom winston loggers or configuration options, see the [Usage](#usage)
section below.


Usage
-----

### Using the `install()` function

If you need a custom winston logger or configuration options, you can use
the `install()` function:

~~~~ typescript
import winston from "winston";
import { install } from "@logtape/adaptor-winston";

// With a custom winston logger
const customLogger = winston.createLogger({
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

install(customLogger);
~~~~

You can also pass configuration options:

~~~~ typescript
import { install } from "@logtape/adaptor-winston";

// With default winston logger but custom options
install({
  category: {
    position: "start",
    decorator: "[]",
    separator: "."
  }
});

// Or with both custom logger and options
install(customLogger, {
  category: { position: "start", decorator: "[]" }
});
~~~~

### Manual configuration

For full control over the winston integration, configure LogTape manually:

~~~~ typescript
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


Level mapping
-------------

LogTape log levels are mapped to winston levels as follows:

| LogTape Level | winston Level |
| ------------- | ------------- |
| `trace`       | `silly`       |
| `debug`       | `debug`       |
| `info`        | `info`        |
| `warning`     | `warn`        |
| `error`       | `error`       |
| `fatal`       | `error`       |

You can customize this mapping:

~~~~ typescript
import { install } from "@logtape/adaptor-winston";

install({
  levelsMap: {
    "trace": "debug",  // Map trace to debug instead of silly
    "debug": "debug",
    "info": "info",
    "warning": "warn",
    "error": "error",
    "fatal": "error"
  }
});
~~~~


Category formatting
-------------------

The adapter supports flexible category formatting options:

~~~~ typescript
import { install } from "@logtape/adaptor-winston";

// Hide categories completely
install({ category: false });

// Use default formatting (category with ":" separator)
install({ category: true });

// Custom formatting
install({
  category: {
    position: "end",      // "start" or "end"
    decorator: "[]",      // "[]", "()", "<>", "{}", ":", "-", "|", "/", ""
    separator: "::"       // custom separator for multi-part categories
  }
});
~~~~


Value formatting
----------------

Customize how interpolated values are formatted in log messages:

~~~~ typescript
import { install } from "@logtape/adaptor-winston";

install({
  valueFormatter: (value) => JSON.stringify(value, null, 2)
});
~~~~


Docs
----

See the [API reference] on JSR for further details.

[API reference]: https://jsr.io/@logtape/adaptor-winston/doc
