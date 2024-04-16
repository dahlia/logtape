import { assertThrows } from "@std/assert";
import { delay } from "@std/async";
import { assertSnapshot } from "@std/testing/snapshot";
import makeConsoleMock from "consolemock";
import { debug, error, fatal, info, warning } from "./fixtures.ts";
import { defaultConsoleFormatter } from "./formatter.ts";
import type { LogLevel } from "./record.ts";
import { getConsoleSink, getStreamSink } from "./sink.ts";

interface ConsoleMock extends Console {
  history(): unknown[];
}

Deno.test("getStreamSink()", async (t) => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk) {
        buffer += decoder.decode(chunk);
        return Promise.resolve();
      },
    }),
  );
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  await delay(100);
  await assertSnapshot(t, buffer);
});

Deno.test("getConsoleSink()", async (t) => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink(defaultConsoleFormatter, mock);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  await assertSnapshot(t, mock.history());

  assertThrows(
    () => sink({ ...info, level: "invalid" as LogLevel }),
    TypeError,
    "Invalid log level: invalid.",
  );
});
