Testing
=======

Here are some tips for testing your application or library with LogTape.


Reset configuration
-------------------

You can reset the configuration of LogTape to its initial state.  This is
useful when you want to reset the configuration between tests.  For example,
the following code shows how to reset the configuration after a test
(regardless of whether the test passes or fails):

::: code-group

~~~~ typescript [Deno] twoslash
// @noErrors: 2345
import { configure, reset } from "@logtape/logtape";

Deno.test("my test", async (t) => {
  await t.step("set up", async () => {
    await configure({ /* ... */ });
  });

  await t.step("run test", () => {
    // Run the test
  });

  await t.step("tear down", async () => {
    await reset();  // [!code highlight]
  });
});
~~~~

~~~~ typescript [Node.js] twoslash
// @noErrors: 2345
import { configure, reset } from "@logtape/logtape";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("my test", async (t) => {
  beforeEach(async () => {
    await configure({ /* ... */ });
  });

  afterEach(async () => {
    await reset();  // [!code highlight]
  });

  it("is a sub-test", () => {
    // Run the test
  });
});
~~~~

:::


Log recorder
------------

*This API is available since LogTape 2.2.0.*

For testing purposes, you may want to collect log records in memory and assert
on them.  The [*@logtape/testing*] package provides `createLogRecorder()` for
this:

::: code-group

~~~~ bash [Deno]
deno add jsr:@logtape/testing
~~~~

~~~~ bash [npm]
npm add @logtape/testing
~~~~

~~~~ bash [pnpm]
pnpm add @logtape/testing
~~~~

~~~~ bash [Yarn]
yarn add @logtape/testing
~~~~

~~~~ bash [Bun]
bun add @logtape/testing
~~~~

:::

~~~~ typescript twoslash
import { after, before, test } from "node:test";
import { configure, getLogger, reset } from "@logtape/logtape";
import { createLogRecorder } from "@logtape/testing/recorder";

const recorder = createLogRecorder();

before(async () => {
  await configure({
    sinks: {
      recorder: recorder.sink,  // [!code highlight]
    },
    loggers: [
      {
        category: ["my-lib"],
        lowestLevel: "debug",
        sinks: ["recorder"],
      },
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
});

after(reset);

test("case", () => {
  getLogger(["my-lib"]).info("User {userId} logged in.", {
    userId: 123,
  });

  recorder.assertLogged({  // [!code highlight]
    category: ["my-lib"],
    level: "info",
    message: "User 123 logged in.",
    properties: { userId: 123 },
  });
});
~~~~

The recorder stores records in sink call order.  It snapshots lazy callback
messages when the sink receives them, so assertions see the same message a
normal sink would observe at emit time.  The `records` property returns a
snapshot, and the recorder also provides `clear()`, `take()`, `find()`,
`filter()`, `assertLogged()`, and `assertNotLogged()`.  Matchers can check
category, category prefix, level, rendered message, raw message, and a shallow
partial set of structured properties.  Most property values are compared with
`Object.is()`, `Date` values are compared by timestamp, and regular expression
matcher values match string property values.  Rendered message matching uses
the same value rendering as LogTape's default text formatter.  Use a property
predicate when a test needs absence checks or deep matching.

`createLogRecorder()` is a synchronous sink.  If a log call uses async lazy
properties, await the log call before asserting.  If your test also uses async
sinks, still call `await dispose()` or `await reset()` as usual.

[*@logtape/testing*]: https://jsr.io/@logtape/testing


Failure log reporter
--------------------

*This API is available since LogTape 2.3.0.*

When logs are useful only after a test fails, use
`createFailureLogReporter()` from the [*@logtape/testing*] package.  It
buffers records while the wrapped callback runs, discards them when the
callback succeeds, and reports them to a sink when the callback throws or
rejects:

> [!TIP]
> If your tests use Bun's built-in `bun:test` runner, Deno's built-in test
> runner, Node.js' built-in `node:test` runner, or Vitest, prefer the
> [*Bun test runner integration*](#bun-test-runner-integration),
> [*Deno test runner integration*](#deno-test-runner-integration),
> [*Node.js test runner integration*](#node-js-test-runner-integration), or
> [*Vitest integration*](#vitest-integration).  They wrap the runner directly,
> preserve runner options, and avoid wrapping each callback by hand.

~~~~ typescript twoslash
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, test } from "node:test";
import { configure, getLogger, reset } from "@logtape/logtape";
import { createFailureLogReporter } from "@logtape/testing/reporter";

const reporter = createFailureLogReporter({
  lowestLevel: "debug",
});

before(async () => {
  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
});

after(reset);

test("case", reporter.wrap(async () => {
  getLogger(["my-lib"]).info("Fixture state: {state}", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this callback fails.
}));
~~~~

The reporter uses scoped configuration, so it does not call `configure()` or
`reset()` for each wrapped callback and does not mutate process-wide logger
routing while a test is running.  The process-wide configuration still must
provide `~Config.contextLocalStorage`, because scoped configuration needs it to
isolate the callback's logging policy.

Use `~FailureLogReporter.wrap()` when passing a callback to a test runner.  It
preserves callback parameters such as a test context or fixtures, and it always
returns an async callback.  Use `~FailureLogReporter.run()` when you want to
invoke the callback directly:

~~~~ typescript twoslash
import { createFailureLogReporter } from "@logtape/testing/reporter";

const reporter = createFailureLogReporter({
  lowestLevel: "debug",
  mode: "on-failure",
});

await reporter.run(async () => {
  // Logs emitted here are reported only if this callback fails.
});
~~~~

Set `mode: "always"` to report buffered records even when the callback passes,
or `mode: "never"` to suppress reporting while keeping the shared wrapper in
place.  By default the reporter writes formatted records to the console; pass
`sink` to report records elsewhere, or `formatter` to customize the default
console output.


Deno test runner integration
----------------------------

*This API is available since LogTape 2.3.0.*

For larger Deno test suites, use the [*@logtape/testing-deno*] package instead
of wrapping every test callback manually.  It exports a `test` function
compatible with Deno's built-in `Deno.test()` runner:

~~~~ bash
deno add jsr:@logtape/testing-deno
~~~~

[*@logtape/testing-deno*]: https://jsr.io/@logtape/testing-deno

### Autoload entry point

The easiest way to adopt the integration in a large Deno suite is to import
the autoload entry point.  It configures the minimal
`~Config.contextLocalStorage` needed by the failure log reporter when LogTape
has not been configured yet:

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-deno/autoload";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

The autoload entry point leaves an existing LogTape configuration alone when
that configuration already provides `~Config.contextLocalStorage`.  If LogTape
has already been configured without `~Config.contextLocalStorage`, autoload
throws an error instead of replacing the existing configuration.

### Shared preload module

If you prefer explicit setup, import from `@logtape/testing-deno` and configure
LogTape once from a shared setup module.  One option is to preload that module
for the test run:

~~~~ typescript [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {},
  loggers: [
    { category: ["logtape", "meta"], sinks: [] },
  ],
});
~~~~

~~~~ bash
deno test --preload ./test/setup-logtape.ts
~~~~

Each test file can then import from `@logtape/testing-deno` without adding
per-file setup steps:

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-deno";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

### Top-level setup function

If you cannot use `--preload`, put the shared setup in a function and call it
once at the top level of each test file:

~~~~ typescript [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

let configured = false;

export async function setupLogTape(): Promise<void> {
  if (configured) return;
  configured = true;

  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
}
~~~~

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-deno";
import { getLogger } from "@logtape/logtape";
import { setupLogTape } from "./setup-logtape.ts";

await setupLogTape();

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.");

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

Use `createTest()` to configure the underlying failure log reporter:

~~~~ typescript
import { createTest } from "@logtape/testing-deno";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});

test("case", () => {
  // Logs emitted here are reported only if this callback fails.
});
~~~~

The adapter preserves Deno test options such as `ignore`, `only`,
`permissions`, `sanitizeOps`, `sanitizeResources`, `sanitizeExit`, and
`timeout`; passes them through to `Deno.test()`; and wraps only the callback.
It also preserves shorthand helpers such as `test.ignore()`, `test.only()`,
and `test.each()`, wraps `TestContext.step()` callbacks, and re-exports Deno
test hooks such as `beforeAll()`, `beforeEach()`, `afterEach()`, `afterAll()`,
and `sanitizer()` unchanged.

As with `createFailureLogReporter()`, the process-wide LogTape configuration
must provide `~Config.contextLocalStorage`.


Bun test runner integration
---------------------------

*This API is available since LogTape 2.3.0.*

For larger Bun test suites, use the [*@logtape/testing-bun*] package instead
of wrapping every test callback manually.  It exports a `test` function
compatible with Bun's built-in `bun:test` runner:

~~~~ bash
bun add @logtape/testing-bun
~~~~

[*@logtape/testing-bun*]: https://jsr.io/@logtape/testing-bun

### Autoload entry point

The easiest way to adopt the integration in a large Bun suite is to import the
autoload entry point.  It configures the minimal `~Config.contextLocalStorage`
needed by the failure log reporter when LogTape has not been configured yet:

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-bun/autoload";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

The autoload entry point leaves an existing LogTape configuration alone when
that configuration already provides `~Config.contextLocalStorage`.  If LogTape
has already been configured without `~Config.contextLocalStorage`, autoload
throws an error instead of replacing the existing configuration.

### Shared preload module

If you prefer explicit setup, import from `@logtape/testing-bun` and configure
LogTape once from a shared setup module.  One option is to preload that module
for the test run:

~~~~ typescript [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {},
  loggers: [
    { category: ["logtape", "meta"], sinks: [] },
  ],
});
~~~~

~~~~ bash
bun test --preload ./test/setup-logtape.ts
~~~~

Each test file can then import from `@logtape/testing-bun` without adding
per-file setup hooks:

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-bun";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

### Top-level setup function

If you cannot use `--preload`, put the shared setup in a function and call it
once at the top level of each test file:

~~~~ typescript [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

let configured = false;

export async function setupLogTape(): Promise<void> {
  if (configured) return;
  configured = true;

  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
}
~~~~

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-bun";
import { getLogger } from "@logtape/logtape";
import { setupLogTape } from "./setup-logtape.ts";

await setupLogTape();

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.");

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

Use `createTest()` to configure the underlying failure log reporter:

~~~~ typescript
import { createTest } from "@logtape/testing-bun";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});

test("case", () => {
  // Logs emitted here are reported only if this callback fails.
});
~~~~

The adapter preserves Bun test options such as `retry`, `repeats`, and
`timeout`; passes them through to `bun:test`; and wraps only the callback.  It
also preserves shorthand helpers such as `test.skip()`, `test.todo()`,
`test.only()`, `test.if()`, `test.skipIf()`, `test.todoIf()`,
`test.failing()`, `test.concurrent()`, `test.serial()`, and `test.each()`,
supports callback-style tests, and exports a wrapped `it()` alias with
`createIt()` for custom reporter options.  Other `bun:test` helpers, including
`describe()`, `beforeAll()`, `afterAll()`, `beforeEach()`, `afterEach()`,
`expect`, `expectTypeOf`, `mock()`, `spyOn()`, `jest`, `vi`, `xdescribe()`,
`xit()`, and `xtest()`, are re-exported unchanged.

As with `createFailureLogReporter()`, the process-wide LogTape configuration
must provide `~Config.contextLocalStorage`.


Node.js test runner integration
-------------------------------

*This API is available since LogTape 2.3.0.*

For larger Node.js test suites, use the [*@logtape/testing-node*] package
instead of wrapping every test callback manually.  It exports a `test` function
compatible with Node.js' built-in `node:test` runner:

::: code-group

~~~~ bash [npm]
npm add @logtape/testing-node
~~~~

~~~~ bash [pnpm]
pnpm add @logtape/testing-node
~~~~

~~~~ bash [Yarn]
yarn add @logtape/testing-node
~~~~

~~~~ bash [Bun]
bun add @logtape/testing-node
~~~~

:::

[*@logtape/testing-node*]: https://jsr.io/@logtape/testing-node

### Autoload entry point

The easiest way to adopt the integration in a large suite is to import the
autoload entry point.  It configures the minimal `~Config.contextLocalStorage`
needed by the failure log reporter when LogTape has not been configured yet:

~~~~ typescript twoslash [test/user.test.ts]
import { test } from "@logtape/testing-node/autoload";
import { getLogger } from "@logtape/logtape";

test("case", async () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

The autoload entry point leaves an existing LogTape configuration alone when
that configuration already provides `~Config.contextLocalStorage`.  If LogTape
has already been configured without `~Config.contextLocalStorage`, autoload
throws an error instead of replacing the existing configuration.

### Shared preload module

If you prefer explicit setup, import from `@logtape/testing-node` and configure
LogTape once from a shared setup module.  One option is to preload that module
for the test run:

~~~~ javascript [test/setup-logtape.mjs]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {},
  loggers: [
    { category: ["logtape", "meta"], sinks: [] },
  ],
});
~~~~

~~~~ bash
node --import ./test/setup-logtape.mjs --test
~~~~

Each test file can then import from `@logtape/testing-node` without adding
per-file setup hooks:

~~~~ typescript twoslash [test/user.test.ts]
import { test } from "@logtape/testing-node";
import { getLogger } from "@logtape/logtape";

test("case", async () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

The setup module is loaded once per test process.  With Node.js' default test
isolation, that usually means each test file gets its own configured process
without repeating `before()` and `after()` in every file.  If your runner setup
reuses one long-lived process, such as a custom watch workflow, call `reset()`
from that shared lifecycle instead.

### Top-level setup function

If you cannot use `--import`, put the shared setup in a function and call it
once at the top level of each test file:

~~~~ typescript twoslash [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

let configured = false;

export async function setupLogTape(): Promise<void> {
  if (configured) return;
  configured = true;

  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
}
~~~~

~~~~ typescript [test/user.test.ts]
import { test } from "@logtape/testing-node";
import { getLogger } from "@logtape/logtape";
import { setupLogTape } from "./setup-logtape.ts";

await setupLogTape();

test("case", async () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.");

  // Run assertions.  The info log is printed only if this test fails.
});
~~~~

Use `createTest()` to configure the underlying failure log reporter:

~~~~ typescript twoslash
import { createTest } from "@logtape/testing-node";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});

test("case", async () => {
  // Logs emitted here are reported only if this callback fails.
});
~~~~

The adapter preserves Node.js test options such as `concurrency`, `signal`,
`skip`, `tags`, `timeout`, and `plan`; passes them through to `node:test`; and
wraps only the callback.  It also preserves shorthand helpers such as
`test.only()`, `test.skip()`, and `test.todo()`, supports callback-style tests,
and exports a wrapped `it()` alias with `createIt()` for custom reporter
options.  Other `node:test` helpers, including `describe()`, `before()`,
`after()`, `beforeEach()`, and `afterEach()`, are re-exported unchanged.

As with `createFailureLogReporter()`, the process-wide LogTape configuration
must provide `~Config.contextLocalStorage`.


Vitest integration
------------------

*This API is available since LogTape 2.3.0.*

For larger Vitest suites, use the [*@logtape/testing-vitest*] package instead
of wrapping every test callback manually.  It exports `test` and `it`
functions compatible with Vitest:

::: code-group

~~~~ bash [npm]
npm add @logtape/testing-vitest
~~~~

~~~~ bash [pnpm]
pnpm add @logtape/testing-vitest
~~~~

~~~~ bash [Yarn]
yarn add @logtape/testing-vitest
~~~~

~~~~ bash [Bun]
bun add @logtape/testing-vitest
~~~~

~~~~ bash [Deno]
deno add jsr:@logtape/testing-vitest npm:vitest
~~~~

:::

Use this package when your tests are run by Vitest.  If you use Deno's
built-in test runner instead of Vitest, use
[*Deno test runner integration*](#deno-test-runner-integration).

[*@logtape/testing-vitest*]: https://jsr.io/@logtape/testing-vitest

### Autoload entry point

The easiest way to adopt the integration in a large suite is to import the
autoload entry point.  It configures the minimal `~Config.contextLocalStorage`
needed by the failure log reporter when LogTape has not been configured yet:

~~~~ typescript [test/user.test.ts]
import { test, expect } from "@logtape/testing-vitest/autoload";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  expect(1 + 1).toBe(2);
  // The info log is printed only if this test fails.
});
~~~~

The autoload entry point leaves an existing LogTape configuration alone when
that configuration already provides `~Config.contextLocalStorage`.  If LogTape
has already been configured without `~Config.contextLocalStorage`, autoload
throws an error instead of replacing the existing configuration.

### Shared setup file

If you prefer explicit setup, import from `@logtape/testing-vitest` and
configure LogTape once from a shared setup file.  Add that file to Vitest's
`setupFiles` option so it runs before every test file in the same test
process:

~~~~ typescript [vitest.config.ts]
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup-logtape.ts"],
  },
});
~~~~

~~~~ typescript [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {},
  loggers: [
    { category: ["logtape", "meta"], sinks: [] },
  ],
});
~~~~

Each test file can then import from `@logtape/testing-vitest` without adding
per-file setup hooks:

~~~~ typescript [test/user.test.ts]
import { test, expect } from "@logtape/testing-vitest";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.", {
    state: "ready",
  });

  expect(1 + 1).toBe(2);
  // The info log is printed only if this test fails.
});
~~~~

Vitest's `globalSetup` runs in a different global scope than test workers, so
it is not the right place for this in-process LogTape configuration.  Use
`setupFiles` when you want the configuration available to test callbacks in
the same process.

### Top-level setup function

If you cannot use Vitest's `setupFiles` option, put the shared setup in a
function and call it once at the top level of each test file:

~~~~ typescript [test/setup-logtape.ts]
import { AsyncLocalStorage } from "node:async_hooks";
import { configure } from "@logtape/logtape";

let configured = false;

export async function setupLogTape(): Promise<void> {
  if (configured) return;
  configured = true;

  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
}
~~~~

~~~~ typescript [test/user.test.ts]
import { test, expect } from "@logtape/testing-vitest";
import { getLogger } from "@logtape/logtape";
import { setupLogTape } from "./setup-logtape.ts";

await setupLogTape();

test("case", () => {
  getLogger(["my-lib"]).info("Fixture state: {state}.");

  expect(1 + 1).toBe(2);
  // The info log is printed only if this test fails.
});
~~~~

Use `createTest()` to configure the underlying failure log reporter:

~~~~ typescript
import { createTest, expect } from "@logtape/testing-vitest";

const test = createTest({
  lowestLevel: "debug",
  mode: "on-failure",
});

test("case", () => {
  expect(1 + 1).toBe(2);
  // Logs emitted here are reported only if this callback fails.
});
~~~~

Use `createVitest()` when you want a namespace-like object with wrapped
`test()` and `it()` functions plus the usual Vitest helpers:

~~~~ typescript
import { createVitest } from "@logtape/testing-vitest";

const { test, expect, vi } = createVitest({
  lowestLevel: "debug",
});

test("case", () => {
  expect(typeof vi.fn).toBe("function");
});
~~~~

The adapter preserves Vitest test options such as `retry`, `repeats`,
`timeout`, `concurrent`, `skip`, `only`, `todo`, `fails`, `tags`, and `meta`;
passes them through to Vitest; and wraps only the callback.  It also preserves
shorthand helpers such as `test.skip()`, `test.todo()`, `test.only()`,
`test.fails()`, `test.concurrent()`, `test.sequential()`, `test.skipIf()`,
`test.runIf()`, `test.each()`, `test.for()`, and `test.extend()`, and exports
a wrapped `it()` alias with `createIt()` for custom reporter options.  Other
Vitest helpers, including `describe()`, `suite()`, `beforeAll()`,
`beforeEach()`, `afterEach()`, `afterAll()`, `aroundAll()`, `aroundEach()`,
`expect`, `expectTypeOf`, `vi`, `vitest`, `bench()`, `onTestFailed()`, and
`onTestFinished()`, are re-exported unchanged.

As with `createFailureLogReporter()`, the process-wide LogTape configuration
must provide `~Config.contextLocalStorage`.


Buffer sink
-----------

For very small tests that only need raw `LogRecord` objects, you can still
implement a buffer sink directly:

~~~~ typescript twoslash
// @noErrors: 2345
import { type LogRecord, configure } from "@logtape/logtape";

const buffer: LogRecord[] = [];

await configure({
  sinks: {
    buffer: buffer.push.bind(buffer),  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~
