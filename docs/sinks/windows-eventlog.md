Windows Event Log sink
======================

*This API is available since LogTape 1.0.0.*

If you are running your application on Windows, you can use the Windows Event
Log sink to send log messages directly to the Windows Event Log system using
*@logtape/windows-eventlog* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/windows-eventlog
~~~~

~~~~ sh [npm]
npm add @logtape/windows-eventlog
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/windows-eventlog
~~~~

~~~~ sh [Yarn]
yarn add @logtape/windows-eventlog
~~~~

~~~~ sh [Bun]
bun add @logtape/windows-eventlog
~~~~

:::

> [!NOTE]
> The Windows Event Log sink is only available on Windows platforms.
> The package installation is restricted to Windows (`"os": ["win32"]`) to
> prevent accidental usage on other platforms.

The quickest way to get started is to use the `getWindowsEventLogSink()`
function with your application source name:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getWindowsEventLogSink } from "@logtape/windows-eventlog";

await configure({
  sinks: {
    eventlog: getWindowsEventLogSink({
      sourceName: "MyApplication",
    }),
  },
  loggers: [
    { category: [], sinks: ["eventlog"], lowestLevel: "info" },
  ],
});
~~~~


Cross-runtime support
---------------------

The Windows Event Log sink works across multiple JavaScript runtimes on Windows:

Deno
:   Uses [Deno's native FFI] for optimal performance

Node.js
:   Uses the [koffi] library for FFI bindings

Bun
:   Uses [Bun's native FFI] for maximum performance

[Deno's native FFI]: https://docs.deno.com/runtime/fundamentals/ffi/
[koffi]: https://koffi.dev/
[Bun's native FFI]: https://bun.sh/docs/api/ffi


Advanced configuration
----------------------

The Windows Event Log sink always writes to the Windows `Application` log.
This is the standard location for application events and does not require
administrator privileges.

You can customize the sink behavior with additional options:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getWindowsEventLogSink } from "@logtape/windows-eventlog";

await configure({
  sinks: {
    eventlog: getWindowsEventLogSink({
      sourceName: "MyApplication",
      eventIdMapping: {
        error: 1001,
        warning: 2001,
        info: 3001,
      },
    }),
  },
  loggers: [
    { category: [], sinks: ["eventlog"], lowestLevel: "info" },
  ],
});
~~~~


Log level mapping
-----------------

LogTape log levels are automatically mapped to Windows Event Log types:

 -  `fatal`, `error` → **Error** (Type 1)
 -  `warning` → **Warning** (Type 2)
 -  `info`, `debug`, `trace` → **Information** (Type 4)


Structured logging
------------------

The sink preserves structured logging data by including it in the event message:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["myapp"]);
logger.info("User logged in", { userId: 123, ip: "192.168.1.1" });
// Results in: "User logged in\n\nCategory: myapp\nProperties: {\"userId\":123,\"ip\":\"192.168.1.1\"}\nTimestamp: 2025-06-15T10:30:00.000Z"
~~~~


Platform validation
-------------------

The sink automatically validates that it's running on Windows and throws a
`WindowsPlatformError` if used on other platforms. This ensures your application
fails fast with a clear error message rather than silently failing.


Error handling and meta logger
------------------------------

The Windows Event Log sink uses LogTape's meta logger to report errors that
occur during FFI operations and event logging. When FFI initialization fails
or event logging encounters errors, these issues are logged to the
`["logtape", "meta", "windows-eventlog"]` category. This prevents logging
failures from crashing your application while still providing visibility into
issues.

You can monitor these meta logs by configuring a separate sink for the meta
logger category:

~~~~ typescript twoslash
// @noErrors: 2345
import { configure, getConsoleSink } from "@logtape/logtape";
import { getWindowsEventLogSink } from "@logtape/windows-eventlog";

await configure({
  sinks: {
    eventlog: getWindowsEventLogSink({ sourceName: "MyApp" }),
    console: getConsoleSink(),
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
    { category: [], sinks: ["eventlog"], lowestLevel: "info" },
  ],
});
~~~~

See also [*Meta logger* section](../manual/categories.md#meta-logger) for more
details.

The sink uses graceful error handling:

 -  FFI initialization failures are logged as warnings but don't crash
    the application
 -  Event logging failures are logged as warnings and continue processing
 -  Proper cleanup is performed when the sink is disposed


Viewing logs
------------

Once your application writes to the Windows Event Log, you can view the logs
using:

 -  *Event Viewer* (*eventvwr.msc*)
 -  *PowerShell*:
    `Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='MyApplication'}`
 -  *Command Prompt*:
    `wevtutil qe Application /f:text /q:"*[System[Provider[@Name='MyApplication']]]"`

For more details, see the `getWindowsEventLogSink()` function and
`WindowsEventLogSinkOptions` interface in the API reference.
