<!-- deno-fmt-ignore-file -->

@logtape/adaptor-log4js
=======================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/adaptor-log4js* is a [LogTape] adapter that forwards log records to
[log4js] loggers, enabling seamless integration between LogTape-enabled
libraries and applications using log4js for logging infrastructure.

[JSR badge]: https://jsr.io/badges/@logtape/adaptor-log4js
[JSR]: https://jsr.io/@logtape/adaptor-log4js
[npm badge]: https://img.shields.io/npm/v/@logtape/adaptor-log4js?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/adaptor-log4js
[LogTape]: https://logtape.org/
[log4js]: https://log4js-node.github.io/log4js-node/


Installation
------------

~~~~ sh
deno add jsr:@logtape/adaptor-log4js  # for Deno
npm  add     @logtape/adaptor-log4js  # for npm
pnpm add     @logtape/adaptor-log4js  # for pnpm
yarn add     @logtape/adaptor-log4js  # for Yarn
bun  add     @logtape/adaptor-log4js  # for Bun
~~~~


Usage
-----

### Quick setup

The simplest way to integrate LogTape with log4js is using the auto-installer:

~~~~ typescript
import log4js from "log4js";

// Configure log4js first
log4js.configure({
  appenders: { out: { type: "stdout" } },
  categories: { default: { appenders: ["out"], level: "info" } }
});

// Simply import to automatically set up the adapter
import "@logtape/adaptor-log4js/install";

// Now all LogTape logs will be routed to log4js
import { getLogger } from "@logtape/logtape";
const logger = getLogger("my-app");
logger.info("This will be logged through log4js");
~~~~

### Using the `install()` function

For more control, use the `install()` function:

~~~~ typescript
import log4js from "log4js";
import { install } from "@logtape/adaptor-log4js";

log4js.configure({
  appenders: { out: { type: "stdout" } },
  categories: { default: { appenders: ["out"], level: "info" } }
});

// With default options (category-based loggers)
install(log4js);

// Or with a custom logger
const customLogger = log4js.getLogger("myapp");
install(log4js, customLogger);

// Or with custom options
install(log4js, undefined, {
  categoryMapper: (cat) => cat.join("::"),
  contextStrategy: "args"
});
~~~~

### Manual configuration

For full control over the log4js integration, configure LogTape manually:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getLog4jsSink } from "@logtape/adaptor-log4js";
import log4js from "log4js";

log4js.configure({
  appenders: { out: { type: "stdout" } },
  categories: { default: { appenders: ["out"], level: "info" } }
});

await configure({
  sinks: {
    log4js: getLog4jsSink(log4js, undefined, {
      categoryMapper: (cat) => cat.join("."),
      contextStrategy: "mdc",
      contextPreservation: "preserve"
    })
  },
  loggers: [
    { category: "my-library", sinks: ["log4js"] }
  ]
});
~~~~


Category mapping
----------------

By default, LogTape categories are mapped to log4js categories using dot
notation. For example, LogTape category `["app", "database", "query"]` becomes
log4js category `"app.database.query"`.

You can customize this behavior using the `categoryMapper` option:

~~~~ typescript
import { getLog4jsSink } from "@logtape/adaptor-log4js";

// Use :: as separator
const sink = getLog4jsSink(log4js, undefined, {
  categoryMapper: (cat) => cat.join("::")
});

// Custom logic
const sink2 = getLog4jsSink(log4js, undefined, {
  categoryMapper: (cat) => {
    if (cat.length === 0) return "default";
    return cat.slice(0, 2).join("."); // Only use first two parts
  }
});
~~~~


Context handling
----------------

The adapter supports two strategies for handling LogTape properties.
The type system ensures that `contextPreservation` can only be used with
the MDC strategy:

### MDC (Mapped Diagnostic Context) strategy (default)

Uses log4js's built-in context feature to add LogTape properties:

~~~~ typescript
const sink = getLog4jsSink(log4js, undefined, {
  contextStrategy: "mdc"
});
~~~~

When using MDC strategy, you can control how existing context is handled:

~~~~ typescript
// Preserve existing context (default)
// LogTape properties are added during logging, then removed
const sink1 = getLog4jsSink(log4js, undefined, {
  contextStrategy: "mdc",
  contextPreservation: "preserve"
});

// Merge with existing context
// LogTape properties are added and left in context
const sink2 = getLog4jsSink(log4js, undefined, {
  contextStrategy: "mdc",
  contextPreservation: "merge"
});

// Replace existing context
// Existing context is cleared before adding LogTape properties
const sink3 = getLog4jsSink(log4js, undefined, {
  contextStrategy: "mdc",
  contextPreservation: "replace"
});
~~~~

### Args strategy

Passes LogTape properties as additional arguments to log methods.
Note that `contextPreservation` is not available with this strategy:

~~~~ typescript
const sink = getLog4jsSink(log4js, undefined, {
  contextStrategy: "args"
  // contextPreservation is not allowed here - TypeScript will error
});
~~~~


Docs
----

See the [API reference] on JSR for further details.

[API reference]: https://jsr.io/@logtape/adaptor-log4js/doc
