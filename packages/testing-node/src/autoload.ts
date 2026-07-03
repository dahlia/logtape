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
  after,
  afterEach,
  assert,
  before,
  beforeEach,
  createIt,
  createTest,
  describe,
  mock,
  type NodeTestFunction,
  run,
  snapshot,
  suite,
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

const reporterOptions: FailureLogReporterOptions =
  getFailureLogReporterOptionsFromEnv({
    getEnv,
  });
const test: NodeTestFunction = createTest(reporterOptions);
const it: NodeTestFunction = createIt(reporterOptions);
const only: NodeTestFunction["only"] = test.only;
const skip: NodeTestFunction["skip"] = test.skip;
const todo: NodeTestFunction["todo"] = test.todo;
const expectFailure: NodeTestFunction["expectFailure"] = test.expectFailure;

function getEnv(name: string): string | undefined {
  try {
    return process.env[name];
  } catch {
    return undefined;
  }
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
