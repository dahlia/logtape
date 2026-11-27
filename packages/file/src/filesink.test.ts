import { getFileSink, getRotatingFileSink } from "#filesink";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { platform } from "node:process";
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

test("permission-aware rotating sink stops after a failed reopen", () => {
  const { driver, handles, closedFileCalls } = makeRecoverableRotatingDriver();
  const failure = new Error("Cannot verify file mode");
  let opened = false;
  using sink = getBaseRotatingFileSink(
    "memory.log",
    {
      ...driver,
      maxFiles: 1,
      maxSize: 1,
      bufferSize: 0,
      formatter: () => "AB",
      statSync() {
        assert.fail("the verified opener provides the size");
      },
    },
    {
      openSync(path) {
        if (opened) throw failure;
        opened = true;
        return { file: driver.openSync(path), size: 0 };
      },
    },
  );
  assert.throws(
    () => sink(info),
    (error) => error === failure,
  );
  assert.doesNotThrow(() => sink(info));
  sink[Symbol.dispose]();
  assert.strictEqual(handles.length, 1);
  assert.strictEqual(handles[0].closed, true);
  assert.deepStrictEqual(closedFileCalls, []);
});

test("permission-aware rotating sink finishes both batches on reentrant dispose", () => {
  const { driver, files, handles, closedFileCalls } =
    makeRecoverableRotatingDriver();
  const calls: string[] = [];
  const textEncoder = new TextEncoder();
  const encoder: TextEncoder = {
    encoding: "utf-8",
    encodeInto: textEncoder.encodeInto.bind(textEncoder),
    encode(text = "") {
      calls.push(text);
      if (text === "first") {
        sink(warning);
        sink[Symbol.dispose]();
        sink(debug);
      }
      return textEncoder.encode(text);
    },
  };
  const sink: Sink & Disposable = getBaseRotatingFileSink(
    "memory.log",
    {
      ...driver,
      bufferSize: 0,
      flushInterval: 0,
      formatter: (record) => (record === info ? "first" : "second"),
      encoder,
    },
    {
      openSync(path) {
        return { file: driver.openSync(path), size: 0 };
      },
    },
  );
  sink(info);
  sink[Symbol.dispose]();
  assert.deepStrictEqual(calls, ["first", "second"]);
  assert.strictEqual(files.get("memory.log")?.text, "firstsecond");
  assert.strictEqual(handles.length, 1);
  assert.strictEqual(handles[0].closed, true);
  assert.deepStrictEqual(closedFileCalls, []);
});

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
      renameSync() {},
    },
  };
}

function makeRecoverableRotatingDriver() {
  const files = new Map<string, { text: string }>();
  const handles: { file: { text: string }; closed: boolean }[] = [];
  const renames: string[] = [];
  const closedFileCalls: string[] = [];
  function check(file: (typeof handles)[number], operation: string): void {
    if (!file.closed) return;
    closedFileCalls.push(operation);
    throw new Error(`${operation} on a closed file`);
  }
  const driver: AsyncRotatingFileSinkDriver<(typeof handles)[number]> = {
    openSync(path) {
      const file = files.get(path) ?? { text: "" };
      files.set(path, file);
      const handle = { file, closed: false };
      handles.push(handle);
      return handle;
    },
    writeSync(handle, bytes) {
      check(handle, "write");
      handle.file.text += new TextDecoder().decode(bytes);
    },
    writeManySync(handle, chunks) {
      for (const chunk of chunks) driver.writeSync(handle, chunk);
    },
    flushSync(handle) {
      check(handle, "flush");
    },
    closeSync(handle) {
      check(handle, "close");
      handle.closed = true;
    },
    flush(handle) {
      driver.flushSync(handle);
      return Promise.resolve();
    },
    close(handle) {
      driver.closeSync(handle);
      return Promise.resolve();
    },
    statSync(path) {
      const file = files.get(path);
      if (file == null) throw new Error("File not found");
      return { size: new TextEncoder().encode(file.text).length };
    },
    renameSync(oldPath, newPath) {
      renames.push(oldPath);
      const file = files.get(oldPath);
      if (file == null) {
        throw Object.assign(new Error("File not found"), { code: "ENOENT" });
      }
      files.set(newPath, file);
      files.delete(oldPath);
    },
  };
  return { driver, files, handles, renames, closedFileCalls };
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
    assert.throws(() => Deno.lstatSync(path), Deno.errors.NotFound);
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

for (const nonBlocking of [false, true]) {
  test(
    `getRotatingFileSink() recreates a deleted log (nonBlocking: ${nonBlocking})`,
    { skip: platform === "win32" },
    async () => {
      if (platform === "win32") return;
      const path = makeTempFileSync();
      const config = {
        bufferSize: 0,
        flushInterval: 0,
        maxSize: 6,
        formatter: (record: LogRecord) => String(record.rawMessage),
      };
      try {
        if (nonBlocking) {
          await using sink = getRotatingFileSink(path, {
            ...config,
            nonBlocking: true,
          });
          sink({ ...debug, rawMessage: "first" });
          fs.unlinkSync(path);
          sink({ ...info, rawMessage: "next" });
        } else {
          using sink = getRotatingFileSink(path, config);
          sink({ ...debug, rawMessage: "first" });
          fs.unlinkSync(path);
          sink({ ...info, rawMessage: "next" });
          assert.strictEqual(fs.readFileSync(path, "utf8"), "next");
          sink({ ...warning, rawMessage: "later" });
          assert.strictEqual(fs.readFileSync(`${path}.1`, "utf8"), "next");
        }
        assert.strictEqual(
          fs.readFileSync(path, "utf8"),
          nonBlocking ? "next" : "later",
        );
      } finally {
        fs.rmSync(join(path, ".."), { recursive: true, force: true });
      }
    },
  );
}

test("getBaseRotatingFileSink() retries custom backup moves without aging twice", () => {
  const { driver, files, handles, renames, closedFileCalls } =
    makeRecoverableRotatingDriver();
  files.set("memory.log", { text: "first" });
  files.set("backup-1.log", { text: "backup" });
  files.set("backup-2.log", { text: "older" });
  const backupError = new Error("Cannot move backup");
  const renameError = Object.assign(new Error("Permission denied"), {
    name: "NotFound",
    code: "EACCES",
  });
  let failBackup = true;
  let failActive = true;
  const sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    maxSize: 6,
    maxFiles: 3,
    rotatedFilePath: (_path, index) => `backup-${index}.log`,
    formatter: (record) => String(record.rawMessage),
    renameSync(from, to) {
      if (from === "backup-1.log" && failBackup) {
        failBackup = false;
        throw backupError;
      }
      if (from === "memory.log" && failActive) {
        failActive = false;
        throw renameError;
      }
      driver.renameSync(from, to);
    },
  });

  assert.throws(
    () => sink({ ...debug, rawMessage: "drop" }),
    (error) => error === backupError,
  );
  assert.strictEqual(handles.length, 1, "no reopen in the failed flush");
  assert.strictEqual(files.get("backup-1.log")?.text, "backup");
  assert.strictEqual(files.get("backup-3.log")?.text, "older");
  assert.throws(
    () => sink({ ...debug, rawMessage: "skip" }),
    (error) => error === renameError,
  );
  assert.strictEqual(handles.length, 2, "no reopen in the failed retry");
  sink({ ...info, rawMessage: "next" });
  assert.deepStrictEqual(renames, [
    "backup-2.log",
    "backup-1.log",
    "memory.log",
  ]);
  assert.strictEqual(files.get("memory.log")?.text, "next");
  assert.strictEqual(files.get("backup-1.log")?.text, "first");
  assert.strictEqual(files.get("backup-2.log")?.text, "backup");
  assert.strictEqual(files.get("backup-3.log")?.text, "older");
  sink[Symbol.dispose]();
  sink(info);
  sink[Symbol.dispose]();
  assert.strictEqual(handles.length, 4);
  assert.ok(handles.every((handle) => handle.closed));
  assert.deepStrictEqual(closedFileCalls, []);
});

test("getBaseRotatingFileSink() recovers from a failed reopen without rotating an empty file", () => {
  const { driver, files, handles, closedFileCalls } =
    makeRecoverableRotatingDriver();
  files.set("memory.log", { text: "first" });
  const openError = new Error("Cannot reopen");
  let opens = 0;
  using sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    maxSize: 6,
    formatter: () => "oversize",
    openSync(path) {
      if (++opens === 2) throw openError;
      return driver.openSync(path);
    },
    renameSync(from, to) {
      if (from === "memory.log") {
        throw Object.assign(new Error("File not found"), { name: "NotFound" });
      }
      driver.renameSync(from, to);
    },
  });

  files.delete("memory.log");
  assert.throws(
    () => sink(debug),
    (error) => error === openError,
  );
  assert.strictEqual(handles.length, 1);
  sink(info);
  assert.strictEqual(files.get("memory.log")?.text, "oversize");
  assert.ok(!files.has("memory.log.1"));
  assert.deepStrictEqual(closedFileCalls, []);
});

test("getBaseRotatingFileSink() checks the size of a reopened log before appending", () => {
  const { driver, files, handles } = makeRecoverableRotatingDriver();
  files.set("memory.log", { text: "first" });
  const renameError = new Error("Cannot rename");
  const statError = new Error("Cannot stat");
  let failStat = true;
  using sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    maxSize: 6,
    formatter: (record) => String(record.rawMessage),
    renameSync(from, to) {
      if (from === "memory.log" && handles.length === 1) throw renameError;
      driver.renameSync(from, to);
    },
    statSync(path) {
      if (handles.length === 2 && failStat) {
        failStat = false;
        throw statError;
      }
      return driver.statSync(path);
    },
  });

  assert.throws(
    () => sink({ ...debug, rawMessage: "drop" }),
    (error) => error === renameError,
  );
  assert.throws(
    () => sink({ ...info, rawMessage: "skip" }),
    (error) => error === statError,
  );
  assert.strictEqual(files.get("memory.log")?.text, "first");
  sink({ ...info, rawMessage: "x" });
  assert.strictEqual(files.get("memory.log")?.text, "firstx");
  sink({ ...warning, rawMessage: "last" });
  assert.strictEqual(files.get("memory.log")?.text, "last");
  assert.strictEqual(files.get("memory.log.1")?.text, "firstx");
});

test("getBaseRotatingFileSink() recovers when a reopened log disappears before stat", () => {
  const { driver, files, handles, closedFileCalls } =
    makeRecoverableRotatingDriver();
  files.set("memory.log", { text: "first" });
  const missing = Object.assign(new Error("File not found"), {
    code: "ENOENT",
  });
  using sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    maxSize: 6,
    formatter: (record) => String(record.rawMessage),
    statSync(path) {
      if (handles.length === 2) {
        files.delete(path);
        throw missing;
      }
      return driver.statSync(path);
    },
    closeSync(handle) {
      driver.closeSync(handle);
      if (handle === handles[1]) throw new Error("Cannot close");
    },
  });

  assert.throws(
    () => sink({ ...debug, rawMessage: "drop" }),
    (error) => error === missing,
  );
  assert.ok(handles[1].closed);
  assert.ok(!files.has("memory.log"));
  sink({ ...info, rawMessage: "next" });
  assert.strictEqual(files.get("memory.log")?.text, "next");
  assert.strictEqual(files.get("memory.log.1")?.text, "first");
  assert.deepStrictEqual(closedFileCalls, []);
});

test("getBaseRotatingFileSink() does not close again after a failed rollover close", () => {
  const { driver, handles, renames, closedFileCalls } =
    makeRecoverableRotatingDriver();
  const closeError = new Error("Cannot close");
  const sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    maxSize: 1,
    formatter: () => "next",
    closeSync(handle) {
      driver.closeSync(handle);
      throw closeError;
    },
  });
  assert.throws(
    () => sink(debug),
    (error) => error === closeError,
  );
  assert.deepStrictEqual(renames, []);
  assert.doesNotThrow(() => sink[Symbol.dispose]());
  assert.strictEqual(handles.length, 1);
  assert.deepStrictEqual(closedFileCalls, []);
});

test("getBaseRotatingFileSink() does not reopen if its formatter disposes it", () => {
  const { driver, files, handles, closedFileCalls } =
    makeRecoverableRotatingDriver();
  using sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 0,
    formatter() {
      sink[Symbol.dispose]();
      return "discarded";
    },
  });

  sink(debug);
  assert.strictEqual(handles.length, 1);
  assert.ok(handles[0].closed);
  assert.strictEqual(files.get("memory.log")?.text, "");
  assert.deepStrictEqual(closedFileCalls, []);
});

test("getBaseRotatingFileSink() recovers during the final drain", () => {
  const { driver, files, handles, closedFileCalls } =
    makeRecoverableRotatingDriver();
  const closeError = new Error("Cannot close");
  const sink = getBaseRotatingFileSink("memory.log", {
    ...driver,
    bufferSize: 4,
    flushInterval: 0,
    maxSize: 3,
    formatter: (record) => String(record.rawMessage),
    closeSync(handle) {
      driver.closeSync(handle);
      if (handle === handles[0]) throw closeError;
    },
  });
  assert.throws(
    () => sink({ ...debug, rawMessage: "first" }),
    (error) => error === closeError,
  );
  sink({ ...info, rawMessage: "end" });
  assert.strictEqual(handles.length, 1);
  sink[Symbol.dispose]();
  assert.strictEqual(files.get("memory.log")?.text, "end");
  assert.strictEqual(handles.length, 2);
  assert.ok(handles.every((handle) => handle.closed));
  assert.deepStrictEqual(closedFileCalls, []);
});

for (const failDrain of [false, true]) {
  test(`getBaseRotatingFileSink() closes after final flush (failDrain: ${failDrain})`, () => {
    const { driver, handles, closedFileCalls } =
      makeRecoverableRotatingDriver();
    const closeError = new Error("Cannot close");
    const sink = getBaseRotatingFileSink("memory.log", {
      ...driver,
      bufferSize: 1024,
      flushInterval: 0,
      flushSync() {
        if (failDrain) throw 0;
      },
      closeSync(handle) {
        driver.closeSync(handle);
        throw closeError;
      },
    });
    sink(debug);
    assert.throws(
      () => sink[Symbol.dispose](),
      (error) => error === (failDrain ? 0 : closeError),
    );
    assert.ok(handles[0].closed);
    assert.doesNotThrow(() => sink[Symbol.dispose]());
    assert.deepStrictEqual(closedFileCalls, []);
  });
}

for (const failClose of [false, true]) {
  test(`getBaseRotatingFileSink() queues warning records (failClose: ${failClose})`, async () => {
    const { driver, files, handles, renames, closedFileCalls } =
      makeRecoverableRotatingDriver();
    const flushError = new Error("Cannot flush");
    const flushStarted = Promise.withResolvers<void>();
    const releaseFlush = Promise.withResolvers<void>();
    let inWarning = false;
    let wroteInWarning = false;
    const sink = getBaseRotatingFileSink("memory.log", {
      ...driver,
      nonBlocking: true,
      bufferSize: 0,
      flushInterval: 0,
      maxSize: failClose ? 3 : 1024,
      formatter: (record) =>
        record.category[0] === "logtape" ? "meta" : "first",
      writeSync(handle, bytes) {
        wroteInWarning ||= inWarning;
        if (new TextDecoder().decode(bytes) === "first") throw flushError;
        driver.writeSync(handle, bytes);
      },
      closeSync(handle) {
        driver.closeSync(handle);
        throw flushError;
      },
      async flush(handle: (typeof handles)[number]) {
        await driver.flush(handle);
        flushStarted.resolve();
        await releaseFlush.promise;
        driver.flushSync(handle);
      },
    });
    const meta = captureMetaWarnings();
    const metaLogger = LoggerImpl.getLogger(["logtape", "meta"]);
    const routedWarning: Sink = (record) => {
      inWarning = true;
      try {
        sink(record);
      } finally {
        inWarning = false;
      }
    };
    metaLogger.sinks.push(routedWarning);

    try {
      sink(debug);
      assert.ok(
        await Promise.race([
          flushStarted.promise.then(() => true),
          delay(1000).then(() => false),
        ]),
        "queued warning was not flushed",
      );
      assert.strictEqual(wroteInWarning, false);
      assert.strictEqual(handles.length, failClose ? 2 : 1);
      assert.strictEqual(handles.at(-1)?.closed, false);
      assert.strictEqual(meta.records.length, 1);
      assert.strictEqual(meta.records[0].properties.error, flushError);
    } finally {
      metaLogger.sinks.splice(metaLogger.sinks.indexOf(routedWarning), 1);
      meta.dispose();
      const disposing = sink[Symbol.asyncDispose]();
      releaseFlush.resolve();
      await disposing;
    }
    assert.strictEqual(files.get("memory.log")?.text, "meta");
    assert.ok(handles.every((handle) => handle.closed));
    assert.deepStrictEqual(renames, []);
    assert.deepStrictEqual(closedFileCalls, []);
  });
}

test("getBaseRotatingFileSink() reopens on the non-blocking final drain", async () => {
  const { driver, files, handles, closedFileCalls } =
    makeRecoverableRotatingDriver();
  const openError = new Error("Cannot reopen");
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let opens = 0;
  const meta = captureMetaWarnings();
  try {
    await using sink = getBaseRotatingFileSink("memory.log", {
      ...driver,
      nonBlocking: true,
      bufferSize: 4,
      flushInterval: 0,
      maxSize: 4,
      formatter: (record) => String(record.rawMessage),
      openSync(path) {
        if (++opens === 2) throw openError;
        return driver.openSync(path);
      },
      async flush(handle: (typeof handles)[number]) {
        started.resolve();
        await release.promise;
        driver.flushSync(handle);
      },
    });
    files.delete("memory.log");
    sink({ ...debug, rawMessage: "first" });
    sink({ ...info, rawMessage: "end" });
    assert.strictEqual(handles.length, 1);
    const first = sink[Symbol.asyncDispose]();
    try {
      assert.ok(
        await Promise.race([
          started.promise.then(() => true),
          delay(1000).then(() => false),
        ]),
        "final drain did not start",
      );
      assert.strictEqual(sink[Symbol.asyncDispose](), first);
      assert.strictEqual(handles[1].closed, false);
    } finally {
      release.resolve();
      await first;
    }
  } finally {
    meta.dispose();
  }
  assert.strictEqual(meta.records.length, 1);
  assert.strictEqual(meta.records[0].properties.error, openError);
  assert.strictEqual(files.get("memory.log")?.text, "end");
  assert.strictEqual(handles.length, 2);
  assert.ok(handles.every((handle) => handle.closed));
  assert.deepStrictEqual(closedFileCalls, []);
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

for (const nonBlocking of [false, true]) {
  for (const custom of [false, true]) {
    for (const maxFiles of [1, 2]) {
      test(`getRotatingFileSink() retains ${maxFiles} ${custom ? "custom" : "default"} backups with nonBlocking: ${nonBlocking}`, async () => {
        const directory = fs.mkdtempSync(join(tmpdir(), "logtape.rotating-"));
        const path = join(directory, "app.log");
        const first = custom ? "app.1.log" : "app.log.1";
        const second = custom ? "app.2.log" : "app.log.2";
        try {
          // Reuse existing backups and rotate past the retention limit.
          fs.writeFileSync(path, "A\n");
          fs.writeFileSync(join(directory, first), "B\n");
          if (maxFiles === 2) fs.writeFileSync(join(directory, second), "C\n");
          for (const payload of ["D\n", "E\n", "F\n"]) {
            const sink = getRotatingFileSink(path, {
              maxSize: 2,
              maxFiles,
              bufferSize: 0,
              flushInterval: 0,
              nonBlocking,
              formatter: () => payload,
              rotatedFilePath: custom
                ? (path: string, index: number): string =>
                    path.replace(/(\.log)?$/, `.${index}$1`)
                : undefined,
            });
            try {
              sink(info);
            } finally {
              if (nonBlocking) {
                await (sink as unknown as Sink & AsyncDisposable)[
                  Symbol.asyncDispose
                ]();
              } else {
                sink[Symbol.dispose]();
              }
            }
          }
          assert.strictEqual(fs.readFileSync(path, "utf8"), "F\n");
          assert.strictEqual(
            fs.readFileSync(join(directory, first), "utf8"),
            "E\n",
          );
          if (maxFiles === 2) {
            assert.strictEqual(
              fs.readFileSync(join(directory, second), "utf8"),
              "D\n",
            );
          }
          assert.deepStrictEqual(
            fs.readdirSync(directory).sort(),
            (maxFiles === 2
              ? ["app.log", first, second]
              : ["app.log", first]
            ).sort(),
          );
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      });
    }
  }

  test(`getRotatingFileSink() rotates at the maxFiles upper bound with nonBlocking: ${nonBlocking}`, async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), "logtape-"));
    const path = join(directory, "app.log");
    try {
      fs.writeFileSync(path, "A\n");
      fs.writeFileSync(`${path}.999`, "B\n");
      fs.writeFileSync(`${path}.1000`, "C\n");
      const sink = getRotatingFileSink(path, {
        maxFiles: 1000,
        maxSize: 2,
        bufferSize: 0,
        flushInterval: 0,
        nonBlocking,
        formatter: () => "D\n",
      });
      try {
        sink(info);
      } finally {
        if (nonBlocking) {
          await (sink as unknown as Sink & AsyncDisposable)[
            Symbol.asyncDispose
          ]();
        } else {
          sink[Symbol.dispose]();
        }
      }
      assert.strictEqual(fs.readFileSync(path, "utf8"), "D\n");
      assert.strictEqual(fs.readFileSync(`${path}.1`, "utf8"), "A\n");
      assert.strictEqual(fs.readFileSync(`${path}.1000`, "utf8"), "B\n");
      assert.deepStrictEqual(fs.readdirSync(directory).sort(), [
        "app.log",
        "app.log.1",
        "app.log.1000",
      ]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  for (const maxFiles of [0, -1, -Infinity]) {
    test(`getRotatingFileSink() skips path generation with maxFiles: ${maxFiles}, nonBlocking: ${nonBlocking}`, async () => {
      const directory = fs.mkdtempSync(join(tmpdir(), "logtape-"));
      const path = join(directory, "app.log");
      try {
        for (const payload of ["A\n", "B\n", "C\n"]) {
          const sink = getRotatingFileSink(path, {
            maxSize: 2,
            maxFiles,
            bufferSize: 0,
            flushInterval: 0,
            nonBlocking,
            formatter: () => payload,
            rotatedFilePath: () => {
              throw new Error("No backup path should be needed.");
            },
          });
          try {
            sink(info);
          } finally {
            if (nonBlocking) {
              await (sink as unknown as Sink & AsyncDisposable)[
                Symbol.asyncDispose
              ]();
            } else {
              sink[Symbol.dispose]();
            }
          }
        }
        assert.strictEqual(fs.readFileSync(path, "utf8"), "C\n");
        assert.deepStrictEqual(fs.readdirSync(directory), ["app.log"]);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  for (const maxFiles of [
    1001,
    Number.MAX_SAFE_INTEGER,
    Infinity,
    2 ** 54,
    Number.MAX_VALUE,
    Number.MAX_SAFE_INTEGER + 1,
    0.5,
    1.5,
  ]) {
    test(`getBaseRotatingFileSink() rejects maxFiles: ${maxFiles} before side effects with nonBlocking: ${nonBlocking}`, () => {
      assert.throws(
        () =>
          getBaseRotatingFileSink("app.log", {
            ...makeNodeRotatingFileDriver(),
            maxFiles,
            nonBlocking,
            rotatedFilePath(): string {
              assert.fail("Must reject before generating backup paths.");
            },
            statSync(): never {
              assert.fail("Must reject before reading file metadata.");
            },
            openSync(): never {
              assert.fail("Must reject before opening a file.");
            },
          }),
        { name: "RangeError", message: /maxFiles/ },
      );
    });
  }

  for (const existing of [false, true]) {
    test(`getBaseRotatingFileSink() path errors precede file operations with existing: ${existing}, nonBlocking: ${nonBlocking}`, () => {
      const directory = fs.mkdtempSync(join(tmpdir(), "logtape-"));
      const path = join(directory, "app.log");
      const failure = new Error("Cannot generate backup path.");
      const operations: string[] = [];
      const original = makeNodeRotatingFileDriver();
      const driver = {
        ...original,
        openSync(path: string): number {
          operations.push("open");
          return original.openSync(path);
        },
        closeSync(fd: number): void {
          operations.push("close");
          original.closeSync(fd);
        },
        renameSync(oldPath: string, newPath: string): void {
          operations.push("rename");
          original.renameSync(oldPath, newPath);
        },
        unlinkSync(path: string): void {
          operations.push("unlink");
          fs.unlinkSync(path);
        },
      };
      try {
        if (existing) {
          fs.writeFileSync(path, "active\n");
          fs.writeFileSync(join(directory, "app.1.log"), "backup\n");
        }
        assert.throws(
          () =>
            getBaseRotatingFileSink(path, {
              ...driver,
              maxFiles: 2,
              nonBlocking,
              rotatedFilePath(path: string, index: number): string {
                if (index === 2) throw failure;
                return path.replace(/(\.log)?$/, `.${index}$1`);
              },
            }),
          (error: unknown) => error === failure,
        );
        assert.deepStrictEqual(operations, []);
        if (existing) {
          assert.strictEqual(fs.readFileSync(path, "utf8"), "active\n");
          assert.strictEqual(
            fs.readFileSync(join(directory, "app.1.log"), "utf8"),
            "backup\n",
          );
          assert.deepStrictEqual(fs.readdirSync(directory).sort(), [
            "app.1.log",
            "app.log",
          ]);
        } else {
          assert.deepStrictEqual(fs.readdirSync(directory), []);
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  test(`getRotatingFileSink() caches custom paths before opening with nonBlocking: ${nonBlocking}`, async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), "logtape-"));
    const path = `${directory}/./app.log`;
    let constructing = true;
    let generated = false;
    let payload = "A\n";
    try {
      const sink = getRotatingFileSink(path, {
        maxSize: 2,
        maxFiles: 1,
        bufferSize: 0,
        flushInterval: 0,
        nonBlocking,
        formatter: () => payload,
        rotatedFilePath(originalPath: string, index: number): string {
          assert.ok(constructing);
          assert.strictEqual(originalPath, path);
          assert.strictEqual(fs.existsSync(path), false);
          generated = true;
          return originalPath.replace(/(\.log)?$/, `.${index}$1`);
        },
      });
      constructing = false;
      try {
        assert.ok(generated);
        sink(info);
        payload = "B\n";
        sink(info);
      } finally {
        if (nonBlocking) {
          await (sink as unknown as Sink & AsyncDisposable)[
            Symbol.asyncDispose
          ]();
        } else {
          sink[Symbol.dispose]();
        }
      }
      assert.strictEqual(fs.readFileSync(path, "utf8"), "B\n");
      assert.strictEqual(
        fs.readFileSync(join(directory, "app.1.log"), "utf8"),
        "A\n",
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("getBaseRotatingFileSink() passes relative backup paths to the driver verbatim", () => {
  const directory = fs.mkdtempSync(join(tmpdir(), "logtape-"));
  const path = join(directory, "app.log");
  const renames: [string, string][] = [];
  try {
    const sink = getBaseRotatingFileSink(path, {
      ...makeNodeRotatingFileDriver(),
      maxSize: 2,
      maxFiles: 1,
      bufferSize: 0,
      flushInterval: 0,
      formatter: () => "A\n",
      rotatedFilePath: () => "archive.1.log",
      renameSync(oldPath: string, newPath: string): void {
        renames.push([oldPath, newPath]);
      },
    });
    try {
      sink(info);
      sink(info);
    } finally {
      sink[Symbol.dispose]();
    }
    assert.deepStrictEqual(renames, [[path, "archive.1.log"]]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
  let failUnlink = true;
  const sink: Sink & Disposable = getBaseRotatingFileSink(path, {
    ...driver,
    maxSize: 150,
    maxFiles: 0,
    bufferSize: 0,
    unlinkSync(path) {
      if (failUnlink) throw unlinkError;
      driver.unlinkSync!(path);
    },
  });

  sink(debug);
  sink(info);
  assert.throws(() => sink(warning), unlinkError);

  assert.deepStrictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    `\
2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!
2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!
`,
  );
  failUnlink = false;
  sink(error);
  sink[Symbol.dispose]();
  assert.strictEqual(
    fs.readFileSync(path, { encoding: "utf-8" }),
    "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!\n",
  );
  assert.strictEqual(fs.existsSync(`${path}.1`), false);
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
  while (totalChars < 100) {
    // Exceed buffer size
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
