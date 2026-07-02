<!-- deno-fmt-ignore-file -->

Bun test runner integration for LogTape
=======================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/testing-bun* provides a [Bun test runner] integration for
[LogTape]'s failure log reporter.  Import its `test` function instead of
`bun:test` when you want logs emitted by a test callback to be reported only
when that callback fails.

[JSR badge]: https://jsr.io/badges/@logtape/testing-bun
[JSR]: https://jsr.io/@logtape/testing-bun
[npm badge]: https://img.shields.io/npm/v/@logtape/testing-bun?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/testing-bun
[Bun test runner]: https://bun.com/docs/test
[LogTape]: https://logtape.org/


Installation
------------

~~~~ sh
bun add @logtape/testing-bun
~~~~


Usage
-----

~~~~ typescript
import { test } from "@logtape/testing-bun/autoload";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).debug("Fixture state: {state}.", {
    state: "ready",
  });

  // Logs emitted here are printed only if this callback fails.
});
~~~~

The autoload entry point is the easiest setup for large suites.  It configures
the minimal LogTape `contextLocalStorage` needed by the failure log reporter
when LogTape has not been configured yet.  If your suite already configures
LogTape, that configuration must include `contextLocalStorage`; otherwise, use
`@logtape/testing-bun` and manage setup explicitly.

Use `createTest()` when a suite needs custom reporter options:

~~~~ typescript
import { createTest } from "@logtape/testing-bun";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});
~~~~

The package preserves Bun test options and shorthand helpers such as
`test.skip()`, `test.todo()`, `test.only()`, `test.if()`, `test.failing()`,
`test.concurrent()`, `test.serial()`, and `test.each()`.  It also exports a
wrapped `it()` alias and `createIt()`.  Other `bun:test` helpers, including
`describe()`, `beforeAll()`, `afterAll()`, `beforeEach()`, `afterEach()`,
`expect`, `expectTypeOf`, `mock()`, `spyOn()`, `jest`, `vi`, `xdescribe()`,
`xit()`, and `xtest()`, are re-exported unchanged.


Docs
----

The docs of this package is available at
<https://logtape.org/manual/testing#bun-test-runner-integration>.
For the API references, see <https://jsr.io/@logtape/testing-bun/doc>.
