import { assertEquals } from "@std/assert/assert-equals";
import { fatal, info } from "./fixtures.ts";
import { defaultConsoleFormatter, defaultTextFormatter } from "./formatter.ts";

Deno.test("defaultTextFormatter()", () => {
  assertEquals(
    defaultTextFormatter(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] Hello, 123 & 456!\n",
  );
  assertEquals(
    defaultTextFormatter(fatal),
    "2023-11-14 22:13:20.000 +00:00 [FTL] Hello, 123 & 456!\n",
  );
});

Deno.test("defaultConsoleFormatter()", () => {
  assertEquals(
    defaultConsoleFormatter(info),
    [
      "%cINFO%c %cmy-app·junk %cHello, %o & %o!",
      "background-color: white; color: black;",
      "background-color: default;",
      "color: gray;",
      "color: default;",
      123,
      456,
    ],
  );
});
