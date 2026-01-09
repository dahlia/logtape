Using in libraries
==================

One of LogTape's key features is its ability to be used effectively both by
library authors and application developers.  This chapter will explore
how LogTape can be integrated into libraries and how application developers
can then work with and configure logging for those libraries.


For library authors
-------------------

As a library author, you want to provide useful logging information without
dictating how that information should be handled.  LogTape allows you to do
this seamlessly.

### Best practices for library authors

1.  *Use namespaced categories*: Start your log categories with your library
    name to avoid conflicts.

    ~~~~ typescript twoslash
    import { getLogger } from "@logtape/logtape";

    const logger = getLogger(["my-awesome-lib", "database"]);
    ~~~~

2.  *Don't `configure()` LogTape in your library*: Leave configuration
    to the application developer.

3.  *Use appropriate log levels*: Use log levels judiciously.
    Reserve `"error"` for actual errors, use `"info"` for important
    but normal operations, and `"debug"` for detailed information useful
    during development.

4.  *Provide context*: Use [structured logging](./struct.md) to provide
    relevant context with each log message.

    ~~~~ typescript twoslash
    import { getLogger } from "@logtape/logtape";
    const logger = getLogger(["my-awesome-lib", "database"]);
    const dbHost: string = "";
    const dbPort: number = 0;
    const dbUser: string = "";
    // ---cut-before---
    logger.info("Database connection established", {
      host: dbHost,
      port: dbPort,
      username: dbUser
    });
    ~~~~

### Example: Logging in a library

Here's an example of how you might use LogTape in a library:

~~~~ typescript twoslash
// my-awesome-lib/database.ts
import { getLogger } from "@logtape/logtape";

export class Database {
  private logger = getLogger(["my-awesome-lib", "database"]);

  constructor(
    private host: string,
    private port: number,
    private user: string,
  ) {
  }

  connect() {
    this.logger.info("Attempting to connect to database", {
      host: this.host,
      port: this.port,
      user: this.user
    });

    // Simulating connection logic
    if (Math.random() > 0.5) {
      this.logger.error("Failed to connect to database", {
        host: this.host,
        port: this.port,
        user: this.user
      });
      throw new Error("Connection failed");
    }

    this.logger.info("Successfully connected to database");
  }

  query(sql: string) {
    this.logger.debug("Executing query", { sql });
    // Query logic here
  }
}
~~~~


For application developers
--------------------------

As an application developer using a library that implements LogTape,
you have full control over how logs from that library are handled.

### Configuring logs for a library

1.  *Set up sinks*: Decide where you want logs to go (console, file, etc.)
    and set up appropriate [sinks](./sinks.md).

2.  *Configure log levels*: You can set different log levels for different
    parts of the library.

3.  *Add filters*: You can add [filters](./filters.md) to fine-tune which
    log messages you want to see.

### Example: Configuring logs for a library

Here's how you might configure logging for the example library we created
above:

~~~~ typescript twoslash
// @noErrors: 2307
import { getFileSink } from "@logtape/file";
import { configure, getConsoleSink } from "@logtape/logtape";
import { Database } from "my-awesome-lib";

await configure({
  sinks: {
    console: getConsoleSink(),
    file: getFileSink("app.log")
  },
  filters: {
    excludeDebug: (record) => record.level !== "debug"
  },
  loggers: [
    {
      category: ["my-awesome-lib"],
      lowestLevel: "info",
      sinks: ["console", "file"]
    },
    {
      category: ["my-awesome-lib", "database"],
      lowestLevel: "debug",
      sinks: ["file"],
      filters: ["excludeDebug"]
    }
  ]
});

const db = new Database("localhost", 5432, "user");
db.connect();
db.query("SELECT * FROM users");
~~~~

In this configuration:

 -  All logs from `"my-awesome-lib"` at `"info"` level and above will go
    to both `console` and `file`.

 -  Database-specific logs at `"debug"` level and above will go to the `file`,
    but `"debug"` level logs are filtered out.


Wrapping internal library logs
------------------------------

*Category prefix is available since LogTape 1.3.0.*

If your SDK uses internal libraries that also use LogTape, you can use
`withCategoryPrefix()` to ensure all internal logs appear under your SDK's
category.  This is especially useful when you want application developers to be
able to configure logging for your SDK without needing to know about the
internal libraries you use.

~~~~ typescript twoslash
// my-sdk/index.ts
import { getLogger, withCategoryPrefix } from "@logtape/logtape";

// Simulating an internal database library
const internalDbLib = {
  query(sql: string) {
    getLogger(["internal-db-lib"]).debug("Executing query", { sql });
    return { rows: [] };
  }
};

export class MySDK {
  private logger = getLogger(["my-sdk"]);

  async query(sql: string) {
    return withCategoryPrefix(["my-sdk"], () => {
      this.logger.debug("Starting query", { sql });
      // Logs from internal-db-lib will appear as ["my-sdk", "internal-db-lib"]
      return internalDbLib.query(sql);
    });
  }
}
~~~~

With this approach, application developers can configure logging for all of
your SDK's internal logs using a single category configuration.

> [!IMPORTANT]
> In order to use `withCategoryPrefix()`, the application must configure
> `~Config.contextLocalStorage` option.  Without this, the category prefix
> will not be applied.  See the
> [Category prefix](./categories.md#category-prefix) section for more details.

~~~~ typescript twoslash
// @noErrors: 2307
import { AsyncLocalStorage } from "node:async_hooks";
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      // This will capture all logs from my-sdk, including its internal deps
      category: ["my-sdk"],
      lowestLevel: "info",
      sinks: ["console"],
    },
  ],
  contextLocalStorage: new AsyncLocalStorage(),  // Required for withCategoryPrefix()
});
~~~~
