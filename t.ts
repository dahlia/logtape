import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getLogger,
} from "./logtape/mod.ts";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: ansiColorFormatter,
    }),
  },
  filters: {},
  loggers: [
    {
      category: "my-app",
      level: "debug",
      sinks: ["console"],
    },
    {
      category: ["logtape", "meta"],
      level: "debug",
      sinks: ["console"],
    },
  ],
});

const logger = getLogger(["my-app", "module"]);
logger.debug`This is a debug log with value: ${({ foo: 123 })}`;
logger.info`This is an informational log.`;
logger.warn`This is a warning`;
logger.error`This is an error with exception: ${new Error(
  "This is an exception.",
)}`;
logger.fatal`This is a fatal error.`;
