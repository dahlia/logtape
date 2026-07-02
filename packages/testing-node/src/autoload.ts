import { AsyncLocalStorage } from "node:async_hooks";

import {
  ConfigError,
  configureSync,
  type ContextLocalStorage,
  getConfig,
} from "@logtape/logtape";

import {
  after,
  afterEach,
  assert,
  before,
  beforeEach,
  createIt,
  createTest,
  default as test,
  describe,
  expectFailure,
  it,
  mock,
  only,
  run,
  skip,
  snapshot,
  suite,
  todo,
} from "./mod.ts";

export type {
  FailureLogReporterOptions,
  FailureLogReportMode,
  NodeTestCallback,
  NodeTestFunction,
  NodeTestOptions,
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
    "@logtape/testing-node/autoload requires the existing LogTape " +
      "configuration to provide contextLocalStorage.",
  );
}

export {
  after,
  afterEach,
  assert,
  before,
  beforeEach,
  createIt,
  createTest,
  describe,
  expectFailure,
  it,
  mock,
  only,
  run,
  skip,
  snapshot,
  suite,
  test,
  todo,
};
export default test;
