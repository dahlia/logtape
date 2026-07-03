<!-- deno-fmt-ignore-file -->

Node.js test runner integration for LogTape
===========================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/testing-node* provides a [Node.js test runner] integration for
[LogTape]'s failure log reporter.  Import its `test` function instead of
`node:test` when you want logs emitted by a test callback to be reported only
when that callback fails.

[JSR badge]: https://jsr.io/badges/@logtape/testing-node
[JSR]: https://jsr.io/@logtape/testing-node
[npm badge]: https://img.shields.io/npm/v/@logtape/testing-node?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/testing-node
[Node.js test runner]: https://nodejs.org/api/test.html
[LogTape]: https://logtape.org/


Installation
------------

~~~~ sh
npm  add     @logtape/testing-node  # for npm
pnpm add     @logtape/testing-node  # for pnpm
yarn add     @logtape/testing-node  # for Yarn
bun  add     @logtape/testing-node  # for Bun
~~~~


Usage
-----

~~~~ typescript
import { test } from "@logtape/testing-node/autoload";
import { getLogger } from "@logtape/logtape";

test("case", async () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // The info log is printed only if this callback fails.
});
~~~~

The autoload entry point is the easiest setup for large suites.  It configures
the minimal LogTape `contextLocalStorage` needed by the failure log reporter
when LogTape has not been configured yet.  If your suite already configures
LogTape, that configuration must include `contextLocalStorage`; otherwise, use
`@logtape/testing-node` and manage setup explicitly.

Set `LOGTAPE_TEST_MODE` to `on-failure`, `always`, or `never`, and
`LOGTAPE_TEST_LOWEST_LEVEL` to a LogTape level such as `debug` or `info` to
configure the default reporter used by the autoload `test` and `it` exports.

Use `createTest()` when a suite needs custom reporter options:

~~~~ typescript
import { createTest } from "@logtape/testing-node";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});
~~~~

The package preserves Node.js test options and shorthand helpers such as
`test.only()`, `test.skip()`, and `test.todo()`.  It also exports a wrapped
`it()` alias and `createIt()`.  Other `node:test` helpers, including
`describe()`, `before()`, `after()`, `beforeEach()`, and `afterEach()`, are
re-exported unchanged.


Docs
----

The docs of this package is available at
<https://logtape.org/manual/testing#node-js-test-runner-integration>.
For the API references, see <https://jsr.io/@logtape/testing-node/doc>.
