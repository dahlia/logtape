import assert from "node:assert/strict";
import test from "node:test";

import { configure, type LogRecord, reset } from "@logtape/logtape";
import { createSchema, createYoga } from "graphql-yoga";

import { getYogaLogger } from "./mod.ts";

test("getYogaLogger(): uses default category ['graphql-yoga']", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.info("Starting Yoga");

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["graphql-yoga"]);
  } finally {
    await cleanup();
  }
});

test("getYogaLogger(): accepts custom category array", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger({ category: ["myapp", "graphql"] });

    logger.info("Starting Yoga");

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["myapp", "graphql"]);
  } finally {
    await cleanup();
  }
});

test("getYogaLogger(): accepts string category", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger({ category: "graphql" });

    logger.info("Starting Yoga");

    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(logs[0].category, ["graphql"]);
  } finally {
    await cleanup();
  }
});

test("getYogaLogger(): maps Yoga levels to LogTape levels", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.debug("Debug log");
    logger.info("Info log");
    logger.warn("Warning log");
    logger.error("Error log");

    assert.deepStrictEqual(
      logs.map((record) => record.level),
      ["debug", "info", "warning", "error"],
    );
  } finally {
    await cleanup();
  }
});

test("getYogaLogger(): accepts custom level mapping", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger({
      levelsMap: {
        debug: "trace",
        warn: "error",
      },
    });

    logger.debug("Debug log");
    logger.warn("Warning log");

    assert.deepStrictEqual(
      logs.map((record) => record.level),
      ["trace", "error"],
    );
  } finally {
    await cleanup();
  }
});

test("getYogaLogger(): ignores undefined level mapping values", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const levelsMap = {
      debug: undefined,
    } as Partial<Record<"debug", never>>;
    const logger = getYogaLogger({ levelsMap });

    logger.debug("Debug log");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "debug");
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs string messages", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.info("Processing GraphQL Parameters");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{message}");
    assert.deepStrictEqual(logs[0].message, [
      "",
      "Processing GraphQL Parameters",
      "",
    ]);
    assert.deepStrictEqual(logs[0].properties, {
      message: "Processing GraphQL Parameters",
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: treats string messages as literal text", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.debug("query { hello }");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{message}");
    assert.deepStrictEqual(logs[0].message, ["", "query { hello }", ""]);
    assert.deepStrictEqual(logs[0].properties, {
      message: "query { hello }",
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: preserves rest arguments as structured data", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.debug("GraphQL event", "execute-start", { operationName: "Hello" });

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{message}");
    assert.deepStrictEqual(logs[0].properties, {
      message: "GraphQL event",
      args: ["execute-start", { operationName: "Hello" }],
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs errors with LogTape error shorthand", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();
    const error = new Error("Resolver failed");

    logger.error(error);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "error");
    assert.strictEqual(logs[0].rawMessage, "{error.message}");
    assert.strictEqual(logs[0].properties.error, error);
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs errors with rest arguments", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();
    const error = new Error("Masked error");

    logger.error(error, { requestId: "req-1" });

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].properties.error, error);
    assert.deepStrictEqual(logs[0].properties.args, [{ requestId: "req-1" }]);
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs warning-level errors", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();
    const error = new Error("Validation failed");

    logger.warn(error);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, "warning");
    assert.strictEqual(logs[0].rawMessage, "{error.message}");
    assert.strictEqual(logs[0].properties.error, error);
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs a single plain object as properties", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.info({ operationName: "Hello", status: "ok" });

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{*}");
    assert.deepStrictEqual(logs[0].properties, {
      operationName: "Hello",
      status: "ok",
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: preserves plain object keys with rest arguments", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.info({ operationName: "Hello", status: "ok" }, "execute-start");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{*}");
    assert.deepStrictEqual(logs[0].properties, {
      operationName: "Hello",
      status: "ok",
      args: ["execute-start"],
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: avoids args property collisions", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();
    const executionArgs = { operationName: "Hello" };

    logger.debug({ args: executionArgs, phase: "execute" }, "execute-start");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{*}");
    assert.deepStrictEqual(logs[0].properties, {
      args: executionArgs,
      phase: "execute",
      additionalArgs: ["execute-start"],
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: avoids additionalArgs property collisions", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();
    const executionArgs = { operationName: "Hello" };
    const existingAdditionalArgs = ["existing"];

    logger.debug({
      args: executionArgs,
      additionalArgs: existingAdditionalArgs,
    }, "execute-start");

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{*}");
    assert.deepStrictEqual(logs[0].properties, {
      args: executionArgs,
      additionalArgs: existingAdditionalArgs,
      restArgs: ["execute-start"],
    });
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs non-plain values as args", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();
    const timestamp = new Date("2026-07-02T00:00:00Z");

    logger.info(timestamp);

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "{*}");
    assert.deepStrictEqual(logs[0].properties.args, [timestamp]);
  } finally {
    await cleanup();
  }
});

test("YogaLogger method: logs an empty call", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const logger = getYogaLogger();

    logger.info();

    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].rawMessage, "GraphQL Yoga log");
  } finally {
    await cleanup();
  }
});

test("getYogaLogger(): integrates with GraphQL Yoga logging option", async () => {
  const { logs, cleanup } = await setupLogtape();
  try {
    const yoga = createYoga({
      schema: createSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            hello: String!
          }
        `,
        resolvers: {
          Query: {
            hello: () => "world",
          },
        },
      }),
      logging: getYogaLogger(),
    });

    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ hello }" }),
    });

    assert.strictEqual(response.status, 200);
    assert.ok(logs.length > 0);
    assert.ok(
      logs.some((record) =>
        record.category.join(".") === "graphql-yoga" &&
        record.properties.message === "Processing GraphQL Parameters"
      ),
    );
  } finally {
    await cleanup();
  }
});

function createTestSink(): {
  sink: (record: LogRecord) => void;
  logs: LogRecord[];
} {
  const logs: LogRecord[] = [];
  return {
    sink: (record: LogRecord) => {
      if (record.category[0] !== "logtape") {
        logs.push(record);
      }
    },
    logs,
  };
}

async function setupLogtape(): Promise<{
  logs: LogRecord[];
  cleanup: () => Promise<void>;
}> {
  const { sink, logs } = createTestSink();
  await configure({
    sinks: { test: sink },
    loggers: [{ category: [], sinks: ["test"] }],
  });
  return { logs, cleanup: () => reset() };
}
