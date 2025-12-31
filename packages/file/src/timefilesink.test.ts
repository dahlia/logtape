import { suite } from "@alinea/suite";
import { isDeno } from "@david/which-runtime";
import type { Sink } from "@logtape/logtape";
import { assertEquals } from "@std/assert/equals";
import { delay } from "@std/async/delay";
import { join } from "@std/path/join";
import fs from "node:fs";
import { tmpdir } from "node:os";
import {
  debug,
  error,
  fatal,
  info,
  warning,
} from "../../logtape/src/fixtures.ts";
import { promisify } from "node:util";
import {
  type AsyncTimeRotatingFileSinkDriver,
  getBaseTimeRotatingFileSink,
  getDefaultFilename,
  getISOWeek,
  getISOWeekYear,
  type TimeRotatingFileSinkDriver,
} from "./timefilesink.ts";

const test = suite(import.meta);

function makeTempDirSync(): string {
  return fs.mkdtempSync(join(tmpdir(), "logtape-time-"));
}

function getDenoDriver(): TimeRotatingFileSinkDriver<Deno.FsFile> {
  return {
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
    readdirSync(path: string) {
      return [...Deno.readDirSync(path)].map((entry) => entry.name);
    },
    unlinkSync(path: string) {
      Deno.removeSync(path);
    },
    mkdirSync(path: string, options?: { recursive?: boolean }) {
      Deno.mkdirSync(path, options);
    },
    joinPath: join,
  };
}

function getNodeDriver(): TimeRotatingFileSinkDriver<number> {
  return {
    openSync(path: string) {
      return fs.openSync(path, "a");
    },
    writeSync: fs.writeSync,
    flushSync: fs.fsyncSync,
    closeSync: fs.closeSync,
    readdirSync: fs.readdirSync as (path: string) => string[],
    unlinkSync: fs.unlinkSync,
    mkdirSync: fs.mkdirSync,
    joinPath: join,
  };
}

function getDriver(): TimeRotatingFileSinkDriver<Deno.FsFile | number> {
  return isDeno
    ? getDenoDriver() as TimeRotatingFileSinkDriver<Deno.FsFile | number>
    : getNodeDriver() as TimeRotatingFileSinkDriver<Deno.FsFile | number>;
}

function getDenoAsyncDriver(): AsyncTimeRotatingFileSinkDriver<Deno.FsFile> {
  return {
    ...getDenoDriver(),
    async flush(fd) {
      await fd.sync();
    },
    close(fd) {
      return Promise.resolve(fd.close());
    },
  };
}

function getNodeAsyncDriver(): AsyncTimeRotatingFileSinkDriver<number> {
  return {
    ...getNodeDriver(),
    flush: promisify(fs.fsync),
    close: promisify(fs.close),
  };
}

function getAsyncDriver(): AsyncTimeRotatingFileSinkDriver<
  Deno.FsFile | number
> {
  return isDeno
    ? getDenoAsyncDriver() as AsyncTimeRotatingFileSinkDriver<
      Deno.FsFile | number
    >
    : getNodeAsyncDriver() as AsyncTimeRotatingFileSinkDriver<
      Deno.FsFile | number
    >;
}

test("getISOWeek()", () => {
  // 2025-01-01 is in week 1
  assertEquals(getISOWeek(new Date(2025, 0, 1)), 1);
  // 2024-12-31 is in week 1 of 2025
  assertEquals(getISOWeek(new Date(2024, 11, 31)), 1);
  // 2024-12-30 is in week 1 of 2025
  assertEquals(getISOWeek(new Date(2024, 11, 30)), 1);
  // 2024-12-29 is in week 52 of 2024
  assertEquals(getISOWeek(new Date(2024, 11, 29)), 52);
});

test("getISOWeekYear()", () => {
  // 2025-01-01 is in ISO week year 2025
  assertEquals(getISOWeekYear(new Date(2025, 0, 1)), 2025);
  // 2024-12-31 is in ISO week year 2025
  assertEquals(getISOWeekYear(new Date(2024, 11, 31)), 2025);
  // 2024-12-30 is in ISO week year 2025
  assertEquals(getISOWeekYear(new Date(2024, 11, 30)), 2025);
  // 2024-12-29 is in ISO week year 2024
  assertEquals(getISOWeekYear(new Date(2024, 11, 29)), 2024);
});

test("getDefaultFilename() with daily interval", () => {
  const fn = getDefaultFilename("daily");
  assertEquals(fn(new Date(2025, 0, 15)), "2025-01-15.log");
  assertEquals(fn(new Date(2025, 11, 31)), "2025-12-31.log");
});

test("getDefaultFilename() with hourly interval", () => {
  const fn = getDefaultFilename("hourly");
  assertEquals(fn(new Date(2025, 0, 15, 9, 30)), "2025-01-15-09.log");
  assertEquals(fn(new Date(2025, 11, 31, 23, 59)), "2025-12-31-23.log");
});

test("getDefaultFilename() with weekly interval", () => {
  const fn = getDefaultFilename("weekly");
  assertEquals(fn(new Date(2025, 0, 1)), "2025-W01.log");
  assertEquals(fn(new Date(2024, 11, 31)), "2025-W01.log"); // ISO week 1 of 2025
  assertEquals(fn(new Date(2024, 11, 29)), "2024-W52.log"); // ISO week 52 of 2024
});

test("getBaseTimeRotatingFileSink() with daily interval", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    interval: "daily",
  });

  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();

  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const today = new Date();
  const expectedFilename = getDefaultFilename("daily")(today);
  assertEquals(files[0], expectedFilename);

  const content = fs.readFileSync(join(directory, expectedFilename), "utf-8");
  assertEquals(
    content,
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getBaseTimeRotatingFileSink() with hourly interval", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    interval: "hourly",
  });

  sink(debug);
  sink(info);
  sink[Symbol.dispose]();

  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const now = new Date();
  const expectedFilename = getDefaultFilename("hourly")(now);
  assertEquals(files[0], expectedFilename);
});

test("getBaseTimeRotatingFileSink() with weekly interval", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    interval: "weekly",
  });

  sink(debug);
  sink(info);
  sink[Symbol.dispose]();

  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const now = new Date();
  const expectedFilename = getDefaultFilename("weekly")(now);
  assertEquals(files[0], expectedFilename);
});

test("getBaseTimeRotatingFileSink() with custom filename", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    filename: (date) => `app-${date.toISOString().slice(0, 10)}.txt`,
  });

  sink(debug);
  sink[Symbol.dispose]();

  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const today = new Date();
  const expectedFilename = `app-${today.toISOString().slice(0, 10)}.txt`;
  assertEquals(files[0], expectedFilename);
});

test("getBaseTimeRotatingFileSink() creates directory if not exists", () => {
  const baseDir = makeTempDirSync();
  const directory = join(baseDir, "nested", "logs");
  const driver = getDriver();

  assertEquals(fs.existsSync(directory), false);

  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
  });

  sink(debug);
  sink[Symbol.dispose]();

  assertEquals(fs.existsSync(directory), true);
  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);
});

test("getBaseTimeRotatingFileSink() with maxAgeMs cleans up old files", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();

  // Create some old files
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
  const oldFilename = getDefaultFilename("daily")(oldDate);
  fs.writeFileSync(join(directory, oldFilename), "old content");

  // Create a recent file
  const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
  const recentFilename = getDefaultFilename("daily")(recentDate);
  fs.writeFileSync(join(directory, recentFilename), "recent content");

  // maxAgeMs = 5 days, so oldFilename should be deleted
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    interval: "daily",
    maxAgeMs: 5 * 24 * 60 * 60 * 1000,
    bufferSize: 0, // Flush immediately to trigger cleanup
  });

  sink(debug);
  sink[Symbol.dispose]();

  const files = fs.readdirSync(directory);
  // Should have 2 files: recent and today's
  assertEquals(files.includes(oldFilename), false);
  assertEquals(files.includes(recentFilename), true);
});

test("getBaseTimeRotatingFileSink() with bufferSize: 0", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    bufferSize: 0,
  });

  sink(debug);

  // Should be written immediately
  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const content = fs.readFileSync(join(directory, files[0]!), "utf-8");
  assertEquals(
    content,
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );

  sink[Symbol.dispose]();
});

test("getBaseTimeRotatingFileSink() with large bufferSize", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    bufferSize: 10000,
  });

  sink(debug);

  // Should not be written yet (buffered)
  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const content = fs.readFileSync(join(directory, files[0]!), "utf-8");
  assertEquals(content, ""); // Still buffered

  sink[Symbol.dispose]();

  // Now should be written
  const contentAfter = fs.readFileSync(join(directory, files[0]!), "utf-8");
  assertEquals(
    contentAfter,
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
});

test("getBaseTimeRotatingFileSink() non-blocking mode", async () => {
  const directory = makeTempDirSync();
  const driver = getAsyncDriver();

  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
    nonBlocking: true,
    bufferSize: 0,
    flushInterval: 50,
  }) as unknown as Sink & AsyncDisposable;

  sink(debug);
  sink(info);

  // Wait for async flush
  await delay(100);

  await sink[Symbol.asyncDispose]();

  const files = fs.readdirSync(directory);
  assertEquals(files.length, 1);

  const content = fs.readFileSync(join(directory, files[0]!), "utf-8");
  assertEquals(
    content,
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getBaseTimeRotatingFileSink() defaults to daily interval", () => {
  const directory = makeTempDirSync();
  const driver = getDriver();
  const sink = getBaseTimeRotatingFileSink({
    ...driver,
    directory,
  });

  sink(debug);
  sink[Symbol.dispose]();

  const files = fs.readdirSync(directory);
  const today = new Date();
  const expectedFilename = getDefaultFilename("daily")(today);
  assertEquals(files[0], expectedFilename);
});
