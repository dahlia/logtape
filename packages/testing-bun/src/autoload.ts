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
  beforeAll,
  beforeEach,
  type BunTestFunction,
  createIt,
  createTest,
  describe,
  expect,
  expectTypeOf,
  jest,
  mock,
  onTestFinished,
  setDefaultTimeout,
  setSystemTime,
  spyOn,
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

const reporterOptions: FailureLogReporterOptions =
  getFailureLogReporterOptionsFromEnv({
    getEnv: (name) => process.env[name],
  });
const test: BunTestFunction = createTest(reporterOptions);
const it: BunTestFunction = createIt(reporterOptions);
const concurrent: BunTestFunction["concurrent"] = test.concurrent;
const each: BunTestFunction["each"] = test.each;
const failing: BunTestFunction["failing"] = test.failing;
const only: BunTestFunction["only"] = test.only;
const serial: BunTestFunction["serial"] = test.serial;
const skip: BunTestFunction["skip"] = test.skip;
const todo: BunTestFunction["todo"] = test.todo;

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
