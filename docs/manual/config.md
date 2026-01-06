Configuration
=============

> [!WARNING]
> If you are authoring a library, you should not set up LogTape in the library
> itself.  It is up to the application to set up LogTape.
>
> See also [*Using in libraries*](./library.md).

Setting up LogTape for your application is a crucial step in implementing
effective logging.  The `configure()` function is your main tool for this task.
Let's explore how to use it to tailor LogTape to your specific needs.

At its core, configuring LogTape involves three main components:

 -  [*Sinks*](./sinks.md): Where your logs will be sent
 -  [*Filters*](./filters.md): Rules for which logs should be processed
 -  *Loggers*: The logging instances for different parts of your application

Here's a simple configuration to get you started:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: "my-app",
      lowestLevel: "info",
      sinks: ["console"],
    },
  ],
});
~~~~

This setup will log all `"info"` level and above messages from the `["my-app"]`
&nbsp;[category](./categories.md) to the console.

> [!TIP]
> Want to avoid the `await`?  Check out the
> [*Synchronous configuration*](#synchronous-configuration) section.


Crafting your configuration
---------------------------

> [!NOTE]
> The `configure()` is an asynchronous function.  Always use `await` or handle
> the returned `Promise` appropriately.


### Setting up sinks

[Sinks](./sinks.md) determine where your logs end up. You can have multiple
sinks for different purposes:

~~~~ typescript twoslash
// @noErrors: 2345
import { getFileSink } from "@logtape/file";
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
    file: getFileSink("app.log"),
    errorFile: getFileSink("error.log"),
  },
  // ... rest of configuration
});
~~~~

### Defining filters

[Filters](./filters.md) allow you to fine-tune which logs are processed. They
can be based on log levels, content, or custom logic:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure } from "@logtape/logtape";
// ---cut-before---
await configure({
  // ... sinks configuration
  filters: {
    noDebug(record) {
      return record.level !== "debug";
    },
    onlyErrors(record) {
      return record.level === "error" || record.level === "fatal";
    },
    containsUserData(record) {
      return record.message.some(
        part => typeof part === "string" && part.includes("user")
      );
    },
  },
  // ... loggers configuration
});
~~~~

### Configuring loggers

Loggers are where you bring everything together.  You can set up different
loggers for different parts of your application:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure } from "@logtape/logtape";
// ---cut-before---
await configure({
  // ... sinks and filters configuration
  loggers: [
    {
      category: "my-app",
      lowestLevel: "info",
      sinks: ["console", "file"],
    },
    {
      category: ["my-app", "database"],
      lowestLevel: "debug",
      sinks: ["file"],
      filters: ["noDebug"],
    },
    {
      category: ["my-app", "user-service"],
      lowestLevel: "info",
      sinks: ["console", "file"],
      filters: ["containsUserData"],
    },
  ],
});
~~~~

For severity levels,
see [*Configuring severity levels*](./levels.md#configuring-severity-levels).

> [!NOTE]
> By default, loggers inherit the sinks of their ascendants.  You can override
> them by specifying the `parentSinks: "override"` option in the logger.

> [!WARNING]
> Defining loggers with the same category is disallowed.  If there are
> duplicate categories, LogTape will throw a `ConfigError` when you call
> `configure()`.

### Disposal of resources

If sinks or filters implement the `Disposal` or `AsyncDisposal` interface,
they will be properly disposed when
[resetting the configuration](#reconfiguration) or when the application exits.


Advanced configuration techniques
---------------------------------

### Using environment variables

It's often useful to change your logging configuration based on the environment.
Here's how you might do that:

::: code-group

~~~~ typescript{1,6,11-12} twoslash [Deno]
import { getFileSink } from "@logtape/file";
import { configure, getConsoleSink } from "@logtape/logtape";
// ---cut-before---
const isDevelopment = process.env.NODE_ENV === "development";

await configure({
  sinks: {
    console: getConsoleSink(),
    file: getFileSink(isDevelopment ? "dev.log" : "prod.log"),
  },
  loggers: [
    {
      category: "my-app",
      lowestLevel: isDevelopment ? "trace" : "info",
      sinks: isDevelopment ? ["console", "file"] : ["file"],
    },
  ],
});
~~~~

~~~~ typescript{1,6,11-12} twoslash [Node.js]
import "@types/node";
import process from "node:process";
import { getFileSink } from "@logtape/file";
import { configure, getConsoleSink } from "@logtape/logtape";
// ---cut-before---
const isDevelopment = process.env.NODE_ENV === "development";

await configure({
  sinks: {
    console: getConsoleSink(),
    file: getFileSink(isDevelopment ? "dev.log" : "prod.log"),
  },
  loggers: [
    {
      category: "my-app",
      lowestLevel: isDevelopment ? "trace" : "info",
      sinks: isDevelopment ? ["console", "file"] : ["file"],
    },
  ],
});
~~~~

:::

### Reconfiguration

Remember that calling `configure()` with `reset: true` option will reset any
existing configuration.  If you need to change the configuration at runtime,
you can call `configure()` again with `reset: true` and the new settings:

~~~~ typescript twoslash
import { type Config, configure } from "@logtape/logtape";
const initialConfig = {} as unknown as Config<string, string>;
// ---cut-before---
// Initial configuration
await configure(initialConfig);

// Later in your application...
await configure({
  reset: true,
  ...initialConfig,
  loggers: [
    ...initialConfig.loggers,
    {
      category: "new-feature",
      lowestLevel: "debug",
      sinks: ["console"],
    },
  ],
});
~~~~

Or you can explicitly call `reset()` to clear the existing configuration:

~~~~ typescript twoslash
import { type Config } from "@logtape/logtape";
const initialConfig = {} as unknown as Config<string, string>;
// ---cut-before---
import { configure, reset } from "@logtape/logtape";

await configure(initialConfig);

// Later in your application...

reset();
~~~~


Synchronous configuration
-------------------------

*This API is available since LogTape 0.9.0.*

If you prefer to configure LogTape synchronously, you can use
the `configureSync()` function instead:

~~~~ typescript twoslash
import { configureSync, getConsoleSink } from "@logtape/logtape";

configureSync({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: "my-app",
      lowestLevel: "info",
      sinks: ["console"],
    },
  ],
});
~~~~

> [!CAUTION]
> However, be aware that synchronous configuration has some limitations:
> You cannot use sinks or filters that require asynchronous disposal, i.e.,
> those that implement the `AsyncDisposal` interface.  For example, among
> the built-in sinks, [stream sinks](./sinks.md#stream-sink) requires
> asynchronous disposal.
>
> That said, you still can use sinks or filters that require synchronous
> disposal, i.e., those that implement the `Disposal` interface.

Likewise, you can use `resetSync()` to reset the configuration synchronously:

~~~~ typescript twoslash
import { resetSync } from "@logtape/logtape";

resetSync();
~~~~

> [!CAUTION]
> The `configure()`–`reset()` and `configureSync()`–`resetSync()` APIs have
> to be paired and should not be mixed.  If you use `configure()` to set up
> LogTape, you should use `reset()` to reset it.  If you use `configureSync()`,
> you should use `resetSync()`.


Best practices
--------------

 1. *Configure early*: Set up your LogTape configuration early in your
    application's lifecycle, ideally before any logging calls are made.
 2. [*Use categories wisely*](./categories.md): Create a logical hierarchy with
    your categories to make filtering and management easier.
 3. *Configure for different environments*: Have different configurations for
    development, testing, and production.
 4. *Don't overuse [filters](./filters.md)*: While powerful, too many filters can
    make your logging system complex and hard to maintain.
 5. *Monitor performance*: Be mindful of the performance impact of your logging,
    especially in production environments.


Configuration from objects
--------------------------

*This API is available since LogTape 1.4.0.*

While programmatic configuration with `configure()` is type-safe and powerful,
you may want to load logging configuration from external files like JSON, YAML,
or TOML. The `@logtape/config` package provides `configureFromObject()` for
this purpose.

### Installation

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/config
~~~~

~~~~ sh [npm]
npm add @logtape/config
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/config
~~~~

~~~~ sh [Yarn]
yarn add @logtape/config
~~~~

~~~~ sh [Bun]
bun add @logtape/config
~~~~

:::

### Basic usage

~~~~ typescript twoslash
// @noErrors: 2307
import { configureFromObject } from "@logtape/config";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile("./logtape.json", "utf-8"));
await configureFromObject(config);
~~~~

### Configuration schema

#### Sinks

~~~~ json
{
  "sinks": {
    "console": {
      "type": "#console()"
    },
    "file": {
      "type": "@logtape/file#getFileSink()",
      "path": "/var/log/app.log"
    }
  }
}
~~~~

#### Module reference syntax

The `type` field uses a special syntax to reference modules and exports:

| Format            | Description                          |
|-------------------|--------------------------------------|
| `#shorthand()`    | Built-in shorthand, factory function |
| `#shorthand`      | Built-in shorthand, direct value     |
| `module#export()` | Named export, factory function       |
| `module#export`   | Named export, direct value           |
| `module()`        | Default export, factory function     |
| `module`          | Default export, direct value         |

The `()` suffix indicates that the export is a factory function that should
be called with the remaining configuration options as its argument.

#### Built-in shorthands

| Shorthand     | Maps to                                  |
|---------------|------------------------------------------|
| `#console`    | `@logtape/logtape#getConsoleSink`        |
| `#stream`     | `@logtape/logtape#getStreamSink`         |
| `#text`       | `@logtape/logtape#getTextFormatter`      |
| `#ansiColor`  | `@logtape/logtape#getAnsiColorFormatter` |
| `#jsonLines`  | `@logtape/logtape#getJsonLinesFormatter` |

#### Formatters

~~~~ json
{
  "sinks": {
    "console": {
      "type": "#console()",
      "formatter": {
        "type": "#ansiColor()",
        "timestamp": "date-time-tz"
      }
    }
  }
}
~~~~

Or use a shorthand string:

~~~~ json
{
  "sinks": {
    "file": {
      "type": "@logtape/file#getFileSink()",
      "path": "/var/log/app.log",
      "formatter": "#jsonLines()"
    }
  }
}
~~~~

#### Loggers

~~~~ json
{
  "loggers": [
    {
      "category": ["myapp"],
      "sinks": ["console", "file"],
      "lowestLevel": "info"
    },
    {
      "category": ["myapp", "database"],
      "lowestLevel": "debug"
    }
  ]
}
~~~~

### Complete example

#### JSON

~~~~ json
{
  "sinks": {
    "console": {
      "type": "#console()",
      "formatter": {
        "type": "#ansiColor()",
        "timestamp": "date-time-tz"
      }
    },
    "file": {
      "type": "@logtape/file#getFileSink()",
      "path": "/var/log/app.log",
      "formatter": "#jsonLines()"
    }
  },
  "loggers": [
    {
      "category": ["myapp"],
      "sinks": ["console", "file"],
      "lowestLevel": "info"
    }
  ]
}
~~~~

#### YAML

~~~~ yaml
sinks:
  console:
    type: "#console()"
    formatter:
      type: "#ansiColor()"
      timestamp: date-time-tz

  file:
    type: "@logtape/file#getFileSink()"
    path: /var/log/app.log
    formatter: "#jsonLines()"

loggers:
- category: [myapp]
  sinks: [console, file]
  lowestLevel: info
~~~~

### Error handling

By default, `configureFromObject()` throws a `ConfigError` when it encounters
invalid configuration. You can change this behavior with the `onInvalidConfig`
option:

~~~~ typescript twoslash
// @noErrors: 2307
import { configureFromObject } from "@logtape/config";
const config = {};
// ---cut-before---
await configureFromObject(config, {
  onInvalidConfig: "warn"  // Apply valid parts, log warnings
});
~~~~

In `"warn"` mode:

 -  Only the minimal invalid parts are filtered out
 -  Valid sinks, filters, and loggers are still configured
 -  Warnings are logged to the meta logger (`["logtape", "meta"]`)
 -  If a logger references invalid sinks, the logger is still created but
    those sink references are skipped

This is useful in production environments where you'd rather have *some*
logging working than have the application crash due to a configuration error.

### Reconfiguration

To reset the existing configuration before applying the new one, you can use
the `reset` option:

~~~~ json
{
  "reset": true,
  "sinks": {
    // ...
  },
  "loggers": [
    // ...
  ]
}
~~~~

This is equivalent to calling `configure()` with `reset: true`.

### Module resolution notes

When specifying module paths in the `type` field (e.g., `module#export`),
please keep the following in mind:

Package names
:   You can use package names (e.g., `@logtape/file`)
    if they are installed in your `node_modules` or available in your runtime.

Absolute paths
:   You can use absolute file paths or `file://` URLs.

Relative paths
:   Relative paths (e.g., `./my-sink.ts`) are resolved
    relative to the `@logtape/config` package file, **not** your configuration
    file or current working directory. This is usually not what you want.
    Therefore, it is recommended to use absolute paths or package names.
    Alternatively, you can register your custom modules as
    [custom shorthands](#custom-shorthands).

### Environment variable expansion

Use the `expandEnvVars()` utility to expand environment variables before
configuring:

~~~~ typescript twoslash
// @noErrors: 2307
import { configureFromObject, expandEnvVars } from "@logtape/config";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile("./logtape.json", "utf-8"));
const expanded = expandEnvVars(config);
await configureFromObject(expanded);
~~~~

The default pattern matches `${VAR}` and `${VAR:default}`:

~~~~ json
{
  "sinks": {
    "file": {
      "type": "@logtape/file#getFileSink()",
      "path": "${LOG_PATH:/var/log/app.log}"
    }
  }
}
~~~~

### Custom shorthands

You can define custom shorthands to simplify your configuration:

~~~~ typescript twoslash
// @noErrors: 2307
import { configureFromObject } from "@logtape/config";
const config = {};
// ---cut-before---
await configureFromObject(config, {
  shorthands: {
    sinks: {
      file: "@logtape/file#getFileSink",
      rotating: "@logtape/file#getRotatingFileSink",
      custom: "./my-sinks#getCustomSink",
    },
    formatters: {
      pretty: "@logtape/pretty#getPrettyFormatter",
    }
  }
});
~~~~

Then use them in your configuration:

~~~~ json
{
  "sinks": {
    "app": {
      "type": "#file()",
      "path": "/var/log/app.log"
    }
  }
}
~~~~
