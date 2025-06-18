import { getStreamFileSink } from "@logtape/file";
import * as logtape from "@logtape/logtape";
// @ts-types="@types/bunyan"
import bunyan from "bunyan";
import { bench, run, summary } from "mitata";
import { devNull } from "node:os";
import { pino } from "pino";
import winston from "winston";

summary(() => {
  bench("LogTape", async function* () {
    await logtape.configure({
      sinks: {
        file: getStreamFileSink(devNull, {
          formatter: logtape.jsonLinesFormatter,
        }),
      },
      loggers: [
        { category: [], sinks: ["file"] },
      ],
      reset: true,
    });
    const logger = logtape.getLogger();
    yield () => logger.info("Test log message: {*}", { foo: 1, bar: 2 });
    await logtape.reset();
  });

  bench("winston", function* () {
    const logger = winston.createLogger({
      transports: [
        new winston.transports.File({
          filename: devNull,
          format: winston.format.json(),
        }),
      ],
    });
    yield () => logger.info("Test log message: %s", { foo: 1, bar: 2 });
  });

  bench("pino", function* () {
    const logger = pino(pino.destination(devNull));
    yield () => logger.info("Test log message: %o", { foo: 1, bar: 2 });
  });

  bench("bunyan", function* () {
    const logger = bunyan.createLogger({
      name: "benchmarks",
      streams: [
        { path: devNull },
      ],
    });
    yield () => logger.info("Test log message: %s", { foo: 1, bar: 2 });
  });
});

await run();
