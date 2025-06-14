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

| Package                            | JSR                           | npm                           | Description                |
|------------------------------------|-------------------------------|-------------------------------|----------------------------|
| *@logtape/logtape*                 | [JSR][jsr:@logtape/logtape]   | [npm][npm:@logtape/logtape]   | Core logging functionality |
| [*@logtape/file*](file/)           | [JSR][jsr:@logtape/file]      | [npm][npm:@logtape/file]      | File sinks                 |
| [*@logtape/otel*](otel/)           | [JSR][jsr:@logtape/otel]      | [npm][npm:@logtape/otel]      | [OpenTelemetry] sink       |
| [*@logtape/redaction*](redaction/) | [JSR][jsr:@logtape/redaction] | [npm][npm:@logtape/redaction] | Data redaction             |
| [*@logtape/sentry*](sentry/)       | [JSR][jsr:@logtape/sentry]    | [npm][npm:@logtape/sentry]    | [Sentry] sink              |
| [*@logtape/syslog*](syslog/)       | [JSR][jsr:@logtape/syslog]    | [npm][npm:@logtape/syslog]    | Syslog sink                |

[OpenTelemetry]: https://opentelemetry.io/
[Sentry]: https://sentry.io/
[jsr:@logtape/logtape]: https://jsr.io/@logtape/logtape
[npm:@logtape/logtape]: https://www.npmjs.com/package/@logtape/logtape
[jsr:@logtape/file]: https://jsr.io/@logtape/file
[npm:@logtape/file]: https://www.npmjs.com/package/@logtape/file
[jsr:@logtape/otel]: https://jsr.io/@logtape/otel
[npm:@logtape/otel]: https://www.npmjs.com/package/@logtape/otel
[jsr:@logtape/redaction]: https://jsr.io/@logtape/redaction
[npm:@logtape/redaction]: https://www.npmjs.com/package/@logtape/redaction
[jsr:@logtape/sentry]: https://jsr.io/@logtape/sentry
[npm:@logtape/sentry]: https://www.npmjs.com/package/@logtape/sentry
[jsr:@logtape/syslog]: https://jsr.io/@logtape/syslog
[npm:@logtape/syslog]: https://www.npmjs.com/package/@logtape/syslog


Docs
----

The docs of LogTape is available at <https://logtape.org/>.
For the API references, see <https://jsr.io/@logtape/logtape>.
