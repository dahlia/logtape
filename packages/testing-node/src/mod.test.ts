import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import nodeTest, { type TestContext } from "node:test";

import {
  configure,
  type ContextLocalStorage,
  getLogger,
  type LogRecord,
  reset,
} from "@logtape/logtape";

import { createIt, createTest, it } from "./mod.ts";

const isDeno = "Deno" in globalThis;
const isBun = "Bun" in globalThis;
// Deno's and Bun's node:test shims do not support registering test() inside
// another test() yet, which these wrapper integration tests intentionally
// exercise.
const skipNestedNodeTest = isDeno || isBun;

nodeTest("createTest(): reports logs from expected synchronous failures", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  const reported: LogRecord[] = [];
  await configureForTestingNode();
  try {
    const test = createTest({
      lowestLevel: "debug",
      sink: (record) => reported.push(record),
    });

    await test("expected failure", { expectFailure: true }, () => {
      getLogger(["app"]).debug("Fixture state: {state}.", {
        state: "ready",
      });
      throw new Error("assertion failed");
    });

    assert.deepStrictEqual(
      reported.map((record) => [record.level, record.rawMessage]),
      [["debug", "Fixture state: {state}."]],
    );
    assert.deepStrictEqual(reported[0]?.properties, { state: "ready" });
  } finally {
    await reset();
  }
});

nodeTest(
  "createTest(): discards logs when a test passes by default",
  { skip: skipNestedNodeTest },
  async () => {
    if (skipNestedNodeTest) return;

    const reported: LogRecord[] = [];
    await configureForTestingNode();
    try {
      const test = createTest({
        lowestLevel: "debug",
        sink: (record) => reported.push(record),
      });

      await test("passing test", () => {
        getLogger(["app"]).debug("Discarded diagnostic.");
      });

      assert.deepStrictEqual(reported, []);
    } finally {
      await reset();
    }
  },
);

nodeTest("createTest(): preserves node:test options", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  const reported: LogRecord[] = [];
  await configureForTestingNode();
  try {
    const test = createTest({
      mode: "always",
      sink: (record) => reported.push(record),
    });

    await test("optioned test", {
      concurrency: true,
      timeout: 1_000,
    }, (context: TestContext) => {
      assert.strictEqual(context.name, "optioned test");
      getLogger(["app"]).info("Optioned test.");
    });

    assert.deepStrictEqual(
      reported.map((record) => record.rawMessage),
      ["Optioned test."],
    );
  } finally {
    await reset();
  }
});

nodeTest("createTest(): passes context to rest-parameter callbacks", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  const reported: LogRecord[] = [];
  await configureForTestingNode();
  try {
    const test = createTest({
      mode: "always",
      sink: (record) => reported.push(record),
    });

    await test("rest context", (...args: unknown[]) => {
      const [context] = args;
      assert.ok(context);
      assert.strictEqual((context as TestContext).name, "rest context");
      getLogger(["app"]).info("Rest callback diagnostic.");
    });

    assert.deepStrictEqual(
      reported.map((record) => record.rawMessage),
      ["Rest callback diagnostic."],
    );
  } finally {
    await reset();
  }
});

nodeTest("createTest(): supports callback-style tests", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  const reported: LogRecord[] = [];
  await configureForTestingNode();
  try {
    const test = createTest({
      mode: "always",
      sink: (record) => reported.push(record),
    });

    await test("callback test", (context, done) => {
      assert.strictEqual(context.name, "callback test");
      setTimeout(() => {
        assert.ok(done);
        getLogger(["app"]).info("Async callback diagnostic.");
        done();
      }, 0);
    });

    assert.deepStrictEqual(
      reported.map((record) => record.rawMessage),
      ["Async callback diagnostic."],
    );
  } finally {
    await reset();
  }
});

nodeTest("createTest(): reports logs when callback-style tests fail", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  const reported: LogRecord[] = [];
  await configureForTestingNode();
  try {
    const test = createTest({
      sink: (record) => reported.push(record),
    });

    await test("expected callback failure", { expectFailure: true }, (
      _context,
      done,
    ) => {
      assert.ok(done);
      getLogger(["app"]).info("Before callback failure.");
      done(new Error("callback failed"));
    });

    assert.deepStrictEqual(
      reported.map((record) => record.rawMessage),
      ["Before callback failure."],
    );
  } finally {
    await reset();
  }
});

nodeTest(
  "createTest(): rejects callback-style tests that return promises",
  { skip: skipNestedNodeTest },
  async () => {
    if (skipNestedNodeTest) return;

    const reported: LogRecord[] = [];
    await configureForTestingNode();
    try {
      const test = createTest({
        sink: (record) => reported.push(record),
      });

      await test("invalid callback completion", { expectFailure: true }, (
        _context,
        done,
      ) => {
        assert.ok(done);
        getLogger(["app"]).info("Invalid completion diagnostic.");
        done();
        return Promise.resolve();
      });

      assert.deepStrictEqual(
        reported.map((record) => record.rawMessage),
        ["Invalid completion diagnostic."],
      );
    } finally {
      await reset();
    }
  },
);

nodeTest(
  "createTest(): supports subtests created from a test context",
  { skip: skipNestedNodeTest },
  async () => {
    if (skipNestedNodeTest) return;

    const reported: LogRecord[] = [];
    await configureForTestingNode();
    try {
      const test = createTest({
        mode: "always",
        sink: (record) => reported.push(record),
      });

      await test("parent", async (context) => {
        await context.test("subtest", () => {
          getLogger(["app"]).info("Subtest diagnostic.");
        });
      });

      assert.deepStrictEqual(
        reported.map((record) => record.rawMessage),
        ["Subtest diagnostic."],
      );
    } finally {
      await reset();
    }
  },
);

nodeTest(
  "createTest(): preserves skip and todo shorthand behavior",
  { skip: skipNestedNodeTest },
  async () => {
    if (skipNestedNodeTest) return;

    await configureForTestingNode();
    try {
      const test = createTest({
        mode: "always",
        sink: () => {
          throw new Error("skipped callbacks must not run");
        },
      });

      await test.skip("skipped test", () => {
        throw new Error("skip callback ran");
      });
      await test.todo("todo without callback");
    } finally {
      await reset();
    }
  },
);

nodeTest("createTest(): exposes node:test shorthand helpers", () => {
  const test = createTest();

  assert.strictEqual(typeof test, "function");
  assert.strictEqual(typeof test.only, "function");
  assert.strictEqual(typeof test.skip, "function");
  assert.strictEqual(typeof test.todo, "function");
  assert.strictEqual(typeof test.it, "function");
  assert.strictEqual(typeof test.test, "function");
});

nodeTest("createIt(): wraps the node:test it() alias", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  const reported: LogRecord[] = [];
  await configureForTestingNode();
  try {
    const wrappedIt = createIt({
      mode: "always",
      sink: (record) => reported.push(record),
    });

    await wrappedIt("aliased test", () => {
      getLogger(["app"]).info("Alias diagnostic.");
    });

    assert.deepStrictEqual(
      reported.map((record) => record.rawMessage),
      ["Alias diagnostic."],
    );
  } finally {
    await reset();
  }
});

nodeTest("it: reports logs with default export-style alias", {
  skip: skipNestedNodeTest,
}, async () => {
  if (skipNestedNodeTest) return;

  await configureForTestingNode();
  try {
    await it("default alias", () => {
      assert.ok(getLogger(["app"]));
    });
  } finally {
    await reset();
  }
});

// Helpers

async function configureForTestingNode(): Promise<void> {
  await configure({
    contextLocalStorage: new AsyncLocalStorage() as ContextLocalStorage<
      Record<string, unknown>
    >,
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
}
