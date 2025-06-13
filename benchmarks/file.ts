import { getFileSink, getStreamFileSink } from "@logtape/file";
import * as logtape from "@logtape/logtape";
// @ts-types="@types/bunyan"
import bunyan from "bunyan";
import log4js from "log4js";
import { bench, run, summary } from "mitata";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pino } from "pino";
// @ts-types="@types/signale"
import signale from "signale";
import winston from "winston";

summary(() => {
  bench("LogTape", async function* () {
    const tempFile = join(tmpdir(), `logtape-bench-${Date.now()}.log`);
    await logtape.configure({
      sinks: {
        file: getFileSink(tempFile),
      },
      loggers: [
        { category: [], sinks: ["file"] },
      ],
      reset: true,
    });
    const logger = logtape.getLogger();
    yield () => logger.info("Test log message.");
    await logtape.reset();
  });

  bench("LogTape (stream)", async function* () {
    const tempFile = join(tmpdir(), `logtape-stream-bench-${Date.now()}.log`);
    await logtape.configure({
      sinks: {
        file: getStreamFileSink(tempFile),
      },
      loggers: [
        { category: [], sinks: ["file"] },
      ],
      reset: true,
    });
    const logger = logtape.getLogger();
    yield () => logger.info("Test log message.");
    await logtape.reset();
  });

  bench("winston", function* () {
    const tempFile = join(tmpdir(), `winston-bench-${Date.now()}.log`);
    const logger = winston.createLogger({
      transports: [
        new winston.transports.File({ filename: tempFile }),
      ],
    });
    yield () => logger.info("Test log message.");
  });

  bench("pino", function* () {
    const tempFile = join(tmpdir(), `pino-bench-${Date.now()}.log`);
    const logger = pino(pino.destination(tempFile));
    yield () => logger.info("Test log message.");
  });

  bench("bunyan", function* () {
    const tempFile = join(tmpdir(), `bunyan-bench-${Date.now()}.log`);
    const logger = bunyan.createLogger({
      name: "benchmarks",
      streams: [
        {
          path: tempFile,
        },
      ],
    });
    yield () => logger.info("Test log message.");
  });

  bench("log4js", function* () {
    const tempFile = join(tmpdir(), `log4js-bench-${Date.now()}.log`);
    log4js.configure({
      appenders: {
        file: {
          type: "file",
          filename: tempFile,
        },
      },
      categories: {
        default: { appenders: ["file"], level: "trace" },
      },
    });
    const logger = log4js.getLogger();
    yield () => logger.info("Test log message.");
  });

  bench("Signale", function* () {
    const tempFile = join(tmpdir(), `signale-bench-${Date.now()}.log`);
    const logger = new signale.Signale({
      // @ts-ignore: they are compatible
      stream: createWriteStream(tempFile, { flags: "a" }),
    });
    yield () => logger.info("Test log message.");
  });
});

await run();

// cSpell: ignore signale
