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
