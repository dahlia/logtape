import { assertEquals } from "@std/assert/assert-equals";
import { assertRejects } from "@std/assert/assert-rejects";
import { ConfigError, configure, reset } from "./config.ts";
import type { Filter } from "./filter.ts";
import { LoggerImpl } from "./logger.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

Deno.test("configure()", async (t) => {
  let disposed = 0;

  await t.step("test", async () => {
    const a: Sink = () => {};
    const b: Sink & Disposable = () => {};
    b[Symbol.dispose] = () => ++disposed;
    const cLogs: LogRecord[] = [];
    const c: Sink = cLogs.push.bind(cLogs);
    const x: Filter = () => true;
    const y: Filter & Disposable = () => true;
    y[Symbol.dispose] = () => ++disposed;
    await configure({
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

  await t.step("reconfigure", async () => {
    await assertRejects(
      () =>
        configure({
          sinks: {},
          filters: {},
          loggers: [{ category: "my-app" }],
        }),
      ConfigError,
      "Already configured",
    );
    assertEquals(disposed, 0);

    // No exception if reset is true:
    await configure({
      sinks: {},
      filters: {},
      loggers: [{ category: "my-app" }],
      reset: true,
    });
    assertEquals(disposed, 2);
  });

  await t.step("tear down", async () => {
    await reset();
  });

  await t.step("misconfiguration", async () => {
    await assertRejects(
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

    await assertRejects(
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
    await t.step(
      "meta configuration: " + JSON.stringify(metaCategory),
      async () => {
        await configure({
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
      },
    );

    await t.step("tear down", async () => {
      await reset();
    });
  }
});
