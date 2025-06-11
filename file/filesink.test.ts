import { isDeno } from "@david/which-runtime";
import { suite } from "@hongminhee/suite";
import type { Sink } from "@logtape/logtape";
import { assertEquals } from "@std/assert/equals";
import { assertThrows } from "@std/assert/throws";
import { join } from "@std/path/join";
import { getFileSink, getRotatingFileSink } from "#filesink";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { debug, error, fatal, info, warning } from "../logtape/fixtures.ts";
import { type FileSinkDriver, getBaseFileSink } from "./filesink.base.ts";

const test = suite(import.meta);

function makeTempFileSync(): string {
  return join(fs.mkdtempSync(join(tmpdir(), "logtape-")), "logtape.txt");
}

test("getBaseFileSink()", () => {
  const path = makeTempFileSync();
  let sink: Sink & Disposable;
  if (isDeno) {
    const driver: FileSinkDriver<Deno.FsFile> = {
      openSync(path: string) {
        return Deno.openSync(path, { create: true, append: true });
      },
      writeSync(fd, chunk) {
        fd.writeSync(chunk);
      },
      flushSync(fd) {
        fd.syncSync();
      },
      closeSync(fd) {
        fd.close();
      },
    };
    sink = getBaseFileSink(path, driver);
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink = getBaseFileSink(path, driver);
  }
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getBaseFileSink() with lazy option", () => {
  const pathDir = fs.mkdtempSync(join(tmpdir(), "logtape-"));
  const path = join(pathDir, "test.log");
  let sink: Sink & Disposable;
  if (isDeno) {
    const driver: FileSinkDriver<Deno.FsFile> = {
      openSync(path: string) {
        return Deno.openSync(path, { create: true, append: true });
      },
      writeSync(fd, chunk) {
        fd.writeSync(chunk);
      },
      flushSync(fd) {
        fd.syncSync();
      },
      closeSync(fd) {
        fd.close();
      },
    };
    sink = getBaseFileSink(path, { ...driver, lazy: true });
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink = getBaseFileSink(path, { ...driver, lazy: true });
  }
  if (isDeno) {
    assertThrows(
      () => Deno.lstatSync(path),
      Deno.errors.NotFound,
    );
  } else {
    assertEquals(fs.existsSync(path), false);
  }
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getFileSink()", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getFileSink(path);
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getRotatingFileSink()", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 150,
  });
  sink(debug);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink(info);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(warning);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(error);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
`,
  );
  assertEquals(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(fatal);
  sink[Symbol.dispose]();
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
  assertEquals(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
`,
  );
  assertEquals(
    fs.readFileSync(`${path}.2`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  const dirPath = fs.mkdtempSync(join(tmpdir(), "logtape-"));
  const path2 = join(dirPath, "log");
  const sink2: Sink & Disposable = getRotatingFileSink(path2, {
    maxSize: 150,
  });
  sink2(debug);
  assertEquals(
    fs.readFileSync(path2, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink2[Symbol.dispose]();
});

// cSpell: ignore filesink
