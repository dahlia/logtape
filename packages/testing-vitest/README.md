<!-- deno-fmt-ignore-file -->

Vitest integration for LogTape
==============================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/testing-vitest* provides a [Vitest] integration for [LogTape]'s
failure log reporter.  Import its `test` or `it` function instead of Vitest's
own helpers when you want logs emitted by a test callback to be reported only
when that callback fails.

[JSR badge]: https://jsr.io/badges/@logtape/testing-vitest
[JSR]: https://jsr.io/@logtape/testing-vitest
[npm badge]: https://img.shields.io/npm/v/@logtape/testing-vitest?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/testing-vitest
[Vitest]: https://vitest.dev/
[LogTape]: https://logtape.org/


Installation
------------

~~~~ sh
npm  add     @logtape/testing-vitest  # for npm
pnpm add     @logtape/testing-vitest  # for pnpm
yarn add     @logtape/testing-vitest  # for Yarn
bun  add     @logtape/testing-vitest  # for Bun
deno add jsr:@logtape/testing-vitest npm:vitest
~~~~

Use this package when your tests are run by Vitest.  If you use Deno's
built-in test runner instead of Vitest, use *@logtape/testing-deno* instead.


Usage
-----

~~~~ typescript
import { expect, test } from "@logtape/testing-vitest/autoload";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  expect(1 + 1).toBe(2);
  // Logs emitted here are printed only if this callback fails.
});
~~~~

The autoload entry point is the easiest setup for large suites.  It configures
the minimal LogTape `contextLocalStorage` needed by the failure log reporter
when LogTape has not been configured yet.  If your suite already configures
LogTape, that configuration must include `contextLocalStorage`; otherwise, use
`@logtape/testing-vitest` and manage setup explicitly from Vitest's
`setupFiles` option.

Set `LOGTAPE_TEST_MODE` to `on-failure`, `always`, or `never`, and
`LOGTAPE_TEST_LOWEST_LEVEL` to a LogTape level such as `debug` or `info` to
configure the default reporter used by the autoload `test` and `it` exports.

Use `createTest()` when a suite needs custom reporter options:

~~~~ typescript
import { createTest } from "@logtape/testing-vitest";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});
~~~~

Use `createVitest()` when existing test files import several Vitest helpers and
you want a namespace-like object:

~~~~ typescript
import { createVitest } from "@logtape/testing-vitest";

const { expect, test, vi } = createVitest({
  lowestLevel: "debug",
});

test("case", () => {
  expect(typeof vi.fn).toBe("function");
});
~~~~

The package preserves Vitest test options such as `retry`, `repeats`,
`timeout`, `concurrent`, `skip`, `only`, `todo`, `fails`, `tags`, and `meta`.
It also preserves shorthand helpers such as `test.skip()`, `test.todo()`,
`test.only()`, `test.fails()`, `test.concurrent()`, `test.sequential()`,
`test.skipIf()`, `test.runIf()`, `test.each()`, `test.for()`, and
`test.extend()`.  It exports a wrapped `it()` alias and `createIt()`.  Other
Vitest helpers, including `describe()`, `suite()`, `beforeAll()`,
`beforeEach()`, `afterEach()`, `afterAll()`, `aroundAll()`, `aroundEach()`,
`expect`, `expectTypeOf`, `vi`, `vitest`, `bench()`, `onTestFailed()`, and
`onTestFinished()`, are re-exported unchanged.

This package is ESM-only because Vitest cannot be synchronously imported from
CommonJS modules.


Docs
----

The docs of this package is available at
<https://logtape.org/manual/testing#vitest-integration>.
For the API references, see <https://jsr.io/@logtape/testing-vitest/doc>.
