@logtape/sentry: LogTape Sentry Sink
====================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]

This package provides a [Sentry] sink for [LogTape]. It allows you to
capture your LogTape logs and send them to Sentry.

![LogTape records show up in the breadcrumbs of a Sentry issue.](https://raw.githubusercontent.com/dahlia/logtape/refs/heads/main/screenshots/sentry.png)

[JSR badge]: https://jsr.io/badges/@logtape/sentry
[JSR]: https://jsr.io/@logtape/sentry
[npm badge]: https://img.shields.io/npm/v/@logtape/sentry?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/sentry
[GitHub Actions badge]: https://github.com/dahlia/logtape/actions/workflows/main.yaml/badge.svg
[GitHub Actions]: https://github.com/dahlia/logtape/actions/workflows/main.yaml
[Sentry]: https://sentry.io/
[LogTape]: https://logtape.org/


Installation
------------

This package is available on [JSR] and [npm]. You can install it for various
JavaScript runtimes and package managers:

~~~~ sh
deno add jsr:@logtape/sentry  # for Deno
npm  add     @logtape/sentry  # for npm
pnpm add     @logtape/sentry  # for pnpm
yarn add     @logtape/sentry  # for Yarn
bun  add     @logtape/sentry  # for Bun
~~~~

You'll also need to install a Sentry SDK for your runtime:

~~~~ sh
# Node.js
npm add @sentry/node

# Deno (requires both packages at same version)
deno add npm:@sentry/deno npm:@sentry/core

# Bun
bun add @sentry/bun
~~~~


Docs
----

The documentation for this package is available at
<https://logtape.org/sinks/sentry>.

For API references, see <https://jsr.io/@logtape/sentry>.
