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

~~~~ typescript twoslash
// @noErrors: 2307
import { configure, getLogger, reset } from "@logtape/logtape";
import { createLogRecorder } from "@logtape/testing";

const recorder = createLogRecorder();

try {
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

  getLogger(["my-lib"]).info("User {userId} logged in.", {
    userId: 123,
  });

  recorder.assertLogged({  // [!code highlight]
    category: ["my-lib"],
    level: "info",
    message: "User 123 logged in.",
    properties: { userId: 123 },
  });
} finally {
  await reset();
}
~~~~

The recorder stores records in sink call order.  It provides `records`,
`clear()`, `take()`, `find()`, `filter()`, `assertLogged()`, and
`assertNotLogged()`.  Matchers can check category, category prefix, level,
rendered message, raw message, and a shallow partial set of structured
properties.  Most property values are compared with `Object.is()`, while
`Date` values are compared by timestamp.  Rendered message matching uses the
same value rendering as LogTape's default text formatter.  Use a property
predicate when a test needs absence checks or deep matching.

`createLogRecorder()` is a synchronous sink.  If a log call uses async lazy
properties, await the log call before asserting.  If your test also uses async
sinks, still call `await dispose()` or `await reset()` as usual.

[*@logtape/testing*]: https://jsr.io/@logtape/testing


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
