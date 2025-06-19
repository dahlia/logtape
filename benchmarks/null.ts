import * as hiveLogger from "@graphql-hive/logger";
import * as logtape from "@logtape/logtape";
// @ts-types="@types/bunyan"
import bunyan from "bunyan";
import log4js from "log4js";
import { bench, run, summary } from "mitata";
import { Writable } from "node:stream";
import { pino } from "pino";
import pinoBuild from "pino-abstract-transport";
// @ts-types="@types/signale"
import signale from "signale";
import winston from "winston";
import WinstonTransport from "winston-transport";

summary(() => {
  bench("LogTape", async function* () {
    await logtape.configure({
      sinks: {
        null(_record: logtape.LogRecord) {
        },
      },
      loggers: [
        { category: [], sinks: ["null"] },
      ],
      reset: true,
    });
    const logger = logtape.getLogger();
    yield () => logger.info("Test log message.");
    await logtape.reset();
  });

  bench("winston", function* () {
    class NullTransport extends WinstonTransport {
      // deno-lint-ignore no-explicit-any
      constructor(opts: any) {
        super(opts);
      }
      // deno-lint-ignore no-explicit-any
      override log(_info: any, callback: () => void) {
        callback();
      }
    }
    const logger = winston.createLogger({
      transports: [
        new NullTransport({}),
      ],
    });
    yield () => logger.info("Test log message.");
  });

  bench("pino", function* () {
    const nullTransport = pinoBuild(() => {}, {});
    const logger = pino(nullTransport);
    yield () => logger.info("Test log message.");
  });

  bench("bunyan", function* () {
    const logger = bunyan.createLogger({
      name: "benchmarks",
      streams: [
        {
          stream: new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            },
          }),
        },
      ],
    });
    yield () => logger.info("Test log message.");
  });

  bench("log4js", function* () {
    const nullAppender: log4js.AppenderModule = {
      configure() {
        return (_event) => {};
      },
    };
    log4js.configure({
      appenders: {
        null: {
          type: nullAppender,
        },
      },
      categories: {
        default: { appenders: ["null"], level: "trace" },
      },
    });
    const logger = log4js.getLogger();
    yield () => logger.info("Test log message.");
  });

  bench("Signale", function* () {
    const logger = new signale.Signale({
      // @ts-ignore: they are compatible
      stream: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
    });
    yield () => logger.info("Test log message.");
  });

  bench("Hive Logger", function* () {
    class NullLogWriter implements hiveLogger.LogWriter {
      write(
        _level: hiveLogger.LogLevel,
        _attrs: hiveLogger.Attributes,
        _msg: string,
      ) {
      }
      flush() {
      }
    }
    const logger = new hiveLogger.Logger({ writers: [new NullLogWriter()] });
    yield () => logger.info("Test log message.");
  });
});

await run();

// cSpell: ignore signale
