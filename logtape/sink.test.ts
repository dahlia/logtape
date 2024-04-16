import { assertEquals } from "@std/assert/assert-equals";
import { assertThrows } from "@std/assert/assert-throws";
import { delay } from "@std/async/delay";
import makeConsoleMock from "consolemock";
import { debug, error, fatal, info, warning } from "./fixtures.ts";
import { defaultConsoleFormatter } from "./formatter.ts";
import type { LogLevel } from "./record.ts";
import { getConsoleSink, getStreamSink } from "./sink.ts";

interface ConsoleMock extends Console {
  history(): unknown[];
}

Deno.test("getStreamSink()", async () => {
  let buffer: string = "";
  const decoder = new TextDecoder();
  const sink = getStreamSink(
    new WritableStream({
      write(chunk: Uint8Array) {
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
  assertEquals(
    buffer,
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] Hello, 123 & 456!
`,
  );
});

Deno.test("getConsoleSink()", () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink(defaultConsoleFormatter, mock);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  assertEquals(mock.history(), [
    {
      DEBUG: [
        "%cDEBUG%c %cmy-app·junk %cHello, %o & %o!",
        "background-color: gray; color: white;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      INFO: [
        "%cINFO%c %cmy-app·junk %cHello, %o & %o!",
        "background-color: white; color: black;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      WARN: [
        "%cWARNING%c %cmy-app·junk %cHello, %o & %o!",
        "background-color: orange;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      ERROR: [
        "%cERROR%c %cmy-app·junk %cHello, %o & %o!",
        "background-color: red;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      ERROR: [
        "%cFATAL%c %cmy-app·junk %cHello, %o & %o!",
        "background-color: maroon;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
  ]);

  assertThrows(
    () => sink({ ...info, level: "invalid" as LogLevel }),
    TypeError,
    "Invalid log level: invalid.",
  );
});
