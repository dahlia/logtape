import assert from "node:assert/strict";
import test from "node:test";
import { getLogger, reset } from "@logtape/logtape";
import { configureFromObject } from "./config.ts";
import { logs, resetLogs } from "./test_fixtures.ts";
import { ConfigError } from "./types.ts";

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

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].message, ["test message"]);
    assert.deepStrictEqual(logs[0].category, ["my-app"]);
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

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].message, ["test message"]);
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

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].message, ["test custom shorthand"]);
  } finally {
    await teardown();
  }
});

test("configureFromObject() error handling", async () => {
  await setup();
  try {
    await assert.rejects(
      () =>
        configureFromObject({
          sinks: {
            invalid: {
              type: "#invalid",
            },
          },
        }),
      ConfigError,
    );

    await assert.rejects(
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

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].message, ["partial success"]);
  } finally {
    await teardown();
  }
});
