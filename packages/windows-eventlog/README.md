<!-- deno-fmt-ignore-file -->

LogTape Windows Event Log sink
==============================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Windows Event Log sink for [LogTape]. This package provides a Windows Event Log
sink that sends log messages directly to the Windows Event Log system with
cross-runtime support and optimal performance.

[JSR badge]: https://jsr.io/badges/@logtape/windows-eventlog
[JSR]: https://jsr.io/@logtape/windows-eventlog
[npm badge]: https://img.shields.io/npm/v/@logtape/windows-eventlog?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/windows-eventlog
[LogTape]: https://logtape.org/


Features
--------

 -  *Native Windows integration*: Direct integration with Windows Event Log
    system
 -  *Cross-runtime*: Works on Deno, Node.js, and Bun
 -  *High performance*: Uses runtime-optimized FFI implementations
 -  *Structured logging*: Preserves structured data in Event Log entries
 -  *Unicode support*: Full support for international characters and emoji
 -  *Platform safety*: Automatically restricts installation to Windows platforms
 -  *Zero dependencies*: No external dependencies for Deno and Bun


Installation
------------

This package is available on [JSR] and [npm]. You can install it for various
JavaScript runtimes and package managers:

~~~~ sh
deno add jsr:@logtape/windows-eventlog  # for Deno
npm  add     @logtape/windows-eventlog  # for npm
pnpm add     @logtape/windows-eventlog  # for pnpm
yarn add     @logtape/windows-eventlog  # for Yarn
bun  add     @logtape/windows-eventlog  # for Bun
~~~~

> [!NOTE]
> This package is only available for Windows platforms. The package installation
> is restricted to Windows (`"os": ["win32"]`) to prevent accidental usage on
> other platforms.


Usage
-----

The quickest way to get started is to use the `getWindowsEventLogSink()`
function with your application source name:

~~~~ typescript
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

You can also customize the sink behavior with additional options:

~~~~ typescript
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

> [!NOTE]
> The Windows Event Log sink always writes to the `Application` log.
> This is the standard location for application events and does not require
> administrator privileges.

> [!NOTE]
> The event ID is used to lookup a string resource from a dynamic link library.
> If you do not register a library, “the system cannot open the file” will
> be printed as description in the Event Log regardless of the parameters
> passed.

If you want to log only the text supplied by the formatter into the event log,
you can register the system generic string library using this command:

~~~~ powershell
New-Item `
  -Path HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application `
  -Name MyApplication `
  | New-ItemProperty `
    -Name EventMessageFile `
    -PropertyType ExpandString `
    -Value %SystemRoot%\System32\netmsg.dll
~~~~

Replacing `MyApplication` with the name you passed as `sourceName` to the sink,
and use the `NELOG_OEM_Code` (the default) as the event ID. Note that there is
no quotation marks around the data part of that command, as this trips up the
escaping of the percentage signs.

> [!NOTE]
> Event Viewer will cache the event message file when it is open. If you change
> the entry in the registry, it will not be updated until Event Viewer is
> restarted.


Runtime support
---------------

The Windows Event Log sink works across multiple JavaScript runtimes on Windows:

 -  *Deno*: Uses [Deno's native FFI] for optimal performance
 -  *Node.js*: Uses the [koffi] library for FFI bindings
 -  *Bun*: Uses [Bun's native FFI] for maximum performance

[Deno's native FFI]: https://docs.deno.com/runtime/fundamentals/ffi/
[koffi]: https://koffi.dev/
[Bun's native FFI]: https://bun.sh/docs/api/ffi


Viewing logs
------------

Once your application writes to the Windows Event Log, you can view the logs
using:

 -  *Event Viewer* (*eventvwr.msc*)
 -  *PowerShell*:
    `Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='MyApplication'}`
 -  *Command Prompt*:
    `wevtutil qe Application /f:text /q:"*[System[Provider[@Name='MyApplication']]]"`


Docs
----

The docs of this package is available at
<https://logtape.org/sinks/windows-eventlog>. For the API
references, see <https://jsr.io/@logtape/windows-eventlog>.
