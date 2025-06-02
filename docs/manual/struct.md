Structured logging
==================

Structured logging is an approach to logging that treats log entries as
structured data rather than plain text.  This method makes logs more easily
searchable, filterable, and analyzable, especially when dealing with large
volumes of log data.

Benefits of structured logging include:

 -  *Improved searchability*: Easily search for specific log entries based on
    structured fields.
 -  *Better analysis*: Perform more sophisticated analysis on your logs using
    the structured data.
 -  *Consistency*: Enforce a consistent format for your log data across
    your application.
 -  *Machine-Readable*: Structured logs are easier for log management systems
    to process and analyze.

LogTape provides built-in support for structured logging, allowing you to
include additional context and metadata with your log messages.


Logging structured data
-----------------------

*This API is available since LogTape 0.11.0.*

You can log structured data by passing an object as the first argument
to any log method.  The properties of this object will be included as
structured data in the log record:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-app"]);

logger.info({
  userId: 123456,
  username: "johndoe",
  loginTime: new Date(),
});
~~~~

This will create a log entry with no message, but it will include the `userId`,
`username`, and `loginTime` as structured fields in the log record.


Including structured data in log messages
-----------------------------------------

You can also log structured data with a message by passing the message as the
first argument and the structured data as the second argument:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
// ---cut-before---
logger.info("User logged in", {
  userId: 123456,
  username: "johndoe",
  loginTime: new Date(),
});
~~~~

This will create a log entry with the message `"User logged in"` and include
the `userId`, `username`, and `loginTime` as structured fields.

You can use placeholders in your log messages.  The values for these
placeholders will be included as structured data.

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
// ---cut-before---
logger.info("User {username} (ID: {userId}) logged in at {loginTime}", {
  userId: 123456,
  username: "johndoe",
  loginTime: new Date(),
});
~~~~

This method allows you to include the structured data directly in your log
message while still maintaining it as separate fields in the log record.

> [!TIP]
> The way to log single curly braces `{`  is to double the brace:
>
> ~~~~ typescript twoslash
> import { getLogger } from "@logtape/logtape";
> const logger = getLogger();
> // ---cut-before---
> logger.debug("This logs {{single}} curly braces.");
> ~~~~

> [!TIP]
> Placeholders can have leading and trailing spaces.  For example,
> `{ username }` will match the property `"username"` *unless* there is
> a property named `" username "` with exact spaces.  In that case,
> the exact property will be prioritized:
>
> ~~~~ typescript twoslash
> import { getLogger } from "@logtape/logtape";
> const logger = getLogger();
> // ---cut-before---
> logger.info(
>   "User { username } logged in.",
>   { username: "johndoe" },
> );
> // -> User johndoe logged in.
> logger.info(
>   "User { username } logged in.",
>   { " username ": "janedoe", username: "johndoe" },
> );
> // -> User janedoe logged in.
> ~~~~

> [!NOTE]
> Currently, template literals do not support structured data.  You must use
> method calls with an object argument to include structured data in your log
> messages.


Including all properties in log messages
----------------------------------------

*This API is available since LogTape 0.11.0.*

Sometimes, you may want to include all the properties into the log message,
but without listing them all explicitly.  You can use the special placeholder
`{*}` to include all properties of the structured data object in the log message:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
// ---cut-before---
logger.info("User logged in with properties {*}", {
  userId: 123456,
  username: "johndoe",
  loginTime: new Date(),
});
~~~~

> [!TIP]
>
> Actually, `logger.info({ ... })` is equivalent to
> `logger.info("{*}", { ... })`, so you can use either method to log structured
> data without a message.


Lazy evaluation of structured data
----------------------------------

If computing the structured data is expensive and you want to avoid unnecessary
computation when the log level is not enabled, you can use a function to provide
the structured data:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger();
const startTime = performance.now();
/**
 * A hypothetical function that computes a value, which is expensive.
 * @returns The computed value.
 */
function expensiveComputation(): unknown { return 0; }
// ---cut-before---
logger.debug("Expensive operation completed", () => ({
  result: expensiveComputation(),
  duration: performance.now() - startTime
}));
~~~~

The function will only be called if the debug log level is enabled.


Configuring sinks for structured logging
----------------------------------------

To make the most of structured logging, you'll want to use sinks that can handle
structured data.  LogTape provides several ways to format structured logs:

### JSON Lines formatter

*This API is available since LogTape 0.11.0.*

The [JSON Lines formatter](./formatters.md#json-lines-formatter) is specifically
designed for structured logging, outputting each log record as a JSON object
on a separate line:

~~~~ typescript twoslash
import { getFileSink } from "@logtape/file";
import { configure, jsonLinesFormatter } from "@logtape/logtape";

await configure({
  sinks: {
    jsonl: getFileSink("log.jsonl", {
      formatter: jsonLinesFormatter
    }),
  },
  // ... rest of configuration
});
~~~~

### Custom formatter

You can also create a custom formatter for JSON Lines format:

~~~~ typescript twoslash
// @noErrors: 2345
import { getFileSink } from "@logtape/file";
import { configure } from "@logtape/logtape";

await configure({
  sinks: {
    jsonl: getFileSink("log.jsonl", {
      formatter: (record) => JSON.stringify(record) + "\n"
    }),
  },
  // ... rest of configuration
});
~~~~

Both approaches will output each log record as a JSON object on a separate line,
preserving the structure of your log data.

> [!TIP]
> If you want to monitor log messages formatted in JSON Lines in real-time
> readably, you can utilize the `tail` and [`jq`] commands:
>
> ~~~~ sh
> tail -f log.jsonl | jq .
> ~~~~

[JSON Lines]: https://jsonlines.org/
[`jq`]: https://jqlang.github.io/jq/


Filtering based on structured data
----------------------------------

You can create filters that use the structured data in your log records:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink()
  },
  filters: {
    highPriorityOnly: (record) => 
      record.properties.priority === "high" || record.level === "error"
  },
  loggers: [
    {
      category: ["my-app"],
      sinks: ["console"],
      filters: ["highPriorityOnly"]
    }
  ]
});
~~~~

This filter will only allow logs with a `"high"` priority or error level to pass through.


Best practices
--------------

 1. *Be consistent*: Use consistent field names across your application for
    similar types of data.

 2. *Use appropriate data types*: Ensure that the values in your structured data
    are of appropriate types (e.g., numbers for numeric values, booleans for
    true/false values).

 3. *Don't overload*: While it's tempting to include lots of data, be mindful of
    the volume of data you're logging.  Include what's necessary for debugging
    and analysis, but avoid logging sensitive or redundant information.

 4. *Use nested structures when appropriate*: For complex data, consider using
    nested objects to maintain a logical structure.

 5. *Consider performance*: If you're logging high-volume data, be aware of
    the performance impact of generating and processing structured logs.

<!-- cSpell: ignore johndoe janedoe -->
