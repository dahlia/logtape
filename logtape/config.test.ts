import { assertEquals } from "@std/assert/assert-equals";
import { assertThrows } from "@std/assert/assert-throws";
import { ConfigError, configure, reset } from "./config.ts";
import type { Filter } from "./filter.ts";
import { LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

Deno.test("configure()", async (t) => {
  await t.step("test", () => {
    const a: Sink = () => {};
    const b: Sink = () => {};
    const cLogs: LogRecord[] = [];
    const c: Sink = cLogs.push.bind(cLogs);
    const x: Filter = () => true;
    const y: Filter = () => true;
    configure({
      sinks: { a, b, c },
      filters: { x, y },
      loggers: [
        {
          category: "my-app",
          sinks: ["a"],
          filters: ["x"],
        },
        {
          category: ["my-app", "foo"],
          sinks: ["b"],
          filters: ["y"],
        },
        {
          category: ["my-app", "bar"],
          sinks: ["c"],
          level: "info",
        },
      ],
    });

    const logger = LoggerImpl.getLogger("my-app");
    assertEquals(logger.sinks, [a]);
    assertEquals(logger.filters, [x]);
    const foo = LoggerImpl.getLogger(["my-app", "foo"]);
    assertEquals(foo.sinks, [b]);
    assertEquals(foo.filters, [y]);
    const bar = LoggerImpl.getLogger(["my-app", "bar"]);
    assertEquals(bar.sinks, [c]);
    bar.debug("ignored");
    assertEquals(cLogs, []);
    bar.info("logged");
    assertEquals(cLogs, [
      {
        level: "info",
        category: ["my-app", "bar"],
        message: ["logged"],
        properties: {},
        timestamp: cLogs[0].timestamp,
      },
    ]);
  });

  await t.step("reconfigure", () => {
    assertThrows(
      () =>
        configure({
          sinks: {},
          filters: {},
          loggers: [{ category: "my-app" }],
        }),
      ConfigError,
      "Already configured",
    );

    // No exception if reset is true:
    configure({
      sinks: {},
      filters: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    });
  });

  await t.step("tear down", () => {
    reset();
  });

  await t.step("misconfiguration", () => {
    assertThrows(
      () =>
        configure({
          // deno-lint-ignore no-explicit-any
          sinks: {} as any,
          filters: {},
          loggers: [
            {
              category: "my-app",
              sinks: ["invalid"],
            },
          ],
          reset: true,
        }),
      ConfigError,
      "Sink not found: invalid",
    );

    assertThrows(
      () =>
        configure({
          sinks: {},
          // deno-lint-ignore no-explicit-any
          filters: {} as any,
          loggers: [
            {
              category: "my-app",
              filters: ["invalid"],
            },
          ],
          reset: true,
        }),
      ConfigError,
      "Filter not found: invalid",
    );
  });

  const metaCategories = [[], ["logtape"], ["logtape", "meta"]];
  for (const metaCategory of metaCategories) {
    await t.step("meta configuration: " + JSON.stringify(metaCategory), () => {
      configure({
        sinks: {},
        filters: {},
        loggers: [
          {
            category: metaCategory,
            sinks: [],
            filters: [],
          },
        ],
      });

      assertEquals(LoggerImpl.getLogger(["logger", "meta"]).sinks, []);
    });

    await t.step("tear down", () => {
      reset();
    });
  }
});
