import { AsyncLocalStorage } from "node:async_hooks";

import {
  ConfigError,
  configureSync,
  type ContextLocalStorage,
  getConfig,
} from "@logtape/logtape";
import {
  type FailureLogReporterOptions,
  getFailureLogReporterOptionsFromEnv,
} from "@logtape/testing/reporter";

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
  createExpect,
  createIt,
  createTest,
  createVitest,
  describe,
  expect,
  expectTypeOf,
  inject,
  onTestFailed,
  onTestFinished,
  should,
  suite,
  vi,
  vitest,
  type VitestTestFunction,
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

const reporterOptions: FailureLogReporterOptions =
  getFailureLogReporterOptionsFromEnv({
    getEnv: (name) => process.env[name],
  });
const test: VitestTestFunction = createTest(reporterOptions);
const it: VitestTestFunction = createIt(reporterOptions);
const concurrent: VitestTestFunction["concurrent"] = test.concurrent;
const each: VitestTestFunction["each"] = test.each;
const fails: VitestTestFunction["fails"] = test.fails;
const for_: VitestTestFunction["for"] = test.for;
const only: VitestTestFunction["only"] = test.only;
const sequential: VitestTestFunction["sequential"] = test.sequential;
const skip: VitestTestFunction["skip"] = test.skip;
const todo: VitestTestFunction["todo"] = test.todo;

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
