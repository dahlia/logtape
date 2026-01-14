<!-- deno-fmt-ignore-file -->

LogTape syslog sink
===================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Syslog sink for [LogTape]. This package provides a syslog sink that sends log
messages to a syslog server following the [RFC 5424] specification.

[JSR badge]: https://jsr.io/badges/@logtape/syslog
[JSR]: https://jsr.io/@logtape/syslog
[npm badge]: https://img.shields.io/npm/v/@logtape/syslog?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/syslog
[LogTape]: https://logtape.org/
[RFC 5424]: https://tools.ietf.org/rfc/rfc5424.txt


Features
--------

 -  *RFC 5424 compliant*: Follows the official syslog protocol specification
 -  *Multiple transports*: Supports both UDP and TCP protocols
 -  *Cross-runtime*: Works on Deno, Node.js, and Bun
 -  *Non-blocking*: Asynchronous message sending with proper cleanup
 -  *Configurable*: Extensive configuration options for facility, hostname, etc.
 -  *Structured logging*: Optional structured data support
 -  *Zero dependencies*: No external dependencies


Installation
------------

This package is available on [JSR] and [npm].  You can install it for various
JavaScript runtimes and package managers:

~~~~ sh
deno add jsr:@logtape/syslog  # for Deno
npm  add     @logtape/syslog  # for npm
pnpm add     @logtape/syslog  # for pnpm
yarn add     @logtape/syslog  # for Yarn
bun  add     @logtape/syslog  # for Bun
~~~~


Docs
----

The docs of this package is available at
<https://logtape.org/sinks/syslog>. For the API references,
see <https://jsr.io/@logtape/syslog>.
