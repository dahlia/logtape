import { suite } from "@alinea/suite";
import { assertEquals, assertRejects } from "@std/assert";
import { configureFromObject } from "./config.ts";
import { getLogger, reset } from "@logtape/logtape";
import { ConfigError } from "./types.ts";
import { logs, resetLogs } from "./test_fixtures.ts";

const test = suite(import.meta);

const fixturesModule = new URL("./test_fixtures.ts", import.meta.url).href;

async function setup() {
  await reset();
  resetLogs();
}

async function teardown() {
  await reset();
  resetLogs();
}

test("configureFromObject() with factory sink", async () => {
  await setup();
  try {
    await configureFromObject({
      sinks: {
        spy: {
          type: `${fixturesModule}#getSpySink()`,
        },
      },
      loggers: [
        {
          category: "my-app",
          sinks: ["spy"],
          lowestLevel: "info",
        },
      ],
    });

    const logger = getLogger("my-app");
    logger.info("test message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].message, ["test message"]);
    assertEquals(logs[0].category, ["my-app"]);
  } finally {
    await teardown();
  }
});

test("configureFromObject() with direct sink value", async () => {
  await setup();
  try {
    await configureFromObject({
      sinks: {
        direct: {
          type: `${fixturesModule}#directSink`,
        },
      },
      loggers: [
        {
          category: "my-app",
          sinks: ["direct"],
          lowestLevel: "info",
        },
      ],
    });

    const logger = getLogger("my-app");
    logger.info("test message");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].message, ["test message"]);
  } finally {
    await teardown();
  }
});

test("configureFromObject() with shorthand factory", async () => {
  await setup();
  try {
    await configureFromObject({
      sinks: {
        console: {
          type: "#console()",
        },
      },
      loggers: [
        {
          category: "app",
          sinks: ["console"],
          lowestLevel: "error",
        },
      ],
    });

    const logger = getLogger("app");
    logger.error("this is a test error");
  } finally {
    await teardown();
  }
});

test("configureFromObject() with custom shorthands", async () => {
  await setup();
  try {
    await configureFromObject(
      {
        sinks: {
          custom: {
            type: "#spy()",
          },
        },
        loggers: [
          {
            category: "app",
            sinks: ["custom"],
            lowestLevel: "info",
          },
        ],
      },
      {
        shorthands: {
          sinks: {
            spy: `${fixturesModule}#getSpySink`,
          },
        },
      },
    );

    const logger = getLogger("app");
    logger.info("test custom shorthand");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].message, ["test custom shorthand"]);
  } finally {
    await teardown();
  }
});

test("configureFromObject() error handling", async () => {
  await setup();
  try {
    await assertRejects(
      () =>
        configureFromObject({
          sinks: {
            invalid: {
              type: "#invalid",
            },
          },
        }),
      ConfigError,
      "Unknown sink shorthand",
    );

    await assertRejects(
      () =>
        configureFromObject({
          sinks: {
            console: { type: "#console()" },
          },
          loggers: [
            {
              category: "app",
              sinks: ["missing"],
            },
          ],
        }),
      ConfigError,
      "references unknown or failed sink 'missing'",
    );
  } finally {
    await teardown();
  }
});

test("configureFromObject() warn on invalid config", async () => {
  await setup();
  try {
    await configureFromObject(
      {
        sinks: {
          valid: { type: `${fixturesModule}#getSpySink()` },
          invalid: { type: "#invalid" },
        },
        loggers: [
          {
            category: "app",
            sinks: ["valid", "invalid", "missing"],
            lowestLevel: "info",
          },
        ],
      },
      { onInvalidConfig: "warn" },
    );

    const logger = getLogger("app");
    logger.info("partial success");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].message, ["partial success"]);
  } finally {
    await teardown();
  }
});
