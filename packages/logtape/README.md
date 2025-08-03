<!-- deno-fmt-ignore-file -->

LogTape
=======

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]
[![Codecov][Codecov badge]][Codecov]

LogTape is a logging library for JavaScript and TypeScript.  It provides a
simple and flexible logging system that is easy to use and easy to extend.
The highlights of LogTape are:

 -  *Zero dependencies*: LogTape has zero dependencies.  You can use LogTape
    without worrying about the dependencies of LogTape.

 -  *[Library support]*: LogTape is designed to be used in libraries as well
    as applications.  You can use LogTape in libraries to provide logging
    capabilities to users of the libraries.

 -  *[Runtime diversity]*: LogTape supports Deno, Node.js, Bun, edge functions,
    and browsers.  You can use LogTape in various environments without
    changing the code.

 -  *[Structured logging]*: You can log messages with structured data.

 -  *[Hierarchical categories]*: LogTape uses a hierarchical category system
    to manage loggers.  You can control the verbosity of log messages by
    setting the log level of loggers at different levels of the category
    hierarchy.

 -  *[Template literals]*: LogTape supports template literals for log messages.
    You can use template literals to log messages with placeholders and
    values.

 -  *[Built-in data redaction]*: LogTape provides robust capabilities to redact
    sensitive information from logs using pattern-based or field-based approaches.

 -  *[Dead simple sinks]*: You can easily add your own sinks to LogTape.

![](https://raw.githubusercontent.com/dahlia/logtape/refs/heads/main/screenshots/web-console.png)
![](https://raw.githubusercontent.com/dahlia/logtape/refs/heads/main/screenshots/terminal.png)

[JSR]: https://jsr.io/@logtape/logtape
[JSR badge]: https://jsr.io/badges/@logtape/logtape
[npm]: https://www.npmjs.com/package/@logtape/logtape
[npm badge]: https://img.shields.io/npm/v/@logtape/logtape?logo=npm
[GitHub Actions]: https://github.com/dahlia/logtape/actions/workflows/main.yaml
[GitHub Actions badge]: https://github.com/dahlia/logtape/actions/workflows/main.yaml/badge.svg
[Codecov]: https://codecov.io/gh/dahlia/logtape
[Codecov badge]: https://codecov.io/gh/dahlia/logtape/graph/badge.svg?token=yOejfcuX7r
[Library support]: https://logtape.org/manual/library
[Runtime diversity]: https://logtape.org/manual/install
[Structured logging]: https://logtape.org/manual/struct
[Hierarchical categories]: https://logtape.org/manual/categories
[Template literals]: https://logtape.org/manual/start#how-to-log
[Built-in data redaction]: https://logtape.org/manual/redaction
[Dead simple sinks]: https://logtape.org/manual/sinks


Installation
------------

LogTape is available on [JSR] and [npm].  You can install LogTape for various
JavaScript runtimes and package managers:

~~~~ sh
deno add jsr:@logtape/logtape  # for Deno
npm  add     @logtape/logtape  # for npm
pnpm add     @logtape/logtape  # for pnpm
yarn add     @logtape/logtape  # for Yarn
bun  add     @logtape/logtape  # for Bun
~~~~

See also the [installation manual][Runtime diversity] for more details.


Packages
--------

LogTape is a monorepo that contains several packages.  The main package is
*@logtape/logtape*, which provides the core logging functionality.  Other
packages provide additional features and integrations.  The following is a
list of the packages in the LogTape monorepo:

| Package                                                    | JSR                                  | npm                                  | Description                |
|------------------------------------------------------------|--------------------------------------|--------------------------------------|----------------------------|
| [*@logtape/logtape*](/packages/logtape/)                   | [JSR][jsr:@logtape/logtape]          | [npm][npm:@logtape/logtape]          | Core logging functionality |
| [*@logtape/adaptor-pino*](/packages/adaptor-pino/)         | [JSR][jsr:@logtape/adaptor-pino]     | [npm][npm:@logtape/adaptor-pino]     | [Pino] adapter             |
| [*@logtape/adaptor-winston*](/packages/adaptor-winston/)   | [JSR][jsr:@logtape/adaptor-winston]  | [npm][npm:@logtape/adaptor-winston]  | [winston] adapter          |
| [*@logtape/cloudwatch-logs*](/packages/cloudwatch-logs/)   | [JSR][jsr:@logtape/cloudwatch-logs]  | [npm][npm:@logtape/cloudwatch-logs]  | [AWS CloudWatch Logs] sink |
| [*@logtape/file*](/packages/file/)                         | [JSR][jsr:@logtape/file]             | [npm][npm:@logtape/file]             | File sinks                 |
| [*@logtape/otel*](/packages/otel/)                         | [JSR][jsr:@logtape/otel]             | [npm][npm:@logtape/otel]             | [OpenTelemetry] sink       |
| [*@logtape/pretty*](/packages/pretty/)                     | [JSR][jsr:@logtape/pretty]           | [npm][npm:@logtape/pretty]           | Beautiful text formatter   |
| [*@logtape/redaction*](/packages/redaction/)               | [JSR][jsr:@logtape/redaction]        | [npm][npm:@logtape/redaction]        | Data redaction             |
| [*@logtape/sentry*](/packages/sentry/)                     | [JSR][jsr:@logtape/sentry]           | [npm][npm:@logtape/sentry]           | [Sentry] sink              |
| [*@logtape/syslog*](/packages/syslog/)                     | [JSR][jsr:@logtape/syslog]           | [npm][npm:@logtape/syslog]           | Syslog sink                |
| [*@logtape/windows-eventlog*](/packages/windows-eventlog/) | [JSR][jsr:@logtape/windows-eventlog] | [npm][npm:@logtape/windows-eventlog] | Windows Event Log sink     |

[AWS CloudWatch Logs]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/
[OpenTelemetry]: https://opentelemetry.io/
[Pino]: https://github.com/pinojs/pino
[Sentry]: https://sentry.io/
[winston]: https://github.com/winstonjs/winston
[jsr:@logtape/logtape]: https://jsr.io/@logtape/logtape
[npm:@logtape/logtape]: https://www.npmjs.com/package/@logtape/logtape
[jsr:@logtape/adaptor-pino]: https://jsr.io/@logtape/adaptor-pino
[npm:@logtape/adaptor-pino]: https://www.npmjs.com/package/@logtape/adaptor-pino
[jsr:@logtape/adaptor-winston]: https://jsr.io/@logtape/adaptor-winston
[npm:@logtape/adaptor-winston]: https://www.npmjs.com/package/@logtape/adaptor-winston
[jsr:@logtape/cloudwatch-logs]: https://jsr.io/@logtape/cloudwatch-logs
[npm:@logtape/cloudwatch-logs]: https://www.npmjs.com/package/@logtape/cloudwatch-logs
[jsr:@logtape/file]: https://jsr.io/@logtape/file
[npm:@logtape/file]: https://www.npmjs.com/package/@logtape/file
[jsr:@logtape/otel]: https://jsr.io/@logtape/otel
[npm:@logtape/otel]: https://www.npmjs.com/package/@logtape/otel
[jsr:@logtape/pretty]: https://jsr.io/@logtape/pretty
[npm:@logtape/pretty]: https://www.npmjs.com/package/@logtape/pretty
[jsr:@logtape/redaction]: https://jsr.io/@logtape/redaction
[npm:@logtape/redaction]: https://www.npmjs.com/package/@logtape/redaction
[jsr:@logtape/sentry]: https://jsr.io/@logtape/sentry
[npm:@logtape/sentry]: https://www.npmjs.com/package/@logtape/sentry
[jsr:@logtape/syslog]: https://jsr.io/@logtape/syslog
[npm:@logtape/syslog]: https://www.npmjs.com/package/@logtape/syslog
[jsr:@logtape/windows-eventlog]: https://jsr.io/@logtape/windows-eventlog
[npm:@logtape/windows-eventlog]: https://www.npmjs.com/package/@logtape/windows-eventlog


Docs
----

The docs of LogTape is available at <https://logtape.org/>.
For the API references, see <https://jsr.io/@logtape/logtape>.
