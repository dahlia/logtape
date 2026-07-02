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
// @noErrors: 2307
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

~~~~ typescript twoslash
// @noErrors: 2307
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
  getLogger(["my-lib"]).debug("Fixture state: {state}", {
    state: "ready",
  });

  // Run assertions.  The debug log is printed only if this callback fails.
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
// @noErrors: 2307
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
