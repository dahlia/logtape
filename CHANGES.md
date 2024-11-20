<!-- deno-fmt-ignore-file -->

LogTape changelog
=================

Version 0.9.0
-------------

To be released.


Version 0.8.0
-------------

Released on November 20, 2024.

 -  Renewed the API to configure the lowest severity level of loggers.  [[#26]]

     -  Added `LoggerConfig.lowestLevel` property.
     -  Deprecated `LoggerConfig.level` property in favor of
        `LoggerConfig.lowestLevel`.

 -  Added `compareLogLevel()` function.

[#26]: https://github.com/dahlia/logtape/issues/26


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

<!-- cSpell: ignore runtimes Kitson Diyar Oktay -->
