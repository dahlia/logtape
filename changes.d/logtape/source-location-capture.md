---
links:
  '#134': https://github.com/dahlia/logtape/issues/134
  '#241': https://github.com/dahlia/logtape/issues/241
  '#253': https://github.com/dahlia/logtape/pull/253
---
 -  Added opt-in source location capture for development logging.  Setting
    the new `captureSourceLocation` option of a logger configuration to
    `true` records where each logging method was called, when the runtime's
    stack trace makes it available, in the new optional
    `LogRecord.sourceLocation` field, typed as the new `SourceLocation`
    interface.  Child categories inherit the setting, `withConfig()` and
    `withConfigSync()` accept it too, and it is off by default.  LogTape
    does not resolve source maps, so bundled or minified code may report
    positions in the generated code.  [[#134], [#241], [#253]]

 -  Added the `TextFormatterOptions.sourceLocation` option so that
    `getTextFormatter()` and `getAnsiColorFormatter()` can show captured
    source locations, and the optional `FormattedValues.sourceLocation`
    field for custom `format` callbacks.  [[#134], [#241], [#253]]

 -  Added the `getConsoleFormatter()` function and the
    `ConsoleFormatterOptions` interface.  Its `sourceLocation` option shows
    captured source locations in console output; without options it
    formats records like `defaultConsoleFormatter()`.  [[#134], [#241], [#253]]
