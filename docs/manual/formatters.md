Text formatters
===============

A text formatter is a function that formats a log record into a string.  LogTape
has three built-in [sinks](./sinks.md) that can take a text formatter:

 -  [stream sink](./sinks.md#stream-sink)
 -  [file sink](./sinks.md#file-sink)
 -  [rotating file sink](./sinks.md#rotating-file-sink)

Of course, you can write your own sinks that take a text formatter.


Built-in text formatters
------------------------

LogTape provides two built-in text formatters:

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

![A preview of ansiColorFormatter.](https://i.imgur.com/I8LlBUf.png)


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

#### `~TextFormatterOptions.level`

The log level format.  This can be one of the following:

 -  `"ABBR"`: The log level abbreviation in uppercase (e.g., `INF`).
 -  `"FULL"`: The full log level name in uppercase (e.g., `INFO`).
 -  `"L"`: The first letter of the log level in uppercase (e.g., `I`).
 -  `"abbr"`: The log level abbreviation in lowercase (e.g., `inf`).
 -  `"full"`: The full log level name in lowercase (e.g., `info`).
 -  `"l"`: The first letter of the log level in lowercase (e.g., `i`).

#### `~TextFormatterOptions.category`

The separator between the category names.

#### `~TextFormatterOptions.value`

The format of the embedded values.

#### `~TextFormatterOptions.format`

How those formatted parts are concatenated.

### ANSI color formatter

You can customize the `ansiColorFormatter` by calling
the `getAnsiColorFormatter()` function with an `AnsiColorFormatterOptions`
object.  Customizable options include:

#### `~AnsiColorFormatterOptions.timestamp`

The timestamp format.  The available options are the same as the
[`timestamp`](#textformatteroptions-timestamp) option of the default text
formatter.

#### `~AnsiColorFormatterOptions.timestampStyle`

The text style of the timestamp.

#### `~AnsiColorFormatterOptions.timestampColor`

The color of the timestamp.

#### `~TextFormatterOptions.level`

The log level format.  The available options are the same as the
[`level`](#textformatteroptions-level) option of the default text formatter.

#### `~AnsiColorFormatterOptions.levelStyle`

The text style of the log level.

#### `~AnsiColorFormatterOptions.levelColors`

The colors of the log levels.

#### `~TextFormatterOptions.category`

The separator between the category names.

#### `~AnsiColorFormatterOptions.categoryStyle`

The text style of the category.

#### `~AnsiColorFormatterOptions.categoryColor`

The color of the category.

#### `~TextFormatterOptions.value`

The format of the embedded values.

#### `~TextFormatterOptions.format`

How those formatted parts are concatenated.

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


Fully customized text formatter
-------------------------------

A text formatter is just a function that takes a log record and returns
a string.  The type of a text formatter is `TextFormatter`:

~~~~ typescript
export type TextFormatter = (record: LogRecord) => string;
~~~~

If you want to build a text formatter from scratch, you can just write
a function that takes a log record and returns a string.  For example,
the following function is a text formatter that formats log records into
[JSON Lines]:

~~~~ typescript
function jsonLinesFormatter(record: LogRecord): string {
  return JSON.stringify(record) + "\n";
}
~~~~

[JSON Lines]: https://jsonlines.org/
