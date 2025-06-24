import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { delay } from "@std/async/delay";
import log4js from "log4js";
import { getLog4jsSink } from "./mod.ts";

const test = suite(import.meta);

test("getLog4jsSink(): basic scenario with custom logger", async () => {
  const logs: any[] = [];
  const logger = log4js.createLogger({
    appenders: { out: { type: "console" } },
    categories: { default: { appenders: ["out"], level: "trace" } },
  });
  // Patch logger to capture logs
  ["info", "debug", "warn", "error", "fatal", "trace"].forEach((level) => {
    logger[level] = (msgOrProps: any, msg?: string) => {
      logs.push({ level, msg: msg ?? msgOrProps });
    };
  });
  const sink = getLog4jsSink(logger);
  await sink({
    category: ["test"],
    level: "info",
    message: ["Hello, world!"],
    properties: {},
    rawMessage: "Hello, world!",
    timestamp: Date.now(),
  });
  await delay(10);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].level, "info");
  assertEquals(logs[0].msg, "Hello, world!");
});

test("getLog4jsSink(): uses default logger if none provided", async () => {
  const sink = getLog4jsSink();
  // Should not throw and should be callable
  sink({
    category: ["default"],
    level: "info",
    message: ["Default logger test"],
    properties: {},
    rawMessage: "Default logger test",
    timestamp: Date.now(),
  });
});

test("getLog4jsSink(): uses category logger if useCategoryLogger is true", async () => {
  const logs: any[] = [];
  const loggers: Record<string, any> = {};
  const fakeLog4js = {
    getLogger: (cat: string) => {
      if (!loggers[cat]) {
        loggers[cat] = {
          info: (msg: any) => logs.push({ cat, msg }),
        };
      }
      return loggers[cat];
    },
  };
  // Patch dynamic import  
  const originalRequire = globalThis.require;  
  try {  
    // @ts-ignore  
    globalThis.require = () => fakeLog4js;  
    const sink = getLog4jsSink(undefined, { useCategoryLogger: true });  
    await sink({  
      category: ["foo", "bar"],  
      level: "info",  
      message: ["Category logger test"],  
      properties: {},  
      rawMessage: "Category logger test",  
      timestamp: Date.now(),  
    });  
    assertEquals(logs.length, 1);  
    assertEquals(logs[0].cat, "foo.bar");  
  } finally {  
    // Clean up  
    // @ts-ignore  
    globalThis.require = originalRequire;  
  }
});

test("getLog4jsSink(): level mapping from LogTape to log4js", async () => {
  const logs: any[] = [];
  const logger = {
    trace: (msg: any) => logs.push({ level: "trace", msg }),
    debug: (msg: any) => logs.push({ level: "debug", msg }),
    info: (msg: any) => logs.push({ level: "info", msg }),
    warn: (msg: any) => logs.push({ level: "warn", msg }),
    error: (msg: any) => logs.push({ level: "error", msg }),
    fatal: (msg: any) => logs.push({ level: "fatal", msg }),
  };
  const sink = getLog4jsSink(logger as any);
  for (const [logtapeLevel] of [  
    ["trace", "trace"],  
    ["debug", "debug"],  
    ["info", "info"],  
    ["warning", "warn"],  
    ["error", "error"],  
    ["fatal", "fatal"],  
  ]) {  
    await sink({  
      category: ["x"],  
      level: logtapeLevel as any,  
      message: [logtapeLevel],  
      properties: {},  
      rawMessage: logtapeLevel,  
      timestamp: Date.now(),  
    });  
  }
  await delay(10);
  assertEquals(logs.map(l => l.level), ["trace", "debug", "info", "warn", "error", "fatal"]);
});

test("getLog4jsSink(): structured logging passes properties as first arg", async () => {
  const logs: any[] = [];
  const logger = {
    info: (props: any, msg: string) => logs.push({ props, msg }),
  };
  const sink = getLog4jsSink(logger as any);
  await sink({
    category: ["struct"],
    level: "info",
    message: ["Structured"],
    properties: { foo: 42 },
    rawMessage: "Structured",
    timestamp: Date.now(),
  });
  await delay(10);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].props, { foo: 42 });
  assertEquals(logs[0].msg, "Structured");
}); 
