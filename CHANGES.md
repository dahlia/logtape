<!-- deno-fmt-ignore-file -->

LogTape changelog
=================

Version 0.5.0
-------------

To be released.

- Improve LogTape' extensibility.
  - Add more file modules to the JSR and NPM exports field for easy external access.
  - Add a `properties` parameter to the `logLazily` and `logTemplate` methods of the `LoggerImpl` class.

[#6]: https://github.com/dahlia/logtape/pull/6

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
