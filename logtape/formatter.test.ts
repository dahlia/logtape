import { assertEquals } from "@std/assert/assert-equals";
import { isDeno } from "which_runtime";
import { fatal, info } from "./fixtures.ts";
import {
  ansiColorFormatter,
  defaultConsoleFormatter,
  defaultTextFormatter,
} from "./formatter.ts";

Deno.test("defaultTextFormatter()", () => {
  assertEquals(
    defaultTextFormatter(info),
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    defaultTextFormatter(fatal),
    "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
});

Deno.test("ansiColorFormatter()", () => {
  console.log(JSON.stringify(ansiColorFormatter(info)));
  assertEquals(
    ansiColorFormatter(info),
    "\u001b[2m2023-11-14 22:13:20.000 +00\u001b[0m " +
      "\u001b[1m\u001b[32mINF\u001b[0m " +
      "\u001b[2mmy-app·junk:\u001b[0m " +
      (isDeno
        ? "Hello, \u001b[33m123\u001b[39m & \u001b[33m456\u001b[39m!\n"
        : "Hello, 123 & 456!\n"),
  );
  assertEquals(
    ansiColorFormatter(fatal),
    "\u001b[2m2023-11-14 22:13:20.000 +00\u001b[0m " +
      "\u001b[1m\u001b[35mFTL\u001b[0m " +
      "\u001b[2mmy-app·junk:\u001b[0m " +
      (isDeno
        ? "Hello, \u001b[33m123\u001b[39m & \u001b[33m456\u001b[39m!\n"
        : "Hello, 123 & 456!\n"),
  );
});

Deno.test("defaultConsoleFormatter()", () => {
  assertEquals(
    defaultConsoleFormatter(info),
    [
      "%c22:13:20.000 %cINF%c %cmy-app·junk %cHello, %o & %o!",
      "color: gray;",
      "background-color: white; color: black;",
      "background-color: default;",
      "color: gray;",
      "color: default;",
      123,
      456,
    ],
  );
});
