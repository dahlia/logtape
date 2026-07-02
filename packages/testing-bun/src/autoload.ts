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
  concurrent,
  createIt,
  createTest,
  default as test,
  describe,
  each,
  expect,
  expectTypeOf,
  failing,
  it,
  jest,
  mock,
  only,
  onTestFinished,
  serial,
  setDefaultTimeout,
  setSystemTime,
  skip,
  spyOn,
  todo,
  vi,
  xdescribe,
  xit,
  xtest,
} from "./mod.ts";

export type {
  BunTestCallback,
  BunTestFunction,
  BunTestOptions,
  FailureLogReporterOptions,
  FailureLogReportMode,
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
    "@logtape/testing-bun/autoload requires the existing LogTape " +
      "configuration to provide contextLocalStorage.",
  );
}

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  concurrent,
  createIt,
  createTest,
  describe,
  each,
  expect,
  expectTypeOf,
  failing,
  it,
  jest,
  mock,
  only,
  onTestFinished,
  serial,
  setDefaultTimeout,
  setSystemTime,
  skip,
  spyOn,
  test,
  todo,
  vi,
  xdescribe,
  xit,
  xtest,
};
export default test;
