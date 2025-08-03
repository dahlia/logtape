import { getFileSink, getRotatingFileSink } from "#filesink";
import { suite } from "@alinea/suite";
import { isDeno } from "@david/which-runtime";
import type { Sink } from "@logtape/logtape";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertThrows } from "@std/assert/throws";
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

test("getFileSink() with bufferSize: 0 (no buffering)", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getFileSink(path, { bufferSize: 0 });

  // Write first log entry
  sink(debug);
  // With no buffering, content should be immediately written to file
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );

  // Write second log entry
  sink(info);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write remaining entries
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();

  // Final verification
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

test("getFileSink() with small buffer size", () => {
  const path = makeTempFileSync();
  // Use a small buffer size (100 characters) to test buffering behavior
  const sink: Sink & Disposable = getFileSink(path, { bufferSize: 100 });

  // Write first log entry (about 65 characters)
  sink(debug);
  // Should be buffered, not yet written to file
  assertEquals(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Write second log entry - this should exceed buffer size and trigger flush
  sink(info);
  // Both entries should now be written to file
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write third log entry - should be buffered again
  sink(warning);
  // Should still only have the first two entries
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Dispose should flush remaining buffer content
  sink[Symbol.dispose]();
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getRotatingFileSink() with bufferSize: 0 (no buffering)", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 150,
    bufferSize: 0, // No buffering - immediate writes
  });

  // Write first log entry - should be immediately written
  sink(debug);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );

  // Write second log entry - should be immediately written
  sink(info);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write third log entry - should trigger rotation
  sink(warning);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n",
  );
  // Check that rotation occurred
  assertEquals(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  sink[Symbol.dispose]();
});

test("getRotatingFileSink() with small buffer size", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 200, // Larger maxSize to allow for buffering tests
    bufferSize: 100, // Small buffer to test interaction with rotation
  });

  // Write first log entry - should be buffered
  sink(debug);
  assertEquals(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Write second log entry - should trigger buffer flush
  sink(info);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write third log entry - should be buffered again
  sink(warning);
  assertEquals(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write fourth log entry - should flush buffer and likely trigger rotation
  sink(error);

  // Dispose should flush any remaining buffer content
  sink[Symbol.dispose]();

  // Verify final state - all entries should be written somewhere
  const mainContent = fs.readFileSync(path, { encoding: "utf-8" });
  let rotatedContent = "";
  try {
    rotatedContent = fs.readFileSync(`${path}.1`, { encoding: "utf-8" });
  } catch {
    // No rotation occurred
  }

  const allContent = mainContent + rotatedContent;
  // All four log entries should be present exactly once in either main or rotated file
  const expectedEntries = [
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
    "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
    "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n",
    "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!\n",
  ];

  for (const entry of expectedEntries) {
    assertEquals(
      allContent.includes(entry),
      true,
      `Missing log entry: ${entry.trim()}`,
    );
  }

  // Verify each entry appears exactly once
  for (const entry of expectedEntries) {
    const firstIndex = allContent.indexOf(entry);
    const lastIndex = allContent.lastIndexOf(entry);
    assertEquals(firstIndex, lastIndex, `Duplicate log entry: ${entry.trim()}`);
  }
});

test("getRotatingFileSink()", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 150,
    bufferSize: 0, // Disable buffering for this test to maintain existing behavior
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
    bufferSize: 0, // Disable buffering for this test to maintain existing behavior
  });
  sink2(debug);
  assertEquals(
    fs.readFileSync(path2, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink2[Symbol.dispose]();
});

test("getBaseFileSink() with buffer edge cases", () => {
  // Test negative bufferSize (should behave like bufferSize: 0)
  const path1 = makeTempFileSync();
  let sink1: Sink & Disposable;
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
    sink1 = getBaseFileSink(path1, { ...driver, bufferSize: -10 });
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink1 = getBaseFileSink(path1, { ...driver, bufferSize: -10 });
  }

  sink1(debug);
  // With negative bufferSize, should write immediately
  assertEquals(
    fs.readFileSync(path1, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink1[Symbol.dispose]();

  // Test bufferSize of 1 (very small)
  const path2 = makeTempFileSync();
  let sink2: Sink & Disposable;
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
    sink2 = getBaseFileSink(path2, { ...driver, bufferSize: 1 });
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink2 = getBaseFileSink(path2, { ...driver, bufferSize: 1 });
  }

  sink2(debug);
  // With bufferSize of 1, should write immediately since log entry > 1 char
  assertEquals(
    fs.readFileSync(path2, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink2[Symbol.dispose]();

  // Test very large bufferSize
  const path3 = makeTempFileSync();
  let sink3: Sink & Disposable;
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
    sink3 = getBaseFileSink(path3, { ...driver, bufferSize: 10000 });
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink3 = getBaseFileSink(path3, { ...driver, bufferSize: 10000 });
  }

  // Write multiple entries that shouldn't exceed the large buffer
  sink3(debug);
  sink3(info);
  sink3(warning);
  // Should still be buffered (file empty)
  assertEquals(fs.readFileSync(path3, { encoding: "utf-8" }), "");

  // Dispose should flush all buffered content
  sink3[Symbol.dispose]();
  assertEquals(
    fs.readFileSync(path3, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getBaseFileSink() with time-based flushing", async () => {
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
    sink = getBaseFileSink(path, {
      ...driver,
      bufferSize: 1000, // Large buffer to prevent size-based flushing
      flushInterval: 100, // 100ms flush interval for testing
    });
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink = getBaseFileSink(path, {
      ...driver,
      bufferSize: 1000, // Large buffer to prevent size-based flushing
      flushInterval: 100, // 100ms flush interval for testing
    });
  }

  // Create a log record with current timestamp
  const record1 = { ...debug, timestamp: Date.now() };
  sink(record1);

  // Should be buffered (file empty initially)
  assertEquals(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Wait for flush interval to pass and write another record
  await new Promise((resolve) => setTimeout(resolve, 150));
  const record2 = { ...info, timestamp: Date.now() };
  sink(record2);

  // First record should now be flushed due to time interval
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assertEquals(content.includes("Hello, 123 & 456!"), true);

  sink[Symbol.dispose]();
});

test("getRotatingFileSink() with time-based flushing", async () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 1024 * 1024, // Large maxSize to prevent rotation
    bufferSize: 1000, // Large buffer to prevent size-based flushing
    flushInterval: 100, // 100ms flush interval for testing
  });

  // Create a log record with current timestamp
  const record1 = { ...debug, timestamp: Date.now() };
  sink(record1);

  // Should be buffered (file empty initially)
  assertEquals(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Wait for flush interval to pass and write another record
  await new Promise((resolve) => setTimeout(resolve, 150));
  const record2 = { ...info, timestamp: Date.now() };
  sink(record2);

  // First record should now be flushed due to time interval
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assertEquals(content.includes("Hello, 123 & 456!"), true);

  sink[Symbol.dispose]();
});

test("getBaseFileSink() with flushInterval disabled", () => {
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
    sink = getBaseFileSink(path, {
      ...driver,
      bufferSize: 1000, // Large buffer to prevent size-based flushing
      flushInterval: 0, // Disable time-based flushing
    });
  } else {
    const driver: FileSinkDriver<number> = {
      openSync(path: string) {
        return fs.openSync(path, "a");
      },
      writeSync: fs.writeSync,
      flushSync: fs.fsyncSync,
      closeSync: fs.closeSync,
    };
    sink = getBaseFileSink(path, {
      ...driver,
      bufferSize: 1000, // Large buffer to prevent size-based flushing
      flushInterval: 0, // Disable time-based flushing
    });
  }

  // Create log records with simulated time gap
  const now = Date.now();
  const record1 = { ...debug, timestamp: now };
  const record2 = { ...info, timestamp: now + 10000 }; // 10 seconds later

  sink(record1);
  sink(record2);

  // Should still be buffered since time-based flushing is disabled
  assertEquals(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Only disposal should flush
  sink[Symbol.dispose]();
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assertEquals(content.includes("Hello, 123 & 456!"), true);
});

test("getFileSink() with nonBlocking mode", async () => {
  const path = makeTempFileSync();
  const sink = getFileSink(path, {
    nonBlocking: true,
    bufferSize: 50, // Small buffer to trigger flush by size
  });

  // Check that it returns AsyncDisposable
  assert(typeof sink === "function");
  assert(Symbol.asyncDispose in sink);

  // Add enough records to trigger buffer flush
  sink(debug);
  sink(info);

  // Wait for async flush to complete
  await delay(50);
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes("Hello, 123 & 456!"));

  await (sink as Sink & AsyncDisposable)[Symbol.asyncDispose]();
});

test("getRotatingFileSink() with nonBlocking mode", async () => {
  const path = makeTempFileSync();
  const sink = getRotatingFileSink(path, {
    maxSize: 200,
    nonBlocking: true,
    bufferSize: 1000, // Large buffer to prevent immediate flush
    flushInterval: 50, // Short interval for testing
  });

  // Check that it returns AsyncDisposable
  assert(typeof sink === "function");
  assert(Symbol.asyncDispose in sink);

  // Add records with current timestamp
  const record1 = { ...debug, timestamp: Date.now() };
  const record2 = { ...info, timestamp: Date.now() };
  sink(record1);
  sink(record2);
  assertEquals(fs.readFileSync(path, { encoding: "utf-8" }), ""); // Not written yet

  // Wait for flush interval to pass
  await delay(100);
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes("Hello, 123 & 456!"));

  await (sink as Sink & AsyncDisposable)[Symbol.asyncDispose]();
});

test("getFileSink() with nonBlocking high-volume logging", async () => {
  const path = makeTempFileSync();
  const sink = getFileSink(path, {
    nonBlocking: true,
    bufferSize: 50, // Small buffer to trigger flush
    flushInterval: 0, // Disable time-based flushing for this test
  }) as unknown as Sink & AsyncDisposable;

  // Add enough records to trigger buffer flush (50 chars per record roughly)
  let totalChars = 0;
  let recordCount = 0;
  while (totalChars < 100) { // Exceed buffer size
    sink(debug);
    totalChars += 67; // Approximate length of each debug record
    recordCount++;
  }

  // Wait for async flush to complete
  await delay(50);
  const content = fs.readFileSync(path, { encoding: "utf-8" });

  // Should have some records written by now
  const writtenCount = (content.match(/Hello, 123 & 456!/g) || []).length;
  assert(
    writtenCount > 0,
    `Expected some records to be written, but got ${writtenCount}`,
  );

  await sink[Symbol.asyncDispose]();
});

test("getRotatingFileSink() with nonBlocking rotation", async () => {
  const path = makeTempFileSync();
  const sink = getRotatingFileSink(path, {
    maxSize: 150, // Small size to trigger rotation
    nonBlocking: true,
    bufferSize: 100,
    flushInterval: 10,
  }) as unknown as Sink & AsyncDisposable;

  // Add enough records to trigger rotation
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);

  // Wait for all flushes and rotation to complete
  await delay(200);

  // Check that rotation occurred
  const mainContent = fs.readFileSync(path, { encoding: "utf-8" });
  let rotatedContent = "";
  try {
    rotatedContent = fs.readFileSync(`${path}.1`, { encoding: "utf-8" });
  } catch {
    // No rotation occurred
  }

  const allContent = mainContent + rotatedContent;

  // Should have all 4 records somewhere
  const recordCount = (allContent.match(/Hello, 123 & 456!/g) || []).length;
  assertEquals(recordCount, 4);

  await sink[Symbol.asyncDispose]();
});

// cSpell: ignore filesink
