<!-- deno-fmt-ignore-file -->

LogTape changelog
=================

Version 1.0.0
-------------

To be released.

 -  Added `getLogLevels()` function to retrieve all available log levels.

 -  Added `LogMethod` type for better type inference of logger methods.

 -  Added `withBuffer()` function to create buffered sinks that collect log
    records in memory and flush them to the underlying sink when the buffer is
    full or after a specified time interval.

     -  Added `BufferSinkOptions` interface for configuring buffer behavior.
     -  `withBuffer()` accepts `bufferSize` (default: 10 records) and
        `flushInterval` (default: 5000ms) options.
     -  Buffered sinks automatically flush when buffer is full, time interval
        elapses, or the sink is disposed.
     -  Returns a sink with `AsyncDisposable` support for proper cleanup.

 -  Added `fromAsyncSink()` function to convert async sinks to regular sinks
    with proper async handling.

     -  Added `AsyncSink` type: `(record: LogRecord) => Promise<void>`.
     -  `fromAsyncSink()` chains async operations to ensure order preservation.
     -  Errors in async sinks are caught to prevent breaking the promise chain.
     -  Returns a sink with `AsyncDisposable` support that waits for all
        pending operations on disposal.

 -  Added `@logtape/cloudwatch-logs` package for AWS CloudWatch Logs
    integration. [[#48], [#49]]

     -  Added `getCloudWatchLogsSink()` function to send logs to AWS CloudWatch
        Logs.
     -  Added `CloudWatchLogsSinkOptions` interface for configuration.
     -  Supports intelligent batching up to 10,000 events or 1MiB per batch.
     -  Includes exponential backoff retry strategy for error handling.
     -  Works with existing CloudWatch Logs clients or creates new ones
        automatically.
     -  Supports custom AWS credentials and regions.
     -  Added `formatter` option to support custom text formatters, including
        `jsonLinesFormatter()` for enhanced CloudWatch Logs Insights querying
        capabilities with dot notation support.

 -  Removed the deprecated `LoggerConfig.level` property.  Use
    `LoggerConfig.lowestLevel` instead for setting the minimum log level, or
    use `LoggerConfig.filters` for more advanced filtering.

[#48]: https://github.com/dahlia/logtape/issues/48
[#49]: https://github.com/dahlia/logtape/pull/49


Version 0.12.0
--------------

Released on June 15, 2025.

 -  Added the `"trace"` severity level, which is lower than `"debug"`.  [[#24]]

     -  Added `"trace"` to the `LogLevel` union type.
     -  Added `Logger.trace()` method.

 -  Added `Logger.warning()` method which is an alias for `Logger.warn()`.
    [[#44]]

 -  Added `bufferSize` and `flushInterval` options to `FileSinkOptions` for
    configurable buffering in file sinks.

     -  `getFileSink()` and `getRotatingFileSink()` functions now accept a
        `bufferSize` option to control write buffering behavior.
     -  `getFileSink()` and `getRotatingFileSink()` functions now accept
        a `flushInterval` option to control the time-based flushing of
        the buffer to disk.
     -  When `bufferSize` is 0 or negative, writes are immediate without
        buffering.
     -  When `bufferSize` is positive, log entries are buffered until the
        buffer size is exceeded, then flushed to disk.
     -  Default buffer size is 8192 characters for improved performance.
     -  Buffer content is automatically flushed when the sink is disposed.
     -  When `flushInterval` is 0 or negative, the time-based flushing is
        disabled.
     -  Default `flushInterval` is 5000 milliseconds (5 seconds) for
        periodic flushing.

 -  Added *@logtape/syslog* package for sending log messages to syslog servers
    using RFC 5424 format.

     -  Added `getSyslogSink()` function to create syslog sinks with support for
        both UDP and TCP protocols.
     -  Supports all standard RFC 5424 facilities (`kern`, `user`, `mail`,
        `daemon`, `local0`–`7`, etc.) and automatic priority calculation.
     -  Includes structured data support for log record properties with proper
        RFC 5424 escaping of special characters.
     -  Cross-runtime compatibility with Deno, Node.js, and Bun.
     -  Configurable connection timeouts, custom hostnames, and application
        names.

 -  Now *@logtape/otel*, *@logtape/sentry*, and *@logtape/syslog* packages are
    released along with *@logtape/logtape* package.  This means they share the
    same version number and changelog.  This is to ensure that the packages are
    always compatible with each other and to simplify the release process.

 -  Improved build and test infrastructure by migrating from [dnt] to [tsdown]
    for npm package bundling.  [[#43]]

[dnt]: https://github.com/denoland/dnt
[tsdown]: https://tsdown.dev/
[#24]: https://github.com/dahlia/logtape/issues/24
[#43]: https://github.com/dahlia/logtape/issues/43
[#44]: https://github.com/dahlia/logtape/issues/44


Version 0.11.0
--------------

Released on June 2, 2025.

 -  Loggers now allow to interpolate all properties at once through the special
    placeholder `{*}`.  This is useful for logging objects with many properties
    without having to specify each property name in the message template.

     -  `Logger.debug()`, `Logger.info()`, `Logger.warn()`, `Logger.error()`,
        and `Logger.fatal()` methods now accept a message template with the
        `{*}` placeholder.  Unless there is a property with the name `*`,
        the `{*}` placeholder will be replaced with a stringified version of
        the `LogRecord.properties` object.
     -  As a shorthand, overloads of `Logger.debug()`, `Logger.info()`,
        `Logger.warn()`, `Logger.error()`, and `Logger.fatal()` methods that
        accept an object as the first argument now treat the object as a
        message template with the `{*}` placeholder.  This is equivalent to
        calling the method with a message template of `{*}` and the object as
        the second argument.

 -  Added the built-in [JSON Lines] formatter.

     -  Added `jsonLinesFormatter()` function.
     -  Added `getJsonLinesFormatter()` function.
     -  Added `JsonLinesFormatterOptions` interface.

[JSON Lines]: https://jsonlines.org/


Version 0.10.0
--------------

Released on May 19, 2025.

 -  Added `@logtape/redaction` package for redacting sensitive information
    from log records.

     -  Added `redactByField()` function.
     -  Added `FieldPattern` type.
     -  Added `FieldPatterns` type.
     -  Added `FieldRedactionOptions` interface.
     -  Added `DEFAULT_REDACT_FIELDS` constant.
     -  Added `redactByPattern()` function.
     -  Added `RedactionPattern` interface.
     -  Added `RedactionPatterns` type.
     -  Added `CREDIT_CARD_NUMBER_PATTERN` constant.
     -  Added `EMAIL_ADDRESS_PATTERN` constant.
     -  Added `JWT_PATTERN` constant.
     -  Added `KR_RRN_PATTERN` constant.
     -  Added `US_SSN_PATTERN` constant.

 -  The text formatter now can omit the timestamp from the formatted message.
    [[#35] by Ooker]

     -  Changed the type of the `TextFormatterOptions.timestamp` option to
        `"date-time-timezone" | "date-time-tz" | "date-time" | "time-timezone"
        | "time-tz" | "time" | "date" | "rfc3339" | "none" | "disabled"
        | ((ts: number) => string | null)` (was `"date-time-timezone"
        | "date-time-tz" | "date-time" | "time-timezone" | "time-tz" | "time"
        | "date" | "rfc3339" | ((ts: number) => string)`).
     -  Changed the type of the `FormattedValues.timestamp` property to
        `string | null` (was `string`).

 -  Added `FileSinkOptions.lazy` option.  [[#38], [#39] by Rickey Ward]

 -  The `configure()` and `configureSync()` functions now check for duplicate
    logger configurations with the same category and throw a `ConfigError` when
    detected.  This prevents unintended overriding of logger configurations when
    configuring multiple loggers with the same category.  [[#41]]

[#35]: https://github.com/dahlia/logtape/pull/35
[#38]: https://github.com/dahlia/logtape/issues/38
[#39]: https://github.com/dahlia/logtape/pull/39
[#41]: https://github.com/dahlia/logtape/issues/41


Version 0.9.2
-------------

Released on May 15, 2025.

 -  Fixed a bug where importing `@logtape/logtape` threw a `ReferenceError`
    on Node.js or Bun when LogTape was installed from JSR (instead of npm).
    [[#42]]

[#42]: https://github.com/dahlia/logtape/issues/42


Version 0.9.1
-------------

Released on April 24, 2025.

 -  Fixed a CORS error when using LogTape in web browser environments like Fresh
    islands components due to importing Node.js `node:util` module.  [[#40]]

[#40]: https://github.com/dahlia/logtape/issues/40


Version 0.9.0
-------------

Released on March 1, 2025.

 -  Moved file sinks and rotating file sinks to separate packages.
    [[#19], [#27], [#28]]

     -  Moved `getFileSink()` function to `@logtape/file` package.
     -  Moved `FileSinkOptions` interface to `@logtape/file` package.
     -  Moved `getRotatingFileSink()` function to `@logtape/file` package.
     -  Moved `RotatingFileSinkOptions` interface to `@logtape/file` package.

 -  Added synchronous versions of configuration functions.
    [[#12], [#29] by Murph Murphy]

     -  Added `configureSync()` function.
     -  Added `disposeSync()` function.
     -  Added `resetSync()` function.

 -  Added `ConsoleSinkOptions.levelMap` option.

[#12]: https://github.com/dahlia/logtape/issues/12
[#19]: https://github.com/dahlia/logtape/issues/19
[#27]: https://github.com/dahlia/logtape/issues/27
[#28]: https://github.com/dahlia/logtape/issues/28
[#29]: https://github.com/dahlia/logtape/pull/29


Version 0.8.2
-------------

Released on February 11, 2025.

 -  Fixed a bug of text formatters where they truncated string and array values
    in the formatted message.  [[#30]]


Version 0.8.1
-------------

Released on February 1, 2025.

 -  Fixed a bug where when a child logger is configured with a lower
    `lowestLevel` than its parent logger, a log record with a severity level
    lower than the parent logger's `lowestLevel` and higher than the child
    logger's `lowestLevel` would not be filtered out by the parent logger.


Version 0.8.0
-------------

Released on November 20, 2024.

 -  Renewed the API to configure the lowest severity level of loggers.  [[#26]]

     -  Added `LoggerConfig.lowestLevel` property.
     -  Deprecated `LoggerConfig.level` property in favor of
        `LoggerConfig.lowestLevel`.

 -  Added `compareLogLevel()` function.

[#26]: https://github.com/dahlia/logtape/issues/26


Version 0.7.2
-------------

Released on February 11, 2025.

 -  Fixed a bug of text formatters where they truncated string and array values
    in the formatted message.  [[#30]]


Version 0.7.1
-------------

Released on October 30, 2024.

 -  The `withContext()` function no more throws an error
    even if no `contextLocalStorage` is configured.  Instead,  it will log
    a warning message to the `["logtape", "meta"]` logger.


Version 0.7.0
-------------

Released on October 29, 2024.

 -  Introduced implicit contexts.

     -  Added `withContext()` function.
     -  Added `Config.contextLocalStorage` option.
     -  Added `ContextLocalStorage` interface.


Version 0.6.5
-------------

Released on February 11, 2025.

 -  Fixed a bug of text formatters where they truncated string and array values
    in the formatted message.  [[#30]]

[#30]: https://github.com/dahlia/logtape/issues/30


Version 0.6.4
-------------

Released on October 28, 2024.

 -  Fixed a build warning due to importing `node:fs` and `node:util` modules on
    Next.js' client rendering.  [[#19]]
 -  Made it to work on Deno 2.0.0 or higher.

[#19]: https://github.com/dahlia/logtape/issues/19


Version 0.6.3
-------------

Released on October 3, 2024.

 -  Fixed a build error due to importing `node:fs` and `node:util` modules on
    Next.js' client rendering.


Version 0.6.2
-------------

Released on September 24, 2024.

 -  Fixed a build warning due to importing `node:util` module on [Next.js].
    [[#11]]


Version 0.6.1
-------------

Released on September 24, 2024.

 -  Fixed a build error due to importing `node:util` module on [Vite].  [[#18]]


Version 0.6.0
-------------

Released on September 24, 2024.

 -  Loggers now can override sinks of their ascendants.  Still, they inherit
    the sinks of their ascendants by default.  [[#15]]

     -  Added `LoggerConfig.parentSinks` property.

 -  Placeholders in message templates now forgive leading and trailing spaces.
    However, if a property with exactly the same name exists, it will be
    prioritized over space-trimmed properties.  [[#16]]

 -  Added `LogRecord.rawMessage` property.  [[#17]]

 -  Built-in text formatters now can be customized with a `TextFormatterOptions`
    object.  [[#13]]

     -  Added `TextFormatterOptions` interface.
     -  Added `FormattedValues` interface.
     -  Added `getTextFormatter()` function.
     -  Added `AnsiColor` type.
     -  Added `AnsiStyle` type.
     -  Added `AnsiColorFormatterOptions` interface.
     -  Added `getAnsiColorFormatter()` function.

[#13]: https://github.com/dahlia/logtape/issues/13
[#15]: https://github.com/dahlia/logtape/issues/15
[#16]: https://github.com/dahlia/logtape/issues/16
[#17]: https://github.com/dahlia/logtape/issues/17


Version 0.5.4
-------------

Released on September 24, 2024.

 -  Fixed a build warning due to importing `node:util` module on [Next.js].
    [[#11]]

[Next.js]: https://nextjs.org/
[#11]: https://github.com/dahlia/logtape/issues/11


Version 0.5.3
-------------

Released on September 24, 2024.

 -  Fixed a build error due to importing `node:util` module on [Vite].  [[#18]]

[#18]: https://github.com/dahlia/logtape/issues/18


Version 0.5.2
-------------

Released on September 23, 2024.

 -  Fixed a build error due to top-level `await` on [Vite].  [[#14]]

[Vite]: https://vitejs.dev/
[#14]: https://github.com/dahlia/logtape/issues/14


Version 0.5.1
-------------

Released on September 10, 2024.

 -  Fixed a bug of `defaultTextFormatter()` function where it rendered embedded
    values in the message as JSON instead of `util.inspect()` on Node.js and
    Bun.

 -  Fixed a bug of `ansiColorFormatter()` function where it failed to colorize
    embedded values in the message on Node.js and Bun.


Version 0.5.0
-------------

Released on August 29, 2024.

 -  LogTape now provides contexts for loggers.  [[#7], [#8]]

     -  Added `Logger.with()` method.

 -  The console sink now can take a `TextFormatter` besides a `ConsoleFormatter`
    for formatting log records.

     -  The type of `ConsoleSinkOptions.formatter` became
        `ConsoleFormatter | TextFormatter | undefined`
        (was `ConsoleFormatter | undefined`).

 -  Added `ansiColorFormatter()` function.

 -  `configure()` function's `filters` option became optional.

     -  The type of `Config.filters` became
        `Record<string, FilterLike> | undefined`
        (was `Record<string, FilterLike>`).

[#7]: https://github.com/dahlia/logtape/issues/7
[#8]: https://github.com/dahlia/logtape/pull/8


Version 0.4.3
-------------

Released on August 22, 2024.

 -  Fixed a bug where `getRotatingFileSink()` function had failed to create
    a new log file when there's no log file to rotate yet.  [[#9]]

[#9]: https://github.com/dahlia/logtape/issues/9


Version 0.4.2
-------------

Released on July 15, 2024.

 -  LogTape now works well on edge functions.  [[#5]]

     -  The npm version of LogTape no more depends on `node:stream/web` module.
     -  LogTape now works well with JavaScript runtimes that do not support
        `node:fs` module.
     -  LogTape now works well with JavaScript runtimes that do not support
        `WeakRef` class.
     -  Got rid of `eval()` from LogTape.

[#5]: https://github.com/dahlia/logtape/issues/5


Version 0.4.1
-------------

Released on July 2, 2024.

 -  Fixed a bug where LogTape failed to load under Node.js when incorporated
    in a project from JSR.  [[#3], [#4] by Kitson Kelly]


Version 0.4.0
-------------

Released on May 7, 2024.

 -  Curly braces can now be escaped with double curly braces.
    [[#1], [#2] by Diyar Oktay]

[#1]: https://github.com/dahlia/logtape/issues/1
[#2]: https://github.com/dahlia/logtape/pull/2
[#3]: https://github.com/dahlia/logtape/issues/3
[#4]: https://github.com/dahlia/logtape/pull/4


Version 0.3.1
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.3.0
-------------

Released on April 22, 2024.

 -  Added `parseLogLevel()` function.
 -  Added `isLogLevel()` function.
 -  Added `getConfig()` function.
 -  Added `withFilter()` function.


Version 0.2.3
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.2.2
-------------

Released on April 21, 2024.

 -  Fixed a bug where the configured sinks and filters were reset after
    some inactivity.  This was caused by garbage collection of the
    `Logger` instances.  The `Logger` instances are now kept alive by
    an internal set of strong references until explicitly `reset()` is
    called.


Version 0.2.1
-------------

Released on April 20, 2024.

 -  Removed `FileSinkDriver` interface.
 -  Added `RotatingFileSinkOptions` interface.


Version 0.2.0
-------------

Released on April 20, 2024.

 -  Sinks now can be asynchronously disposed of.  This is useful for
    sinks that need to flush their buffers before being closed.

     -  Added `dispose()` function.
     -  The return type of `configure()` function became `Promise<void>`
        (was `void`).
     -  The return type of `reset()` function became `Promise<void>`
        (was `void`).
     -  Configured sinks that implement `AsyncDisposable` are now disposed
        of asynchronously when the configuration is reset or the program exits.

 -  The return type of `getStreamSink()` function became
    `Sink & AsyncDisposable` (was `Sink & Disposable`).

 -  Added `getRotatingFileSink()` function.


Version 0.1.2
-------------

Released on May 7, 2024.

 -  Fixed a bug where two or more versions of LogTape were imported in the same
    runtime, the `Logger` instances would not be shared between them.  This was
    caused by the `Logger` instances being stored in a module-level variable.


Version 0.1.1
-------------

Released on April 21, 2024.

 -  Fixed a bug where the configured sinks and filters were reset after
    some inactivity.  This was caused by garbage collection of the
    `Logger` instances.  The `Logger` instances are now kept alive by
    an internal set of strong references until explicitly `reset()` is
    called.


Version 0.1.0
-------------

Initial release.  Released on April 19, 2024.

<!-- cSpell: ignore Murph runtimes Kitson Diyar Oktay Ooker -->
