import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";
import { delay } from "@std/async/delay";
import { AsyncLocalStorage } from "node:async_hooks";
import { configure, reset } from "./config.ts";
import { withContext } from "./context.ts";
import { getLogger } from "./logger.ts";
import type { LogRecord } from "./record.ts";

const test = suite(import.meta);

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
    assertEquals(buffer, [
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
    assertEquals(rv, 123);
    assertEquals(buffer, [
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
    assertEquals(buffer, [
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
    assertEquals(buffer, [
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
    assertEquals(buffer.length, 4);
    for (const log of buffer) {
      if (log.message[0] === "foo") {
        assertEquals(log.properties, { foo: 1 });
      } else if (log.message[0] === "bar") {
        assertEquals(log.properties, { bar: 2 });
      } else if (log.message[0] === "baz") {
        assertEquals(log.properties, { baz: 3 });
      } else {
        assertEquals(log.properties, { qux: 4 });
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
    assertEquals(rv, 123);
    assertEquals(buffer, [
      {
        category: ["my-app"],
        level: "debug",
        message: ["hello"],
        rawMessage: "hello",
        properties: { bar: 2 },
        timestamp: buffer[0].timestamp,
      },
    ]);
    assertEquals(metaBuffer, [
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
