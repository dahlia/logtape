Testing
=======

Here are some tips for testing your application or library with LogTape.


Reset configuration
-------------------

You can reset the configuration of LogTape to its initial state.  This is
useful when you want to reset the configuration between tests.  For example,
the following code shows how to reset the configuration after a test
(regardless of whether the test passes or fails) in Deno:

~~~~ typescript
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


Buffer sink
-----------

For testing purposes, you may want to collect log messages in memory.  Although
LogTape does not provide a built-in buffer sink, you can easily implement it:

~~~~ typescript
import { type LogRecord, configure } from "@logtape/logtape";

const buffer: LogRecord[] = [];

await configure({
  sinks: {
    buffer: buffer.push.bind(buffer),  // [!code highlight]
  },
  // Omitted for brevity
});
~~~~
