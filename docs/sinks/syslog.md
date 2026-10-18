Syslog sink
===========

*This API is available since LogTape 0.12.0.*

If you have a syslog server running, you can use the syslog sink to send log
messages to the server using [RFC 5424] format via *@logtape/syslog* package:

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/syslog
~~~~

~~~~ sh [npm]
npm add @logtape/syslog
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/syslog
~~~~

~~~~ sh [Yarn]
yarn add @logtape/syslog
~~~~

~~~~ sh [Bun]
bun add @logtape/syslog
~~~~

:::

The quickest way to get started is to use the `getSyslogSink()` function
without any arguments:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink(),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "debug" },
  ],
});
~~~~

This will send log messages to a syslog server running on `localhost:514`
using UDP protocol with the default facility `local0` and application name
derived from the process.

You can customize the syslog configuration by passing options to the
`getSyslogSink()` function:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink({
      hostname: "syslog.example.com",
      port: 1514,
      protocol: "tcp",
      facility: "mail",
      appName: "my-application",
      timeout: 5000,
    }),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "info" },
  ],
});
~~~~

[RFC 5424]: https://tools.ietf.org/html/rfc5424


Limiting pending messages
-------------------------

*This API is available since LogTape 2.5.0.*

If messages arrive faster than the server accepts them, pending messages can
accumulate in memory.  Set `maxBufferedBytes` to limit their total UTF-8 size:

~~~~ typescript twoslash
import { getSyslogSink } from "@logtape/syslog";

const sink = getSyslogSink({
  protocol: "tcp",
  maxBufferedBytes: 1024 * 1024,  // 1 MiB of pending message data
});
~~~~

The limit counts complete serialized RFC 5424 messages, including headers and
structured data.  A message counts from acceptance until its send settles,
whether by success, failure, or timeout.  Messages waiting to connect and the
message currently being sent count toward the limit.  TCP newline framing,
encoded copies, per-message bookkeeping, and socket buffers do not count, so
this is not a cap on total memory use.  The option applies to UDP, TCP, and TLS.

When a new message would exceed the limit, the sink drops that message and
keeps the messages already pending.  A message that exactly fits is accepted;
a message larger than the entire limit is dropped even when nothing is pending.
The first drop produces a warning through the `["logtape", "meta", "syslog"]`
logger.  Further drops are not reported until all pending messages have settled.
If the server stops accepting data and a send never settles, new messages keep
being dropped without further warnings.

The value must be a positive safe integer or `Infinity`; otherwise
`getSyslogSink()` throws a `RangeError`.  The default is `Infinity`, preserving
unlimited buffering.  Unlike the record-count limit `maxQueueSize` on
`fromAsyncSink()`, this option measures bytes and includes the in-flight
message.

> [!WARNING]
> Enabling this limit allows message loss with any protocol, including TCP.
> Choose a limit that accommodates normal bursts and route meta warnings to
> another sink if you need to observe drops while the Syslog server is stalled.


Structured data
---------------

RFC 5424 syslog supports structured data, which allows you to include
key–value pairs in log messages. LogTape automatically includes log record
properties as structured data when
the `~SyslogSinkOptions.includeStructuredData` option is enabled:

~~~~ typescript twoslash
import { configure } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink({
      includeStructuredData: true,
      structuredDataId: "myapp@12345",
    }),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "debug" },
  ],
});
~~~~

With this configuration, log records with properties will include them as
structured data in the syslog message:

~~~~ typescript twoslash
import { configure, getLogger } from "@logtape/logtape";
import { getSyslogSink } from "@logtape/syslog";

await configure({
  sinks: {
    syslog: getSyslogSink({
      includeStructuredData: true,
      structuredDataId: "myapp@12345",
    }),
  },
  loggers: [
    { category: [], sinks: ["syslog"], lowestLevel: "debug" },
  ],
});

const logger = getLogger();
logger.info("User login successful", { userId: 12345, method: "oauth" });
~~~~

This will generate a syslog message like:

~~~~ log
<134>1 2024-01-01T12:00:00.000Z hostname myapp 1234 - [myapp@12345 userId="12345" method="oauth"] User login successful
~~~~

Only properties whose keys are valid RFC 5424 `SD-NAME` values are included:
keys must be 1 to 32 printable US-ASCII characters and must not contain spaces,
`=`, `]`, or `"`.  Properties with invalid keys are skipped.  Control
characters in structured data values are replaced with printable `#NNN`
sequences before the message is sent.


Message escaping
----------------

Control characters in the log message are replaced with printable `#NNN`
sequences before the message is sent, in the same way as in structured data
values.  This matters most for TCP, which delimits syslog messages with
a newline (*non-transparent framing*, as [RFC 6587] calls it): a newline left
in the message would terminate the frame, and whatever followed it would be
received as a separate syslog record.  If log messages can contain input from
outside the application, such a record can be forged at will.

[RFC 6587]: https://tools.ietf.org/html/rfc6587


Supported facilities
--------------------

The syslog sink supports all standard RFC 5424 facilities:

 -  `kern`, `user`, `mail`, `daemon`, `auth`, `syslog`, `lpr`, `news`
 -  `uucp`, `cron`, `authpriv`, `ftp`
 -  `local0`, `local1`, `local2`, `local3`, `local4`, `local5`, `local6`,
    `local7`


Protocol support
----------------

The syslog sink supports both UDP and TCP protocols:

UDP (default)
:   Fire-and-forget delivery, suitable for high-throughput
    logging where occasional message loss is acceptable.

TCP
:   Reliable delivery with connection management, suitable for critical
    log messages that must not be lost.

For more details, see the `getSyslogSink()` function and `SyslogSinkOptions`
interface in the API reference.
