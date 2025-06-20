import { getStreamFileSink } from "./streamfilesink.ts";
import { suite } from "@alinea/suite";
import type { LogRecord, Sink } from "@logtape/logtape";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { delay } from "@std/async/delay";
import { join } from "@std/path/join";
import fs from "node:fs";
import { platform, tmpdir } from "node:os";
import { debug, error, fatal, info, warning } from "../logtape/fixtures.ts";

const test = suite(import.meta);

function makeTempFileSync(): string {
  return join(fs.mkdtempSync(join(tmpdir(), "logtape-")), "logtape.txt");
}

test("getStreamFileSink() basic functionality", async () => {
  const path = makeTempFileSync();
  const sink: Sink & Disposable = getStreamFileSink(path);

  sink(debug);
  sink(info);
  sink(warning);
  sink(error);
  sink(fatal);

  sink[Symbol.dispose]();

  // Allow stream to fully flush
  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assertEquals(
    content,
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n" +
      "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n" +
      "2023-11-14 22:13:20.000 +00:00 [WRN] my-app·junk: Hello, 123 & 456!\n" +
      "2023-11-14 22:13:20.000 +00:00 [ERR] my-app·junk: Hello, 123 & 456!\n" +
      "2023-11-14 22:13:20.000 +00:00 [FTL] my-app·junk: Hello, 123 & 456!\n",
  );
});

test("getStreamFileSink() with custom highWaterMark", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path, { highWaterMark: 1024 });

  sink(debug);
  sink(info);
  sink[Symbol.dispose]();

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assertEquals(
    content,
    "2023-11-14 22:13:20.000 +00:00 [DBG] my-app·junk: Hello, 123 & 456!\n" +
      "2023-11-14 22:13:20.000 +00:00 [INF] my-app·junk: Hello, 123 & 456!\n",
  );
});

test("getStreamFileSink() with custom formatter", async () => {
  const path = makeTempFileSync();
  const customFormatter = (record: LogRecord) =>
    `CUSTOM: ${record.message.join("")}\n`;
  const sink = getStreamFileSink(path, { formatter: customFormatter });

  sink(debug);
  sink(info);
  sink[Symbol.dispose]();

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assertEquals(
    content,
    "CUSTOM: Hello, 123 & 456!\n" +
      "CUSTOM: Hello, 123 & 456!\n",
  );
});

test("getStreamFileSink() appends to existing file", async () => {
  const path = makeTempFileSync();

  // Write initial content
  fs.writeFileSync(path, "Initial content\n");

  const sink = getStreamFileSink(path);
  sink(debug);
  sink[Symbol.dispose]();

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.startsWith("Initial content\n"));
  assert(content.includes("Hello, 123 & 456!"));
});

test("getStreamFileSink() high-volume logging", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path, { highWaterMark: 1024 });

  // Write many records quickly to test stream backpressure
  for (let i = 0; i < 100; i++) {
    const record: LogRecord = {
      ...debug,
      message: [`Log entry ${i}`],
    };
    sink(record);
  }

  sink[Symbol.dispose]();
  await delay(100); // Allow streams to finish

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  const lines = content.split("\n").filter((line) => line.length > 0);
  assertEquals(lines.length, 100);

  // Verify first and last entries
  assert(lines[0].includes("Log entry 0"));
  assert(lines[99].includes("Log entry 99"));
});

test("getStreamFileSink() disposal stops writing", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  sink(debug);
  sink[Symbol.dispose]();

  // Writing after disposal should be ignored
  sink(info);
  sink(warning);

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  const lines = content.split("\n").filter((line) => line.length > 0);
  assertEquals(lines.length, 1); // Only debug record
  assert(content.includes("[DBG]"));
  assert(!content.includes("[INF]"));
  assert(!content.includes("[WRN]"));
});

test("getStreamFileSink() double disposal", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  sink(debug);
  sink[Symbol.dispose]();
  sink[Symbol.dispose](); // Should not throw

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  const lines = content.split("\n").filter((line) => line.length > 0);
  assertEquals(lines.length, 1);
});

test("getStreamFileSink() handles rapid disposal", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  sink(debug);
  // Dispose immediately without waiting
  sink[Symbol.dispose]();

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes("Hello, 123 & 456!"));
});

test("getStreamFileSink() concurrent writes", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  // Simulate concurrent logging from different parts of application
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          const record: LogRecord = {
            ...debug,
            message: [`Concurrent log ${i}`],
          };
          sink(record);
          resolve();
        }, Math.random() * 10);
      }),
    );
  }

  await Promise.all(promises);
  sink[Symbol.dispose]();
  await delay(100);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  const lines = content.split("\n").filter((line) => line.length > 0);
  assertEquals(lines.length, 10);

  // All concurrent logs should be present
  for (let i = 0; i < 10; i++) {
    assert(content.includes(`Concurrent log ${i}`));
  }
});

test("getStreamFileSink() with empty records", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  const emptyRecord: LogRecord = {
    ...debug,
    message: [""],
  };

  sink(emptyRecord);
  sink[Symbol.dispose]();

  await delay(50);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes("[DBG]"));
  // Should still write the timestamp and level even with empty message
  assert(content.includes("2023-11-14 22:13:20.000 +00:00"));
});

test("getStreamFileSink() with large messages", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  const largeMessage = "x".repeat(10000);
  const largeRecord: LogRecord = {
    ...debug,
    message: [largeMessage],
  };

  sink(largeRecord);
  sink[Symbol.dispose]();

  await delay(100); // Give more time for large write

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes(largeMessage));
  assert(content.includes("[DBG]"));
});

test("getStreamFileSink() memory efficiency", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  // Create many small records to test memory usage
  for (let i = 0; i < 1000; i++) {
    const record: LogRecord = {
      ...debug,
      message: [`Memory test ${i}`],
    };
    sink(record);

    // Occasionally allow event loop to process
    if (i % 100 === 0) {
      await delay(1);
    }
  }

  sink[Symbol.dispose]();
  await delay(platform() === "win32" ? 1000 : 200);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  const lines = content.split("\n").filter((line) => line.length > 0);
  assertEquals(lines.length, 1000);

  // Verify first and last entries
  assert(lines[0].includes("Memory test 0"));
  assert(lines[999].includes("Memory test 999"));
});

test("getStreamFileSink() creates new file when it doesn't exist", async () => {
  // Use a file that doesn't exist yet
  const tempDir = fs.mkdtempSync(join(tmpdir(), "logtape-"));
  const path = join(tempDir, "new-file.log");

  const sink = getStreamFileSink(path);
  sink(debug);
  sink[Symbol.dispose]();

  await delay(50);

  // File should have been created
  assert(fs.existsSync(path));
  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes("Hello, 123 & 456!"));
});

test("getStreamFileSink() multiple instances on same file", async () => {
  const path = makeTempFileSync();

  const sink1 = getStreamFileSink(path);
  const sink2 = getStreamFileSink(path);

  sink1(debug);
  sink2(info);

  sink1[Symbol.dispose]();
  sink2[Symbol.dispose]();

  await delay(100);

  const content = fs.readFileSync(path, { encoding: "utf-8" });
  assert(content.includes("[DBG]"));
  assert(content.includes("[INF]"));
});

test("getStreamFileSink() stream error handling", async () => {
  const path = makeTempFileSync();
  const sink = getStreamFileSink(path);

  sink(debug);
  sink[Symbol.dispose]();
  await delay(50);

  // Delete the file after disposal
  try {
    fs.unlinkSync(path);
  } catch {
    // Ignore if file doesn't exist
  }

  // These writes after disposal should be ignored
  sink(info);
  sink(warning);

  // Test should complete without throwing
  assert(true);
});
