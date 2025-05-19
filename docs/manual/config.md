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

### Defining Filters

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
const isDevelopment = Deno.env.get("DENO_DEPLOYMENT_ID") == null;

await configure({
  sinks: {
    console: getConsoleSink(),
    file: getFileSink(isDevelopment ? "dev.log" : "prod.log"),
  },
  loggers: [
    {
      category: "my-app",
      level: isDevelopment ? "debug" : "info",
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
      level: isDevelopment ? "debug" : "info",
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
      level: "debug",
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
