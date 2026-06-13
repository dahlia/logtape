<!-- deno-fmt-ignore-file -->

Testing utilities for LogTape
=============================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package provides testing utilities for [LogTape].  It includes a log
recorder that collects `LogRecord` values in memory and provides matcher-based
assertions for category, level, rendered message, raw message, and structured
properties.

[JSR badge]: https://jsr.io/badges/@logtape/testing
[JSR]: https://jsr.io/@logtape/testing
[npm badge]: https://img.shields.io/npm/v/@logtape/testing?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/testing
[LogTape]: https://logtape.org/


Installation
------------

This package is available on [JSR] and [npm].  You can install it for various
JavaScript runtimes and package managers:

~~~~ sh
deno add jsr:@logtape/testing  # for Deno
npm  add     @logtape/testing  # for npm
pnpm add     @logtape/testing  # for pnpm
yarn add     @logtape/testing  # for Yarn
bun  add     @logtape/testing  # for Bun
~~~~


Usage
-----

Use `createLogRecorder()` as a sink in tests:

~~~~ typescript
import { configure, getLogger, reset } from "@logtape/logtape";
import { createLogRecorder } from "@logtape/testing";

const recorder = createLogRecorder();

try {
  await configure({
    sinks: { recorder: recorder.sink },
    loggers: [
      { category: ["my-lib"], lowestLevel: "debug", sinks: ["recorder"] },
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });

  getLogger(["my-lib"]).info("User {userId} logged in.", {
    userId: 123,
  });

  recorder.assertLogged({
    category: ["my-lib"],
    level: "info",
    message: "User 123 logged in.",
    properties: { userId: 123 },
  });
} finally {
  await reset();
}
~~~~

The recorder also provides `records`, `clear()`, `take()`, `find()`,
`filter()`, and `assertNotLogged()` for tests that need lower-level access.
Most property values are compared with `Object.is()`, while `Date` values are
compared by timestamp.  Rendered message matching uses the same value rendering
as LogTape's default text formatter.


Docs
----

The docs of this package is available at
<https://logtape.org/manual/testing>. For the API references, see
<https://jsr.io/@logtape/testing>.
