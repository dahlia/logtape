import { suite } from "@alinea/suite";
import type { LogLevel } from "@logtape/logtape";
import { assertEquals } from "@std/assert/equals";
import log4js from "log4js";
import { getLog4jsSink } from "./mod.ts";

const test = suite(import.meta);

type LogEntry = { level: string; msg: string; cat?: string; props?: unknown };

test("getLog4jsSink(): basic scenario with custom logger", async () => {
  const logs: LogEntry[] = [];
  log4js.configure({
    appenders: { out: { type: "console" } },
    categories: { default: { appenders: ["out"], level: "trace" } },
  });
  // Patch logger to capture logs
  const logger = {} as Partial<log4js.Logger>;
  ["info", "debug", "warn", "error", "fatal", "trace"].forEach((level) => {
    (logger as unknown as Record<
      string,
      (msgOrProps: unknown, msg?: string) => void
    >)[level] = (msgOrProps: unknown, msg?: string) => {
      logs.push({
        level,
        msg: typeof msgOrProps === "string" ? String(msgOrProps) : '',
      });
    };
  });
  const sink = getLog4jsSink(logger as log4js.Logger, {
    useCategoryLogger: false,
  });
  await sink({
    category: ["default"],
    level: "info",
    message: ["Hello world"],
    properties: {},
    rawMessage: "Hello world",
    timestamp: Date.now(),
  });
  assertEquals(logs.length, 1);
  assertEquals(logs[0].level, "info");
  assertEquals(logs[0].msg, "Hello world");
});

test("getLog4jsSink(): uses default logger if none provided", async () => {
  const sink = getLog4jsSink();
  await sink({
    category: ["default"],
    level: "info",
    message: ["Default logger test"],
    properties: {},
    rawMessage: "Default logger test",
    timestamp: Date.now(),
  });
});

test("getLog4jsSink(): uses category logger if useCategoryLogger is true", async () => {
  const logs: LogEntry[] = [];
  const loggers: Record<string, { info: (msg: string) => void }> = {};
  const log4jsMock = {
    getLogger: (cat: string) => {
      if (!loggers[cat]) {
        loggers[cat] = {
          info: (msg: string) => logs.push({ cat, msg, level: "info" }),
        };
      }
      return loggers[cat];
    },
  };
  // @ts-ignore: Overriding imported module for test
  log4js.getLogger = log4jsMock.getLogger;
  const sink = getLog4jsSink(undefined, { useCategoryLogger: true });
  await sink({
    category: ["foo"],
    level: "info",
    message: ["Test"],
    properties: {},
    rawMessage: "Test",
    timestamp: Date.now(),
  });
  assertEquals(logs.length, 1);
  assertEquals(logs[0].cat, "foo");
  assertEquals(logs[0].msg, "Test");
});

test("getLog4jsSink(): level mapping from LogTape to log4js", async () => {
  const logs: LogEntry[] = [];
  const logger = {
    trace: (msg: string) => logs.push({ level: "trace", msg }),
    debug: (msg: string) => logs.push({ level: "debug", msg }),
    info: (msg: string) => logs.push({ level: "info", msg }),
    warn: (msg: string) => logs.push({ level: "warn", msg }),
    error: (msg: string) => logs.push({ level: "error", msg }),
    fatal: (msg: string) => logs.push({ level: "fatal", msg }),
  } as Partial<log4js.Logger>;
  const sink = getLog4jsSink(logger as log4js.Logger, {
    useCategoryLogger: false,
  });
  const levels = ["trace", "debug", "info", "warning", "error", "fatal"];
  for (const logtapeLevel of levels) {
    await sink({
      category: [],
      level: logtapeLevel as LogLevel,
      message: [logtapeLevel],
      properties: {},
      rawMessage: logtapeLevel,
      timestamp: Date.now(),
    });
  }
  assertEquals(logs.map((l) => l.level), [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
  ]);
});

test("getLog4jsSink(): structured logging passes properties as first arg", async () => {
  const logs: LogEntry[] = [];
  const logger = {
    info: (props: unknown, msg: string) =>
      logs.push({ props, msg, level: "info" }),
  } as Partial<log4js.Logger>;
  const sink = getLog4jsSink(logger as log4js.Logger, {
    useCategoryLogger: false,
  });
  await sink({
    category: [],
    level: "info",
    message: ["Hello"],
    properties: { foo: 1 },
    rawMessage: "Hello",
    timestamp: Date.now(),
  });
  assertEquals(logs.length, 1);
  assertEquals(logs[0].props, { foo: 1 });
  assertEquals(logs[0].msg, "Hello");
});
