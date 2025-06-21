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


Buffer sink
-----------

For testing purposes, you may want to collect log messages in memory.  Although
LogTape does not provide a built-in buffer sink, you can easily implement it:

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
