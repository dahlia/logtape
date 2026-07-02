import { AsyncLocalStorage } from "node:async_hooks";

import {
  ConfigError,
  configureSync,
  type ContextLocalStorage,
  getConfig,
} from "@logtape/logtape";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  createTest,
  default as test,
  each,
  ignore,
  only,
  sanitizer,
} from "./mod.ts";

export type {
  DenoTestCallback,
  DenoTestDefinition,
  DenoTestFunction,
  DenoTestOptions,
  FailureLogReporterOptions,
  FailureLogReportMode,
  TestContext,
} from "./mod.ts";

const config = getConfig();

if (config == null) {
  configureSync({
    contextLocalStorage: new AsyncLocalStorage() as ContextLocalStorage<
      Record<string, unknown>
    >,
    sinks: {},
    loggers: [
      { category: ["logtape", "meta"], sinks: [] },
    ],
  });
} else if (config.contextLocalStorage == null) {
  throw new ConfigError(
    "@logtape/testing-deno/autoload requires the existing LogTape " +
      "configuration to provide contextLocalStorage.",
  );
}

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  createTest,
  each,
  ignore,
  only,
  sanitizer,
  test,
};
export default test;
