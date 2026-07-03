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
  createTest,
  type DenoTestFunction,
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

const reporterOptions: FailureLogReporterOptions =
  getFailureLogReporterOptionsFromEnv({ getEnv });
const test: DenoTestFunction = createTest(reporterOptions);
const each: DenoTestFunction["each"] = test.each;
const ignore: DenoTestFunction["ignore"] = test.ignore;
const only: DenoTestFunction["only"] = test.only;

function getEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
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
