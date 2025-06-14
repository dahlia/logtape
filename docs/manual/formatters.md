Text formatters
===============

A text formatter is a function that formats a log record into a string.  LogTape
has four built-in [sinks](./sinks.md) that can take a text formatter:

 -  [console sink](./sinks.md#console-sink)
 -  [stream sink](./sinks.md#stream-sink)
 -  [file sink](./sinks.md#file-sink)
 -  [rotating file sink](./sinks.md#rotating-file-sink)

Of course, you can write your own sinks that take a text formatter.


Built-in text formatters
------------------------

LogTape provides three built-in text formatters:

### Default text formatter

`defaultTextFormatter` formats a log record into a string with a simple
format.  It renders the timestamp, the log level, the message,
and the prettified values embedded in the message.

It formats log records like this:

~~~~
2023-11-14 22:13:20.000 +00:00 [INF] category·subcategory: Hello, world!
~~~~

### ANSI color formatter

*This API is available since LogTape 0.5.0.*

`ansiColorFormatter` formats a log record into a string with a simple
format and ANSI colors.  It renders the timestamp, the log level,
the message, and the prettified values embedded in the message.

It formats log records like this:

~~~~ ansi
[2m2025-06-12 10:34:10.465 +00[0m [1m[32mINF[0m [2mlogtape·meta:[0m LogTape loggers are configured.  Note that LogTape itself uses the meta logger, which has category [ [32m"logtape"[39m, [32m"meta"[39m ].  The meta logger purposes to log internal errors such as sink exceptions.  If you are seeing this message, the meta logger is automatically configured.  It's recommended to configure the meta logger with a separate sink so that you can easily notice if logging itself fails or is misconfigured.  To turn off this message, configure the meta logger with higher log levels than [32m"info"[39m.  See also <https://logtape.org/manual/categories#meta-logger>.
[2m2025-06-12 10:34:10.472 +00[0m [1mTRC[0m [2mmy-app·module:[0m This is a trace log.
[2m2025-06-12 10:34:10.473 +00[0m [1m[34mDBG[0m [2mmy-app·module:[0m This is a debug log with value: { foo: [33m123[39m }
[2m2025-06-12 10:34:10.473 +00[0m [1m[32mINF[0m [2mmy-app:[0m This is an informational log.
[2m2025-06-12 10:34:10.474 +00[0m [1m[33mWRN[0m [2mmy-app:[0m This is a warning.
[2m2025-06-12 10:34:10.475 +00[0m [1m[31mERR[0m [2mmy-app·module:[0m This is an error with exception: Error: This is an exception.
    at file:///tmp/test.ts:28:10
[2m2025-06-12 10:34:10.475 +00[0m [1m[35mFTL[0m [2mmy-app:[0m This is a fatal error.
~~~~

### JSON Lines formatter

*This API is available since LogTape 0.11.0.*

`jsonLinesFormatter` formats log records as [JSON Lines] (also known as
Newline-Delimited JSON or NDJSON). Each log record is rendered as a JSON object
on a single line, which is a common format for structured logging.

It formats log records like this:

~~~~
{"@timestamp":"2023-11-14T22:13:20.000Z","level":"INFO","message":"Hello, world!","logger":"my.logger","properties":{"key":"value"}}
~~~~

[JSON Lines]: https://jsonlines.org/


Configuring text formatters
---------------------------

*This API is available since LogTape 0.6.0.*

You can customize the built-in text formatters with a `TextFormatterOptions`
or an `AnsiColorFormatterOptions` object without building a new text formatter
from scratch.

### Default text formatter

You can customize the default text formatter by calling
the `getTextFormatter()` function with a `TextFormatterOptions` object.
Customizable options include:

#### `~TextFormatterOptions.timestamp`

The timestamp format.  This can be one of the following:

 -  `"date-time-timezone"`: The date and time with the full timezone offset
    (e.g., `2023-11-14 22:13:20.000 +00:00`).
 -  `"date-time-tz"`: The date and time with the short timezone offset
    (e.g., `2023-11-14 22:13:20.000 +00`).
 -  `"date-time"`: The date and time without the timezone offset
    (e.g., `2023-11-14 22:13:20.000`).
 -  `"time-timezone"`: The time with the full timezone offset but without
    the date (e.g., `22:13:20.000 +00:00`).
 -  `"time-tz"`: The time with the short timezone offset but without
    the date (e.g., `22:13:20.000 +00`).
 -  `"time"`: The time without the date or timezone offset
    (e.g., `22:13:20.000`).
 -  `"date"`: The date without the time or timezone offset
    (e.g., `2023-11-14`).
 -  `"rfc3339"`: The date and time in RFC 3339 format
    (e.g., `2023-11-14T22:13:20.000Z`).
 -  `"none"` or `"disabled"`: No display

Alternatively, this can be a function that accepts a timestamp and returns
a string.

The default is `"date-time-timezone"`.

#### `~TextFormatterOptions.level`

The log level format.  This can be one of the following:

 -  `"ABBR"`: The log level abbreviation in uppercase (e.g., `INF`).
 -  `"FULL"`: The full log level name in uppercase (e.g., `INFO`).
 -  `"L"`: The first letter of the log level in uppercase (e.g., `I`).
 -  `"abbr"`: The log level abbreviation in lowercase (e.g., `inf`).
 -  `"full"`: The full log level name in lowercase (e.g., `info`).
 -  `"l"`: The first letter of the log level in lowercase (e.g., `i`).

Alternatively, this can be a function that accepts a log level and returns
a string.

The default is `"ABBR"`.

#### `~TextFormatterOptions.category`

The separator between the category names.

For example, if the separator is `"·"`, the category `["a", "b", "c"]` will be
formatted as `"a·b·c"`.

The default separator is `"·"`.

If this is a function, it will be called with the category array and should
return a string, which will be used for rendering the category.

#### `~TextFormatterOptions.value`

The format of the embedded values.

A function that renders a value to a string.  This function is used to
render the values in the log record.  The default is [`util.inspect()`] in
Node.js/Bun and [`Deno.inspect()`] in Deno.

[`util.inspect()`]: https://nodejs.org/api/util.html#utilinspectobject-options
[`Deno.inspect()`]: https://docs.deno.com/api/deno/~/Deno.inspect

#### `~TextFormatterOptions.format`

How those formatted parts are concatenated.

A function that formats the log record.  This function is called with the
formatted values and should return a string.  Note that the formatted
*should not* include a newline character at the end.

By default, this is a function that formats the log record as follows:

~~~~
2023-11-14 22:13:20.000 +00:00 [INF] category·subcategory: Hello, world!
~~~~

### ANSI color formatter

You can customize the `ansiColorFormatter` by calling
the `getAnsiColorFormatter()` function with an `AnsiColorFormatterOptions`
object.  Customizable options include:

#### `~AnsiColorFormatterOptions.timestamp`

The timestamp format.  The available options are the same as the
[`timestamp`](#textformatteroptions-timestamp) option of the default text
formatter.

The default is `"date-time-tz"`.

#### `~AnsiColorFormatterOptions.timestampStyle`

The ANSI style for the timestamp.  `"dim"` is used by default.

#### `~AnsiColorFormatterOptions.timestampColor`

The ANSI color for the timestamp.  No color is used by default.

#### `~TextFormatterOptions.level`

The log level format.  The available options are the same as the
[`level`](#textformatteroptions-level) option of the default text formatter.

The default is `"ABBR"`.

#### `~AnsiColorFormatterOptions.levelStyle`

The ANSI style for the log level.  `"bold"` is used by default.

#### `~AnsiColorFormatterOptions.levelColors`

The ANSI colors for the log levels.  The default colors are as follows:

 -  `"trace"`: no color (default terminal color)
 -  `"debug"`: `"blue"`
 -  `"info"`: `"green"`
 -  `"warning"`: `"yellow"`
 -  `"error"`: `"red"`
 -  `"fatal"`: `"magenta"`

#### `~TextFormatterOptions.category`

The separator between the category names.  Behaves the same as the
[`category`](#textformatteroptions-category) option of the default text
formatter.

The default separator is `"·"`.

#### `~AnsiColorFormatterOptions.categoryStyle`

The ANSI style for the category.  `"dim"` is used by default.

#### `~AnsiColorFormatterOptions.categoryColor`

The ANSI color for the category.  No color is used by default.

#### `~TextFormatterOptions.value`

The format of the embedded values.  Behaves the same as the
[`value`](#textformatteroptions-value) option of the default text formatter.

#### `~TextFormatterOptions.format`

How those formatted parts are concatenated.  Behaves the same as the
[`format`](#textformatteroptions-format) option of the default text formatter.

#### Text styles

The `~AnsiColorFormatterOptions.timestampStyle`,
`~AnsiColorFormatterOptions.levelStyle`, and
`~AnsiColorFormatterOptions.categoryStyle` options can be one of the following:

 - `"bold"`
 - `"dim"`
 - `"italic"`
 - `"underline"`
 - `"strikethrough"`
 - `null` (no style)

#### Colors

The `~AnsiColorFormatterOptions.timestampColor`,
`~AnsiColorFormatterOptions.levelColors` (an object with log levels as keys),
and `~AnsiColorFormatterOptions.categoryColor` options can be one of
the following:

 - `"black"`
 - `"red"`
 - `"green"`
 - `"yellow"`
 - `"blue"`
 - `"magenta"`
 - `"cyan"`
 - `"white"`
 - `null` (no color)

### JSON Lines formatter

*This API is available since LogTape 0.11.0.*

You can customize the JSON Lines formatter by calling
the `getJsonLinesFormatter()` function with a `JsonLinesFormatterOptions`
object. Customizable options include:

#### `~JsonLinesFormatterOptions.categorySeparator`

The separator between category names. For example, if the separator is `"."`,
the category `["a", "b", "c"]` will be formatted as `"a.b.c"`.

The default separator is `"."`.

If this is a function, it will be called with the category array and should
return a string or an array of strings, which will be used for rendering
the category.

#### `~JsonLinesFormatterOptions.message`

The message format. This can be one of the following:

 -  `"template"`: The raw message template is used as the message.
 -  `"rendered"`: The message is rendered with the values.

The default is `"rendered"`.

#### `~JsonLinesFormatterOptions.properties`

The properties format. This can be one of the following:

 -  `"flatten"`: The properties are flattened into the root object.
 -  `"prepend:<prefix>"`: The properties are prepended with the given prefix
    (e.g., `"prepend:ctx_"` will prepend `ctx_` to each property key).
 -  `"nest:<key>"`: The properties are nested under the given key
    (e.g., `"nest:properties"` will nest the properties under the
    `properties` key).

The default is `"nest:properties"`.


Pattern-based redaction
-----------------------

*This API is available since LogTape 0.10.0.*

You can redact sensitive data in log records through
[pattern-based redaction](./redaction.md#pattern-based-redaction) by wrapping
your text formatter with a `redactByPattern()` function from
*@logtape/redaction* package:

~~~~ typescript {8-10} twoslash
import { getTextFormatter } from "@logtape/logtape";
import {
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  redactByPattern,
} from "@logtape/redaction";

const formatter = redactByPattern(getTextFormatter(), [
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
]);
~~~~

The above code will create a text formatter that redacts email addresses
and JSON Web Tokens (JWTs) in log records.  The `redactByPattern()` function
takes a `TextFormatter` and an array of patterns, and returns a new
`TextFormatter` that redacts the sensitive data matching those patterns.

For more information about it, see the [*Pattern-based redaction*
section](./redaction.md#pattern-based-redaction).


Fully customized text formatter
-------------------------------

A text formatter is just a function that takes a log record and returns
a string.  The type of a text formatter is `TextFormatter`:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
export type TextFormatter = (record: LogRecord) => string;
~~~~

If you want to build a text formatter from scratch, you can just write
a function that takes a log record and returns a string.  For example,
the following function is a simple text formatter that formats log records into
[JSON Lines]:

~~~~ typescript twoslash
import type { LogRecord } from "@logtape/logtape";
// ---cut-before---
function jsonLinesFormatter(record: LogRecord): string {
  return JSON.stringify(record) + "\n";
}
~~~~

Of course, you can use the built-in `getJsonLinesFormatter()` function for
more sophisticated JSON Lines formatting with customizable options.

[JSON Lines]: https://jsonlines.org/
