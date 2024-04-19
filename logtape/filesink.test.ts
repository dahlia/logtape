import { assertEquals } from "@std/assert/assert-equals";
import { getFileSink, getRotatingFileSink } from "./filesink.deno.ts";
import { debug, error, fatal, info, warning } from "./fixtures.ts";
import type { Sink } from "./sink.ts";

Deno.test("getFileSink()", () => {
  const path = Deno.makeTempFileSync();
  const sink: Sink & Disposable = getFileSink(path);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();
  assertEquals(
    Deno.readTextFileSync(path),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

Deno.test("getRotatingFileSink()", () => {
  const path = Deno.makeTempFileSync();
  console.debug({ path });
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 150,
  });
  sink(debug);
  assertEquals(
    Deno.readTextFileSync(path),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink(info);
  assertEquals(
    Deno.readTextFileSync(path),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(warning);
  assertEquals(
    Deno.readTextFileSync(path),
    "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    Deno.readTextFileSync(`${path}.1`),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(error);
  assertEquals(
    Deno.readTextFileSync(path),
    `\
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
`,
  );
  assertEquals(
    Deno.readTextFileSync(`${path}.1`),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(fatal);
  sink[Symbol.dispose]();
  assertEquals(
    Deno.readTextFileSync(path),
    "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    Deno.readTextFileSync(`${path}.1`),
    `\
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
`,
  );
  assertEquals(
    Deno.readTextFileSync(`${path}.2`),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
});

// cSpell: ignore filesink
