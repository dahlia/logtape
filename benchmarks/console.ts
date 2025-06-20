import * as hiveLogger from "@graphql-hive/logger";
import * as logtape from "@logtape/logtape";
// @ts-types="@types/bunyan"
import bunyan from "bunyan";
import log4js from "log4js";
import { bench, run, summary } from "mitata";
import process from "node:process";
import { pino } from "pino";
// @ts-types="@types/signale"
import signale from "signale";
import winston from "winston";

function mocklog(which: "stdout" | "console.info") {
  let iterations = 0;
  let invokations = 0;

  let unmock: () => void;
  if (which === "stdout") {
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any, cb: any) => {
      invokations++;
      return origWrite(chunk, cb);
    };
    unmock = () => {
      process.stdout.write = origWrite;
    };
  } else {
    const origInfo = globalThis.console.info.bind(globalThis.console);
    globalThis.console.info = (...args: any[]) => {
      invokations++;
      return origInfo(...args);
    };
    unmock = () => {
      globalThis.console.info = origInfo;
    };
  }

  return {
    count(cb: () => void) {
      return () => {
        iterations++;
        cb();
      };
    },
    check() {
      if (iterations > invokations) {
        throw new Error(
          `${
            iterations - invokations
          } invokations missing, out of ${iterations} iterations.`
        );
      }
    },
    unmock,
  };
}

summary(() => {
  bench("LogTape", async function* () {
    const { count, unmock, check } = mocklog("console.info");
    await logtape.configure({
      sinks: { console: logtape.getConsoleSink({ nonBlocking: false }) },
      loggers: [{ category: [], sinks: ["console"] }],
      reset: true,
    });
    const logger = logtape.getLogger();
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
    await logtape.reset();
  });

  bench("winston", function* () {
    const { count, unmock, check } = mocklog("stdout");
    const logger = winston.createLogger({
      transports: [new winston.transports.Console()],
    });
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
  });

  bench("pino", function* () {
    const { count, unmock, check } = mocklog("stdout");
    const logger = pino();
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
  });

  bench("bunyan", function* () {
    const { count, unmock, check } = mocklog("stdout");
    const logger = bunyan.createLogger({
      name: "benchmarks",
    });
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
  });

  bench("log4js", function* () {
    const { count, unmock, check } = mocklog("stdout");
    log4js.configure({
      appenders: {
        console: { type: "console" },
      },
      categories: {
        default: { appenders: ["console"], level: "trace" },
      },
    });
    const logger = log4js.getLogger();
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
  });

  bench("Signale", function* () {
    const { count, unmock, check } = mocklog("stdout");
    const logger = new signale.Signale();
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
  });

  bench("Hive Logger", function* () {
    const { count, unmock, check } = mocklog("console.info");
    const logger = new hiveLogger.Logger({
      writers: [new hiveLogger.ConsoleLogWriter()],
    });
    yield count(() => logger.info("Test log message."));
    unmock();
    check();
  });
});

let reportOutput = "";
await run({
  print(s) {
    reportOutput += `${s}\n`;
  },
});

process.on("exit", () => {
  console.log(reportOutput);
});

// cSpell: ignore signale
