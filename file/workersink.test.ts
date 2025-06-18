import { getWorkerFileSink } from "#workersink";
import { suite } from "@alinea/suite";
import type { LogRecord } from "@logtape/logtape";
import { assertEquals } from "@std/assert";
import { delay } from "@std/async/delay";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const test = suite(import.meta);

test("getWorkerFileSink() creates a working sink", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "logtape_worker_test_"));
  const logFile = join(tmpDir, "test.log");

  await using sink = await getWorkerFileSink(logFile, {
    formatter: (record: LogRecord) => `${record.message.join("")}\n`,
  });

  // Worker is already initialized at this point
  const record: LogRecord = {
    category: ["test"],
    level: "info",
    message: ["Hello, world!"],
    rawMessage: "Hello, world!",
    timestamp: Date.now(),
    properties: {},
  };

  sink(record);

  // Give the worker some time to write the log
  await delay(100);

  // Wait for file to be created and have content
  let content = "";
  for (let i = 0; i < 10; i++) {
    try {
      const buffer = await readFile(logFile);
      content = buffer.toString("utf8");
      if (content.trim()) break;
    } catch {
      // File might not exist yet
    }
    await delay(50);
  }

  assertEquals(content.trim(), "Hello, world!");

  await rm(tmpDir, { recursive: true });
});

test("getWorkerFileSink() with custom formatter", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "logtape_worker_test_"));
  const logFile = join(tmpDir, "test.log");

  await using sink = await getWorkerFileSink(logFile, {
    formatter: (record: LogRecord) =>
      `[${record.level}] ${record.message.join("")}\n`,
  });

  // Worker is already initialized at this point
  const record: LogRecord = {
    category: ["test"],
    level: "warning",
    message: ["Warning message"],
    rawMessage: "Warning message",
    timestamp: Date.now(),
    properties: {},
  };

  sink(record);

  // Give the worker some time to write the log
  await delay(100);

  // Wait for file to be created and have content
  let content = "";
  for (let i = 0; i < 10; i++) {
    try {
      const buffer = await readFile(logFile);
      content = buffer.toString("utf8");
      if (content.trim()) break;
    } catch {
      // File might not exist yet
    }
    await delay(50);
  }

  assertEquals(content.trim(), "[warning] Warning message");

  await rm(tmpDir, { recursive: true });
});

test("getWorkerFileSink() handles multiple logs", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "logtape_worker_test_"));
  const logFile = join(tmpDir, "test.log");

  await using sink = await getWorkerFileSink(logFile, {
    formatter: (record: LogRecord) => `${record.message.join("")}\n`,
  });

  // Worker is already initialized at this point
  const records: LogRecord[] = [
    {
      category: ["test"],
      level: "info",
      message: ["First log"],
      rawMessage: "First log",
      timestamp: Date.now(),
      properties: {},
    },
    {
      category: ["test"],
      level: "info",
      message: ["Second log"],
      rawMessage: "Second log",
      timestamp: Date.now(),
      properties: {},
    },
    {
      category: ["test"],
      level: "info",
      message: ["Third log"],
      rawMessage: "Third log",
      timestamp: Date.now(),
      properties: {},
    },
  ];

  for (const record of records) {
    sink(record);
  }

  // Give the worker some time to write all logs
  await delay(200);

  const buffer = await readFile(logFile);
  const content = buffer.toString("utf8");
  const lines = content.trim().split("\n");
  assertEquals(lines.length, 3);
  assertEquals(lines[0], "First log");
  assertEquals(lines[1], "Second log");
  assertEquals(lines[2], "Third log");

  await rm(tmpDir, { recursive: true });
});

test("getWorkerFileSink() properly disposes resources", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "logtape_worker_test_"));
  const logFile = join(tmpDir, "test.log");

  {
    await using sink = await getWorkerFileSink(logFile, {
      formatter: (record: LogRecord) => `${record.message.join("")}\n`,
    });

    // Worker is already initialized at this point
    const record: LogRecord = {
      category: ["test"],
      level: "info",
      message: ["Disposal test"],
      rawMessage: "Disposal test",
      timestamp: Date.now(),
      properties: {},
    };

    sink(record);
  } // Sink should be disposed here

  // Give the worker some time to flush and close
  await delay(200);

  const buffer = await readFile(logFile);
  const content = buffer.toString("utf8");
  assertEquals(content.trim(), "Disposal test");

  await rm(tmpDir, { recursive: true });
});
