import assert from "node:assert/strict";
import os from "node:os";
import process from "node:process";
import test from "node:test";
import bunyan from "bunyan";
import { getBunyanSink } from "./mod.ts";

interface BunyanRecord {
  name: string;
  hostname: string;
  pid: number;
  level: number;
  msg: string;
  time: Date;
  v: number;
  [key: string]: unknown;
}

function createLoggerWithBuffer(): {
  logger: bunyan;
  buffer: BunyanRecord[];
} {
  const ring = new bunyan.RingBuffer({ limit: 100 });
  const logger = bunyan.createLogger({
    name: "test",
    level: "trace",
    streams: [{ type: "raw", stream: ring, level: "trace" }],
  });
  return { logger, buffer: ring.records as BunyanRecord[] };
}

test("getBunyanSink(): basic scenario", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sink = getBunyanSink(logger);
  const before = Date.now();
  sink({
    category: ["test", "category"],
    level: "info",
    message: ["Test log: ", { foo: 123 }, ""],
    properties: { value: { foo: 123 } },
    rawMessage: "Test log: {value}",
    timestamp: Date.now(),
  });
  const after = Date.now();
  assert.equal(buffer.length, 1);
  const record = buffer[0];
  assert.equal(record.name, "test");
  assert.equal(record.hostname, os.hostname());
  assert.equal(record.pid, process.pid);
  assert.equal(record.level, 30);
  assert.equal(record.msg, "Test log: { foo: 123 }");
  assert.deepEqual(record.value, { foo: 123 });
  const recordTimeMs = record.time.getTime();
  assert.ok(recordTimeMs >= before);
  assert.ok(recordTimeMs <= after);
});

test("getBunyanSink(): log level mappings", () => {
  const { logger, buffer } = createLoggerWithBuffer();
  const sink = getBunyanSink(logger);
  const cases = [
    { level: "trace", expected: 10 },
    { level: "debug", expected: 20 },
    { level: "info", expected: 30 },
    { level: "warning", expected: 40 },
    { level: "error", expected: 50 },
    { level: "fatal", expected: 60 },
  ] as const;
  for (const { level } of cases) {
    sink({
      category: ["test"],
      level,
      message: [`${level} message`],
      properties: {},
      rawMessage: `${level} message`,
      timestamp: Date.now(),
    });
  }
  assert.equal(buffer.length, cases.length);
  for (let i = 0; i < cases.length; i++) {
    assert.equal(
      buffer[i].level,
      cases[i].expected,
      `Level mapping failed for ${cases[i].level}`,
    );
    assert.equal(buffer[i].msg, `${cases[i].level} message`);
  }
});
