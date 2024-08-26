import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import "@std/dotenv/load";

await configure({
  sinks: {
    console: getConsoleSink(),
    otel: getOpenTelemetrySink({
      messageType: "array",
      diagnostics: true,
    }),
  },
  filters: {},
  loggers: [
    { category: [], sinks: ["console", "otel"], level: "debug" },
  ],
});

getLogger(["test", "app"]).debug("hello {world} at {timestamp}", {
  world: "debug",
  timestamp: new Date(),
});
getLogger(["test", "app"]).info("hello {world} with {object}", {
  world: "info",
  object: new Uint8Array([1, 2, 3]),
});
getLogger(["test", "app"]).warn("hello {world}", { world: "warning" });
