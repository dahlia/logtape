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

summary(() => {
  bench("LogTape", async function* () {
    await logtape.configure({
      sinks: {
        console: logtape.getConsoleSink({ nonBlocking: false }),
      },
      loggers: [
        { category: [], sinks: ["console"] },
      ],
      reset: true,
    });
    const logger = logtape.getLogger();
    yield () => logger.info("Test log message.");
    await logtape.reset();
  });

  bench("winston", function* () {
    const logger = winston.createLogger({
      transports: [
        new winston.transports.Console(),
      ],
    });
    yield () => logger.info("Test log message.");
  });

  bench("pino", function* () {
    const logger = pino();
    yield () => logger.info("Test log message.");
  });

  bench("bunyan", function* () {
    const logger = bunyan.createLogger({
      name: "benchmarks",
      stream: process.stdout,
    });
    yield () => logger.info("Test log message.");
  });

  bench("log4js", function* () {
    log4js.configure({
      appenders: {
        console: { type: "console" },
      },
      categories: {
        default: { appenders: ["console"], level: "trace" },
      },
    });
    const logger = log4js.getLogger();
    yield () => logger.info("Test log message.");
  });

  bench("Signale", function* () {
    const logger = new signale.Signale();
    yield () => logger.info("Test log message.");
  });

  bench("Hive Logger", function* () {
    const logger = new hiveLogger.Logger({
      writers: [new hiveLogger.ConsoleLogWriter()],
    });
    yield () => logger.info("Test log message.");
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
