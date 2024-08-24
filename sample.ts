import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    console: getConsoleSink(),
    otel: getOpenTelemetrySink({ diagnostics: true }),
  },
  filters: {},
  loggers: [
    { category: [], sinks: ["console", "otel"], level: "debug" },
  ],
});

getLogger(["test", "app"]).debug("hello {world}", { world: "debug" });
getLogger(["test", "app"]).info("hello {world}", { world: "info" });
getLogger(["test", "app"]).warn("hello {world}", { world: "warning" });
