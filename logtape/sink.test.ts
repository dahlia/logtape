import { suite } from "@hongminhee/suite";
import { assertEquals } from "@std/assert/equals";
import { assertThrows } from "@std/assert/throws";
import makeConsoleMock from "consolemock";
import { debug, error, fatal, info, warning } from "./fixtures.ts";
import { defaultTextFormatter } from "./formatter.ts";
import type { LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";
import { getConsoleSink, getStreamSink, withFilter } from "./sink.ts";

const test = suite(import.meta);

test("withFilter()", () => {
  const buffer: LogRecord[] = [];
  const sink = withFilter(buffer.push.bind(buffer), "warning");
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  assertEquals(buffer, [warning, error, fatal]);
});

interface ConsoleMock extends Console {
  history(): unknown[];
}

test("getStreamSink()", async () => {
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
  await sink[Symbol.asyncDispose]();
  assertEquals(
    buffer,
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getConsoleSink()", () => {
  // @ts-ignore: consolemock is not typed
  const mock: ConsoleMock = makeConsoleMock();
  const sink = getConsoleSink({ console: mock });
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  assertEquals(mock.history(), [
    {
      DEBUG: [
        "%c22:13:20.000 %cDBG%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
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
        "%c22:13:20.000 %cINF%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
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
        "%c22:13:20.000 %cWRN%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: orange; color: black;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      ERROR: [
        "%c22:13:20.000 %cERR%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: red; color: white;",
        "background-color: default;",
        "color: gray;",
        "color: default;",
        123,
        456,
      ],
    },
    {
      ERROR: [
        "%c22:13:20.000 %cFTL%c %cmy-app·junk %cHello, %o & %o!",
        "color: gray;",
        "background-color: maroon; color: white;",
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

  // @ts-ignore: consolemock is not typed
  const mock2: ConsoleMock = makeConsoleMock();
  const sink2 = getConsoleSink({
    console: mock2,
    formatter: defaultTextFormatter,
  });
  sink2(debug);
  sink2(info);
  sink2(warning);
  sink2(error);
  sink2(fatal);
  assertEquals(mock2.history(), [
    {
      DEBUG: [
        "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      INFO: [
        "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      WARN: [
        "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      ERROR: [
        "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      ERROR: [
        "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!",
      ],
    },
  ]);

  // @ts-ignore: consolemock is not typed
  const mock3: ConsoleMock = makeConsoleMock();
  const sink3 = getConsoleSink({
    console: mock3,
    levelMap: {
      debug: "log",
      info: "log",
      warning: "log",
      error: "log",
      fatal: "log",
    },
    formatter: defaultTextFormatter,
  });
  sink3(debug);
  sink3(info);
  sink3(warning);
  sink3(error);
  sink3(fatal);
  assertEquals(mock3.history(), [
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!",
      ],
    },
    {
      LOG: [
        "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!",
      ],
    },
  ]);
});
