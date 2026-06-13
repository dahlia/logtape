import { getFileSink, getRotatingFileSink } from "#filesink";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { isDeno } from "@david/which-runtime";
import type { LogRecord, Sink } from "@logtape/logtape";
import { join } from "@std/path/join";
import { LoggerImpl } from "../../logtape/src/logger.ts";
import {
  debug,
  error,
  fatal,
  info,
  warning,
} from "../../logtape/src/fixtures.ts";
import {
  type AsyncFileSinkDriver,
  type AsyncRotatingFileSinkDriver,
  type FileSinkDriver,
  getBaseFileSink,
  getBaseRotatingFileSink,
  type RotatingFileSinkDriver,
} from "./filesink.base.ts";

function makeTempFileSync(): string {
  return join(fs.mkdtempSync(join(tmpdir(), "logtape-")), "logtape.txt");
}

function makeNodeRotatingFileDriver(): RotatingFileSinkDriver<number> {
  return {
    openSync(path: string) {
      return fs.openSync(path, "a");
    },
    writeSync: fs.writeSync,
    flushSync: fs.fsyncSync,
    closeSync: fs.closeSync,
    statSync: fs.statSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
  };
}

interface MemoryFile {
  readonly chunks: Uint8Array[];
  closed: boolean;
  flushCount: number;
}

function makeMemoryFileDriver(): {
  readonly driver: FileSinkDriver<MemoryFile>;
  readonly file: MemoryFile;
} {
  const file: MemoryFile = { chunks: [], closed: false, flushCount: 0 };
  return {
    file,
    driver: {
      openSync() {
        return file;
      },
      writeSync(fd, chunk) {
        fd.chunks.push(chunk.slice());
      },
      writeManySync(fd, chunks) {
        for (const chunk of chunks) fd.chunks.push(chunk.slice());
      },
      flushSync(fd) {
        fd.flushCount++;
      },
      closeSync(fd) {
        fd.closed = true;
      },
    },
  };
}

function makeAsyncMemoryFileDriver(): {
  readonly driver: AsyncFileSinkDriver<MemoryFile>;
  readonly file: MemoryFile;
} {
  const { driver, file } = makeMemoryFileDriver();
  return {
    file,
    driver: {
      ...driver,
      flush(fd) {
        fd.flushCount++;
        return Promise.resolve();
      },
      close(fd) {
        fd.closed = true;
        return Promise.resolve();
      },
    },
  };
}

function makeAsyncRotatingMemoryFileDriver(): {
  readonly driver: AsyncRotatingFileSinkDriver<MemoryFile>;
  readonly file: MemoryFile;
} {
  const { driver, file } = makeAsyncMemoryFileDriver();
  return {
    file,
    driver: {
      ...driver,
      statSync() {
        return { size: 0 };
      },
      renameSync() {
      },
    },
  };
}

function captureMetaWarnings(): {
  readonly records: LogRecord[];
  readonly dispose: () => void;
} {
  const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
  const records: LogRecord[] = [];
  const sink = records.push.bind(records);
  const originalLowestLevel = metaLogger.lowestLevel;
  metaLogger.sinks.push(sink);
  metaLogger.lowestLevel = "warning";
  return {
    records,
    dispose() {
      metaLogger.sinks.splice(metaLogger.sinks.indexOf(sink), 1);
      metaLogger.lowestLevel = originalLowestLevel;
    },
  };
}

function readMemoryFile(file: MemoryFile): string {
  const size = file.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of file.chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
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
  assert.deepStrictEqual(
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

test("getBaseFileSink() encodes records before caller mutations", () => {
  const { driver, file } = makeMemoryFileDriver();
  const logger = LoggerImpl.getLogger(["file", "immediate-snapshot"]);
  const properties = { value: "before" };
  const sink: Sink & Disposable = getBaseFileSink("memory.log", {
    ...driver,
    bufferSize: 1000,
    formatter: (record) => `${record.properties.value}\n`,
  });
  logger.parentSinks = "override";
  logger.sinks.push(sink);

  try {
    logger.info("Value {value}", properties);
    properties.value = "after";
    sink[Symbol.dispose]();

    assert.strictEqual(readMemoryFile(file), "before\n");
  } finally {
    logger.resetDescendants();
  }
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
    assert.throws(
      () => Deno.lstatSync(path),
      Deno.errors.NotFound,
    );
  } else {
    assert.strictEqual(fs.existsSync(path), false);
  }
  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);
  sink[Symbol.dispose]();
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );

  // Write second log entry
  sink(info);
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(
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
  // Use a small buffer size (100 characters) to test flush behavior.
  const sink: Sink & Disposable = getFileSink(path, { bufferSize: 100 });

  sink(debug);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
`,
  );

  sink(info);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  sink(warning);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
`,
  );

  sink[Symbol.dispose]();
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
`,
  );
});

test("getBaseFileSink() fast path works with a custom buffer size", () => {
  const { driver, file } = makeMemoryFileDriver();
  const sink: Sink & Disposable = getBaseFileSink("memory.log", {
    ...driver,
    bufferSize: 16 * 1024,
  });

  sink(debug);

  assert.deepStrictEqual(
    readMemoryFile(file),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.strictEqual(file.flushCount, 1);
  sink[Symbol.dispose]();
});

test("getBaseFileSink() records fast path flushes", () => {
  const { driver, file } = makeMemoryFileDriver();
  const sink: Sink & Disposable = getBaseFileSink("memory.log", driver);
  const message = "x".repeat(5000);
  const largeRecord: LogRecord = {
    ...debug,
    message: [message],
    rawMessage: message,
  };

  sink(debug);
  sink(largeRecord);

  assert.strictEqual(
    readMemoryFile(file).includes(message),
    true,
    "large records should flush after the fast path updates adaptive stats",
  );
  sink[Symbol.dispose]();
});

test("getBaseFileSink() keeps time-based flushing after zero-interval fast path", () => {
  const { driver, file } = makeMemoryFileDriver();
  const originalDateNow = Date.now;
  const message = "x".repeat(300);
  const largeRecord: LogRecord = {
    ...debug,
    message: [message],
    rawMessage: message,
    timestamp: 1100,
  };

  try {
    Date.now = () => 1000;
    const sink: Sink & Disposable = getBaseFileSink("memory.log", {
      ...driver,
      bufferSize: 10_000,
      flushInterval: 100,
    });

    sink(debug);
    sink(largeRecord);

    assert.strictEqual(
      readMemoryFile(file).includes(message),
      true,
      "positive flushInterval should still flush after a 0 ms fast path flush",
    );
    sink[Symbol.dispose]();
  } finally {
    Date.now = originalDateNow;
  }
});

test("getBaseFileSink() does not reformat large fast path fallbacks", () => {
  const { driver } = makeMemoryFileDriver();
  let formatCount = 0;
  const sink: Sink & Disposable = getBaseFileSink("memory.log", {
    ...driver,
    bufferSize: 10_000,
    formatter() {
      formatCount++;
      return "x".repeat(300);
    },
  });

  sink(debug);

  assert.strictEqual(formatCount, 1);
  sink[Symbol.dispose]();
});

test("getBaseFileSink() non-blocking fast path flushes direct writes", async () => {
  const { driver, file } = makeAsyncMemoryFileDriver();
  const sink = getBaseFileSink("memory.log", {
    ...driver,
    bufferSize: 16 * 1024,
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;

  sink(debug);
  await sink[Symbol.asyncDispose]();

  assert.deepStrictEqual(
    readMemoryFile(file),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.strictEqual(file.flushCount, 1);
});

test("getBaseFileSink() non-blocking does not reformat large fast path fallbacks", async () => {
  const { driver } = makeAsyncMemoryFileDriver();
  let formatCount = 0;
  const sink = getBaseFileSink("memory.log", {
    ...driver,
    bufferSize: 10_000,
    formatter() {
      formatCount++;
      return "x".repeat(300);
    },
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;

  sink(debug);

  assert.strictEqual(formatCount, 1);
  await sink[Symbol.asyncDispose]();
});

test("getBaseFileSink() non-blocking fast path reports flush errors", async () => {
  const { driver } = makeAsyncMemoryFileDriver();
  const meta = captureMetaWarnings();
  const sink = getBaseFileSink("memory.log", {
    ...driver,
    flush() {
      throw new Error("flush failed");
    },
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;

  try {
    assert.doesNotThrow(() => sink(debug));
    await sink[Symbol.asyncDispose]();

    assert.strictEqual(meta.records.length, 1);
    const metaRecord = meta.records[0];
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "warning");
    const errorProp = metaRecord.properties.error as Error;
    assert.strictEqual(errorProp.message, "flush failed");
    assert.strictEqual(metaRecord.properties.path, "memory.log");
  } finally {
    meta.dispose();
  }
});

test("getBaseFileSink() non-blocking reports buffered flush errors", async () => {
  const { driver } = makeAsyncMemoryFileDriver();
  const meta = captureMetaWarnings();
  const sink = getBaseFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    flush() {
      throw new Error("buffered flush failed");
    },
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;
  const largeRecord: LogRecord = {
    ...debug,
    message: ["x".repeat(300)],
    rawMessage: "x".repeat(300),
  };

  try {
    assert.doesNotThrow(() => sink(largeRecord));
    await sink[Symbol.asyncDispose]();

    assert.strictEqual(meta.records.length, 1);
    const metaRecord = meta.records[0];
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "warning");
    const errorProp = metaRecord.properties.error as Error;
    assert.strictEqual(errorProp.message, "buffered flush failed");
    assert.strictEqual(metaRecord.properties.path, "memory.log");
  } finally {
    meta.dispose();
  }
});

test("getBaseRotatingFileSink() non-blocking reports flush errors", async () => {
  const { driver } = makeAsyncRotatingMemoryFileDriver();
  const meta = captureMetaWarnings();
  const sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    flush() {
      throw new Error("rotating flush failed");
    },
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;

  try {
    assert.doesNotThrow(() => sink(debug));
    await sink[Symbol.asyncDispose]();

    assert.strictEqual(meta.records.length, 1);
    const metaRecord = meta.records[0];
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "warning");
    const errorProp = metaRecord.properties.error as Error;
    assert.strictEqual(errorProp.message, "rotating flush failed");
    assert.strictEqual(metaRecord.properties.path, "memory.log");
  } finally {
    meta.dispose();
  }
});

test("getBaseRotatingFileSink() non-blocking disposal waits for flush errors", async () => {
  const { driver } = makeAsyncRotatingMemoryFileDriver();
  const meta = captureMetaWarnings();
  const sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    async flush() {
      await delay(10);
      throw new Error("delayed rotating flush failed");
    },
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;

  try {
    sink(debug);
    await sink[Symbol.asyncDispose]();

    assert.strictEqual(meta.records.length, 1);
    const metaRecord = meta.records[0];
    assert.deepStrictEqual(metaRecord.category, ["logtape", "meta"]);
    assert.strictEqual(metaRecord.level, "warning");
    const errorProp = metaRecord.properties.error as Error;
    assert.strictEqual(errorProp.message, "delayed rotating flush failed");
    assert.strictEqual(metaRecord.properties.path, "memory.log");
  } finally {
    meta.dispose();
  }
});

test("getBaseRotatingFileSink() non-blocking drains records queued during a flush", async () => {
  const { driver, file } = makeAsyncRotatingMemoryFileDriver();
  let releaseFirstFlush: (() => void) | undefined;
  let secondFlushComplete: (() => void) | undefined;
  let flushCount = 0;
  const firstFlush = new Promise<void>((resolve) => {
    releaseFirstFlush = resolve;
  });
  const secondFlush = new Promise<void>((resolve) => {
    secondFlushComplete = resolve;
  });
  const sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 1,
    flushInterval: 0,
    maxSize: 1024 * 1024,
    async flush() {
      flushCount++;
      if (flushCount === 1) await firstFlush;
      else secondFlushComplete?.();
    },
    nonBlocking: true,
  }) as unknown as Sink & AsyncDisposable;

  sink(debug);
  assert.deepStrictEqual(
    readMemoryFile(file),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );

  sink(info);
  releaseFirstFlush?.();

  const drained = await Promise.race([
    secondFlush.then(() => true),
    delay(1000).then(() => false),
  ]);

  assert.strictEqual(drained, true, "queued record was not drained");
  assert.deepStrictEqual(
    readMemoryFile(file),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  await sink[Symbol.asyncDispose]();
});

test("getRotatingFileSink() with bufferSize: 0 (no buffering)", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 150,
    bufferSize: 0, // No buffering - immediate writes
  });

  // Write first log entry - should be immediately written
  sink(debug);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );

  // Write second log entry - should be immediately written
  sink(info);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write third log entry - should trigger rotation
  sink(warning);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n",
  );
  // Check that rotation occurred
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Write second log entry - should trigger buffer flush
  sink(info);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );

  // Write third log entry - should be buffered again
  sink(warning);
  assert.deepStrictEqual(
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
    assert.strictEqual(
      allContent.includes(entry),
      true,
      `Missing log entry: ${entry.trim()}`,
    );
  }

  // Verify each entry appears exactly once
  for (const entry of expectedEntries) {
    const firstIndex = allContent.indexOf(entry);
    const lastIndex = allContent.lastIndexOf(entry);
    assert.strictEqual(
      firstIndex,
      lastIndex,
      `Duplicate log entry: ${entry.trim()}`,
    );
  }
});

test("getRotatingFileSink()", () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getRotatingFileSink(path, {
    maxSize: 150,
    bufferSize: 0, // Disable buffering for this test to maintain existing behavior
  });
  sink(debug);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink(info);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(warning);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(error);
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
`,
  );
  assert.deepStrictEqual(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  sink(fatal);
  sink[Symbol.dispose]();
  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.deepStrictEqual(
    fs.readFileSync(`${path}.1`, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!
`,
  );
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(
    fs.readFileSync(path2, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n",
  );
  sink2[Symbol.dispose]();
});

test("getRotatingFileSink() with maxFiles <= 0", () => {
  for (const maxFiles of [0, -1]) {
    const path = makeTempFileSync();
    const sink: Sink & Disposable = getRotatingFileSink(path, {
      maxSize: 150,
      maxFiles,
      bufferSize: 0,
    });

    sink(debug);
    sink(info);
    sink(warning);
    sink(error);
    sink(fatal);
    sink[Symbol.dispose]();

    assert.deepStrictEqual(
      fs.readFileSync(path, { encoding: "utf-8" }),
      "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
    );
    assert.strictEqual(fs.existsSync(`${path}.1`), false);
  }
});

test("getBaseRotatingFileSink() requires deletion support for maxFiles <= 0", () => {
  const path = makeTempFileSync();
  const { unlinkSync: _unlinkSync, ...driver } = makeNodeRotatingFileDriver();

  assert.throws(
    () =>
      getBaseRotatingFileSink(path, {
        ...driver,
        maxFiles: 0,
      }),
    /unlinkSync/,
  );
});

test("getBaseRotatingFileSink() propagates deletion failures", () => {
  const path = makeTempFileSync();
  const driver = makeNodeRotatingFileDriver();
  const unlinkError = Object.assign(new Error("permission denied"), {
    code: "EACCES",
  });
  const sink: Sink & Disposable = getBaseRotatingFileSink(path, {
    ...driver,
    maxSize: 150,
    maxFiles: 0,
    bufferSize: 0,
    unlinkSync() {
      throw unlinkError;
    },
  });

  sink(debug);
  sink(info);
  assert.throws(() => sink(warning), unlinkError);
  sink[Symbol.dispose]();

  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
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
  assert.deepStrictEqual(
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
  assert.deepStrictEqual(
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

  // Small entries use the empty-buffer fast path even with a large buffer.
  sink3(debug);
  sink3(info);
  sink3(warning);
  assert.deepStrictEqual(
    fs.readFileSync(path3, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!
`,
  );
  sink3[Symbol.dispose]();
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

  // Create a log record large enough to skip the small-record fast path.
  const message = "x".repeat(300);
  const record1: LogRecord = {
    ...debug,
    message: [message],
    rawMessage: message,
    timestamp: Date.now(),
  };
  sink(record1);

  // Should be buffered (file empty initially)
  assert.deepStrictEqual(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Wait for flush interval to pass and write another record
  await new Promise((resolve) => setTimeout(resolve, 150));
  const record2: LogRecord = {
    ...info,
    message: [message],
    rawMessage: message,
    timestamp: Date.now(),
  };
  sink(record2);

  // First record should now be flushed due to time interval
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert.strictEqual(content.includes(message), true);

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
  assert.deepStrictEqual(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Wait for flush interval to pass and write another record
  await new Promise((resolve) => setTimeout(resolve, 150));
  const record2 = { ...info, timestamp: Date.now() };
  sink(record2);

  // First record should now be flushed due to time interval
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert.strictEqual(content.includes("Hello, 123 & 456!"), true);

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

  // Create log records large enough to skip the small-record fast path.
  const now = Date.now();
  const message = "x".repeat(300);
  const record1: LogRecord = {
    ...debug,
    message: [message],
    rawMessage: message,
    timestamp: now,
  };
  const record2: LogRecord = {
    ...info,
    message: [message],
    rawMessage: message,
    timestamp: now + 10000,
  };

  sink(record1);
  sink(record2);

  // Should still be buffered since time-based flushing is disabled
  assert.deepStrictEqual(fs.readFileSync(path, { encoding: "utf-8" }), "");

  // Only disposal should flush
  sink[Symbol.dispose]();
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert.strictEqual(content.includes(message), true);
});

test("getFileSink() with nonBlocking mode", async () => {
  const path = makeTempFileSync();
  const sink = getFileSink(path, {
    nonBlocking: true,
    bufferSize: 50, // Small buffer to trigger flush by size
  });

  // Check that it returns AsyncDisposable
  assert.ok(typeof sink === "function");
  assert.ok(Symbol.asyncDispose in sink);

  // Add enough records to trigger buffer flush
  sink(debug);
  sink(info);

  // Wait for async flush to complete
  await delay(50);
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert.ok(content.includes("Hello, 123 & 456!"));

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
  assert.ok(typeof sink === "function");
  assert.ok(Symbol.asyncDispose in sink);

  // Add records with current timestamp
  const record1 = { ...debug, timestamp: Date.now() };
  const record2 = { ...info, timestamp: Date.now() };
  sink(record1);
  sink(record2);
  assert.deepStrictEqual(fs.readFileSync(path, { encoding: "utf-8" }), ""); // Not written yet

  // Wait for flush interval to pass
  await delay(100);
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert.ok(content.includes("Hello, 123 & 456!"));

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
  assert.ok(
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

  await sink[Symbol.asyncDispose]();

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
  assert.strictEqual(recordCount, 4);
});

// cSpell: ignore filesink
