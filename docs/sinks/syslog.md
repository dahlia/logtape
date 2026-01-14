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


Supported facilities
--------------------

The syslog sink supports all standard RFC 5424 facilities:

 -  `kern`, `user`, `mail`, `daemon`, `auth`, `syslog`, `lpr`, `news`
 -  `uucp`, `cron`, `authpriv`, `ftp`
 -  `local0`, `local1`, `local2`, `local3`, `local4`, `local5`, `local6`, `local7`


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
