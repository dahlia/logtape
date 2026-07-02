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
  aroundAll,
  aroundEach,
  assert,
  beforeAll,
  beforeEach,
  bench,
  chai,
  concurrent,
  createExpect,
  createIt,
  createTest,
  createVitest,
  default as test,
  describe,
  each,
  expect,
  expectTypeOf,
  fails,
  for as for_,
  inject,
  it,
  only,
  onTestFailed,
  onTestFinished,
  sequential,
  should,
  skip,
  suite,
  todo,
  vi,
  vitest,
} from "./mod.ts";

export type {
  FailureLogReporterOptions,
  FailureLogReportMode,
  VitestTestCallback,
  VitestTestContext,
  VitestTestFunction,
  VitestTesting,
  VitestTestOptions,
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
    "@logtape/testing-vitest/autoload requires the existing LogTape " +
      "configuration to provide contextLocalStorage.",
  );
}

export {
  afterAll,
  afterEach,
  aroundAll,
  aroundEach,
  assert,
  beforeAll,
  beforeEach,
  bench,
  chai,
  concurrent,
  createExpect,
  createIt,
  createTest,
  createVitest,
  describe,
  each,
  expect,
  expectTypeOf,
  fails,
  inject,
  it,
  only,
  onTestFailed,
  onTestFinished,
  sequential,
  should,
  skip,
  suite,
  test,
  todo,
  vi,
  vitest,
};
export { for_ as for };
export default test;
