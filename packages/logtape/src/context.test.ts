import assert from "node:assert/strict";
import test from "node:test";
import { delay } from "@std/async/delay";
import { AsyncLocalStorage } from "node:async_hooks";
import { configure, reset } from "./config.ts";
import { withCategoryPrefix, withContext } from "./context.ts";
import { getLogger } from "./logger.ts";
import type { LogRecord } from "./record.ts";

test("withContext()", async () => {
  const buffer: LogRecord[] = [];

  { // set up
    await configure({
      sinks: {
        buffer: buffer.push.bind(buffer),
      },
      loggers: [
        { category: "my-app", sinks: ["buffer"], lowestLevel: "debug" },
        { category: ["logtape", "meta"], sinks: [], lowestLevel: "warning" },
      ],
      contextLocalStorage: new AsyncLocalStorage(),
      reset: true,
    });
  }

  try {
    // test
    getLogger("my-app").debug("hello", { foo: 1, bar: 2 });
    assert.deepStrictEqual(buffer, [
      {
        category: ["my-app"],
        level: "debug",
        message: ["hello"],
        rawMessage: "hello",
        properties: { foo: 1, bar: 2 },
        timestamp: buffer[0].timestamp,
      },
    ]);
    buffer.pop();
    const rv = withContext({ foo: 3, baz: 4 }, () => {
      getLogger("my-app").debug("world", { foo: 1, bar: 2 });
      return 123;
    });
    assert.deepStrictEqual(rv, 123);
    assert.deepStrictEqual(buffer, [
      {
        category: ["my-app"],
        level: "debug",
        message: ["world"],
        rawMessage: "world",
        properties: { foo: 1, bar: 2, baz: 4 },
        timestamp: buffer[0].timestamp,
      },
    ]);
    buffer.pop();
    getLogger("my-app").debug("hello", { foo: 1, bar: 2 });
    assert.deepStrictEqual(buffer, [
      {
        category: ["my-app"],
        level: "debug",
        message: ["hello"],
        rawMessage: "hello",
        properties: { foo: 1, bar: 2 },
        timestamp: buffer[0].timestamp,
      },
    ]);

    // nesting
    while (buffer.length > 0) buffer.pop();
    withContext({ foo: 1, bar: 2 }, () => {
      withContext({ foo: 3, baz: 4 }, () => {
        getLogger("my-app").debug("hello");
      });
    });
    assert.deepStrictEqual(buffer, [
      {
        category: ["my-app"],
        level: "debug",
        message: ["hello"],
        rawMessage: "hello",
        properties: { foo: 3, bar: 2, baz: 4 },
        timestamp: buffer[0].timestamp,
      },
    ]);

    // concurrent runs
    while (buffer.length > 0) buffer.pop();
    await Promise.all([
      (async () => {
        await delay(Math.random() * 100);
        withContext({ foo: 1 }, () => {
          getLogger("my-app").debug("foo");
        });
      })(),
      (async () => {
        await delay(Math.random() * 100);
        withContext({ bar: 2 }, () => {
          getLogger("my-app").debug("bar");
        });
      })(),
      (async () => {
        await delay(Math.random() * 100);
        withContext({ baz: 3 }, () => {
          getLogger("my-app").debug("baz");
        });
      })(),
      (async () => {
        await delay(Math.random() * 100);
        withContext({ qux: 4 }, () => {
          getLogger("my-app").debug("qux");
        });
      })(),
    ]);
    assert.deepStrictEqual(buffer.length, 4);
    for (const log of buffer) {
      if (log.message[0] === "foo") {
        assert.deepStrictEqual(log.properties, { foo: 1 });
      } else if (log.message[0] === "bar") {
        assert.deepStrictEqual(log.properties, { bar: 2 });
      } else if (log.message[0] === "baz") {
        assert.deepStrictEqual(log.properties, { baz: 3 });
      } else {
        assert.deepStrictEqual(log.properties, { qux: 4 });
      }
    }
  } finally {
    await reset();
  }

  const metaBuffer: LogRecord[] = [];

  { // set up
    await configure({
      sinks: {
        buffer: buffer.push.bind(buffer),
        metaBuffer: metaBuffer.push.bind(metaBuffer),
      },
      loggers: [
        { category: "my-app", sinks: ["buffer"], lowestLevel: "debug" },
        {
          category: ["logtape", "meta"],
          sinks: ["metaBuffer"],
          lowestLevel: "warning",
        },
      ],
      reset: true,
    });
  }

  try { // without settings
    while (buffer.length > 0) buffer.pop();
    const rv = withContext({ foo: 1 }, () => {
      getLogger("my-app").debug("hello", { bar: 2 });
      return 123;
    });
    assert.deepStrictEqual(rv, 123);
    assert.deepStrictEqual(buffer, [
      {
        category: ["my-app"],
        level: "debug",
        message: ["hello"],
        rawMessage: "hello",
        properties: { bar: 2 },
        timestamp: buffer[0].timestamp,
      },
    ]);
    assert.deepStrictEqual(metaBuffer, [
      {
        category: ["logtape", "meta"],
        level: "warning",
        message: [
          "Context-local storage is not configured.  " +
          "Specify contextLocalStorage option in the configure() function.",
        ],
        properties: {},
        rawMessage: "Context-local storage is not configured.  " +
          "Specify contextLocalStorage option in the configure() function.",
        timestamp: metaBuffer[0].timestamp,
      },
    ]);
  } finally {
    await reset();
  }
});

test("withCategoryPrefix()", async () => {
  const buffer: LogRecord[] = [];

  { // set up
    await configure({
      sinks: {
        buffer: buffer.push.bind(buffer),
      },
      loggers: [
        { category: [], sinks: ["buffer"], lowestLevel: "debug" },
        { category: ["logtape", "meta"], sinks: [], lowestLevel: "warning" },
      ],
      contextLocalStorage: new AsyncLocalStorage(),
      reset: true,
    });
  }

  try {
    // basic prefix with array
    getLogger(["core-lib"]).debug("without prefix");
    assert.deepStrictEqual(buffer[0].category, ["core-lib"]);
    buffer.pop();

    const rv = withCategoryPrefix(["sdk-1"], () => {
      getLogger(["core-lib"]).debug("with prefix");
      return 123;
    });
    assert.deepStrictEqual(rv, 123);
    assert.deepStrictEqual(buffer[0].category, ["sdk-1", "core-lib"]);
    buffer.pop();

    // prefix should not persist after callback
    getLogger(["core-lib"]).debug("after prefix");
    assert.deepStrictEqual(buffer[0].category, ["core-lib"]);
    buffer.pop();

    // basic prefix with string
    withCategoryPrefix("sdk-2", () => {
      getLogger(["core-lib"]).debug("string prefix");
    });
    assert.deepStrictEqual(buffer[0].category, ["sdk-2", "core-lib"]);
    buffer.pop();

    // nesting prefixes
    withCategoryPrefix(["app"], () => {
      withCategoryPrefix(["sdk-1"], () => {
        getLogger(["core-lib"]).debug("nested");
      });
    });
    assert.deepStrictEqual(buffer[0].category, ["app", "sdk-1", "core-lib"]);
    buffer.pop();

    // combining with withContext
    withCategoryPrefix(["my-sdk"], () => {
      withContext({ requestId: "abc-123" }, () => {
        getLogger(["internal"]).debug("combined");
      });
    });
    assert.deepStrictEqual(buffer[0].category, ["my-sdk", "internal"]);
    assert.deepStrictEqual(buffer[0].properties, { requestId: "abc-123" });
    buffer.pop();

    // withContext inside withCategoryPrefix
    withContext({ userId: 42 }, () => {
      withCategoryPrefix(["sdk"], () => {
        getLogger(["lib"]).debug("context then prefix");
      });
    });
    assert.deepStrictEqual(buffer[0].category, ["sdk", "lib"]);
    assert.deepStrictEqual(buffer[0].properties, { userId: 42 });
    buffer.pop();

    // concurrent runs - each should have isolated prefix
    await Promise.all([
      (async () => {
        await delay(Math.random() * 100);
        withCategoryPrefix(["sdk-a"], () => {
          getLogger(["lib"]).debug("a");
        });
      })(),
      (async () => {
        await delay(Math.random() * 100);
        withCategoryPrefix(["sdk-b"], () => {
          getLogger(["lib"]).debug("b");
        });
      })(),
      (async () => {
        await delay(Math.random() * 100);
        withCategoryPrefix(["sdk-c"], () => {
          getLogger(["lib"]).debug("c");
        });
      })(),
      (async () => {
        await delay(Math.random() * 100);
        withCategoryPrefix(["sdk-d"], () => {
          getLogger(["lib"]).debug("d");
        });
      })(),
    ]);
    assert.deepStrictEqual(buffer.length, 4);
    for (const log of buffer) {
      if (log.message[0] === "a") {
        assert.deepStrictEqual(log.category, ["sdk-a", "lib"]);
      } else if (log.message[0] === "b") {
        assert.deepStrictEqual(log.category, ["sdk-b", "lib"]);
      } else if (log.message[0] === "c") {
        assert.deepStrictEqual(log.category, ["sdk-c", "lib"]);
      } else {
        assert.deepStrictEqual(log.category, ["sdk-d", "lib"]);
      }
    }
  } finally {
    await reset();
  }

  // without contextLocalStorage configured
  const metaBuffer: LogRecord[] = [];

  { // set up
    await configure({
      sinks: {
        buffer: buffer.push.bind(buffer),
        metaBuffer: metaBuffer.push.bind(metaBuffer),
      },
      loggers: [
        { category: "my-app", sinks: ["buffer"], lowestLevel: "debug" },
        {
          category: ["logtape", "meta"],
          sinks: ["metaBuffer"],
          lowestLevel: "warning",
        },
      ],
      reset: true,
    });
  }

  try {
    while (buffer.length > 0) buffer.pop();
    const rv = withCategoryPrefix(["sdk-1"], () => {
      getLogger(["my-app"]).debug("no storage");
      return 456;
    });
    assert.deepStrictEqual(rv, 456);
    // Without storage, category should not have prefix
    assert.deepStrictEqual(buffer[0].category, ["my-app"]);
    // Warning should be logged to meta logger
    assert.deepStrictEqual(metaBuffer.length, 1);
    assert.deepStrictEqual(metaBuffer[0].category, ["logtape", "meta"]);
    assert.deepStrictEqual(metaBuffer[0].level, "warning");
  } finally {
    await reset();
  }
});
