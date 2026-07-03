import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import nodeTest from "node:test";

import {
  configureSync,
  type ContextLocalStorage,
  getConfig,
  getLogger,
  resetSync,
  type Sink,
} from "@logtape/logtape";

const isDeno = "Deno" in globalThis;
const isBun = "Bun" in globalThis;
const skipNestedNodeTest = isDeno || isBun;

nodeTest(
  "autoload: configures LogTape when it has not been configured",
  async () => {
    resetSync();
    try {
      const autoload = await importAutoload("unconfigured");

      const config = getConfig();
      assert.notStrictEqual(config, null);
      assert.notStrictEqual(config?.contextLocalStorage, undefined);
      assert.strictEqual(typeof autoload.test, "function");
      assert.strictEqual(autoload.default, autoload.test);
    } finally {
      resetSync();
    }
  },
);

nodeTest(
  "autoload: reads reporter options from environment variables",
  { skip: skipNestedNodeTest },
  async () => {
    if (skipNestedNodeTest) return;

    const originalMode = process.env.LOGTAPE_TEST_MODE;
    const originalLowestLevel = process.env.LOGTAPE_TEST_LOWEST_LEVEL;
    const originalConsoleDebug = console.debug;
    const reported: string[] = [];
    process.env.LOGTAPE_TEST_MODE = "always";
    process.env.LOGTAPE_TEST_LOWEST_LEVEL = "debug";
    console.debug = (...args: unknown[]) => {
      reported.push(args.map(String).join(" "));
    };
    resetSync();
    try {
      const autoload = await importAutoload("env-options");

      await autoload.test("env options", () => {
        getLogger(["app"]).debug("Autoload env diagnostic.");
      });

      assert.match(reported.join("\n"), /Autoload env diagnostic\./);
    } finally {
      restoreEnv("LOGTAPE_TEST_MODE", originalMode);
      restoreEnv("LOGTAPE_TEST_LOWEST_LEVEL", originalLowestLevel);
      console.debug = originalConsoleDebug;
      resetSync();
    }
  },
);

nodeTest(
  "autoload: applies environment variables to expectFailure",
  { skip: skipNestedNodeTest },
  async () => {
    if (skipNestedNodeTest) return;

    const originalMode = process.env.LOGTAPE_TEST_MODE;
    const originalLowestLevel = process.env.LOGTAPE_TEST_LOWEST_LEVEL;
    const originalConsoleDebug = console.debug;
    const reported: string[] = [];
    process.env.LOGTAPE_TEST_MODE = "always";
    process.env.LOGTAPE_TEST_LOWEST_LEVEL = "debug";
    console.debug = (...args: unknown[]) => {
      reported.push(args.map(String).join(" "));
    };
    resetSync();
    try {
      const autoload = await importAutoload("env-expect-failure");
      const expectFailure = autoload.expectFailure;
      if (expectFailure == null) return;

      await expectFailure("env expectFailure", () => {
        getLogger(["app"]).debug("Autoload expectFailure diagnostic.");
        throw new Error("expected");
      });

      assert.match(
        reported.join("\n"),
        /Autoload expectFailure diagnostic\./,
      );
    } finally {
      restoreEnv("LOGTAPE_TEST_MODE", originalMode);
      restoreEnv("LOGTAPE_TEST_LOWEST_LEVEL", originalLowestLevel);
      console.debug = originalConsoleDebug;
      resetSync();
    }
  },
);

nodeTest(
  "autoload: keeps an existing configuration with contextLocalStorage",
  async () => {
    const records: string[] = [];
    const sink: Sink = (record) => {
      records.push(String(record.rawMessage));
    };
    const existingConfig = {
      contextLocalStorage: new AsyncLocalStorage() as ContextLocalStorage<
        Record<string, unknown>
      >,
      sinks: { existing: sink },
      loggers: [
        { category: ["app"], sinks: ["existing"] },
        { category: ["logtape", "meta"], sinks: [] },
      ],
    };
    configureSync(existingConfig);
    try {
      await importAutoload("existing");

      assert.strictEqual(getConfig(), existingConfig);
      getLogger(["app"]).info("Existing sink remains.");
      assert.deepStrictEqual(records, ["Existing sink remains."]);
    } finally {
      resetSync();
    }
  },
);

nodeTest(
  "autoload: rejects existing configuration without contextLocalStorage",
  async () => {
    const existingConfig = {
      sinks: {},
      loggers: [
        { category: ["logtape", "meta"], sinks: [] },
      ],
    };
    configureSync(existingConfig);
    try {
      await assert.rejects(
        importAutoload("missing-context"),
        /autoload requires the existing LogTape configuration to provide contextLocalStorage/,
      );
      assert.strictEqual(getConfig(), existingConfig);
    } finally {
      resetSync();
    }
  },
);

// Helpers

function importAutoload(id: string): Promise<typeof import("./autoload.ts")> {
  return import(`./autoload.ts?case=${id}&time=${Date.now()}`);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
