import {
  getConsoleSink,
  type LogLevel,
  type LogRecord,
  parseLogLevel,
  type Sink,
  type TextFormatter,
  withConfig,
} from "@logtape/logtape";

import { materializeLogRecord } from "./snapshot.ts";

/**
 * Controls when buffered records are reported by a
 * {@link FailureLogReporter}.
 *
 * @since 2.3.0
 */
export type FailureLogReportMode = "on-failure" | "always" | "never";

/**
 * Options for {@link createFailureLogReporter}.
 *
 * @since 2.3.0
 */
export interface FailureLogReporterOptions {
  /**
   * When to report buffered records.  Defaults to `"on-failure"`.
   */
  readonly mode?: FailureLogReportMode;

  /**
   * The lowest severity level collected by the reporter's scoped
   * configuration.  Defaults to `"info"`.
   */
  readonly lowestLevel?: LogLevel;

  /**
   * The sink that receives buffered records when the reporter flushes.
   * Defaults to a console sink.
   */
  readonly sink?: Sink;

  /**
   * The text formatter used by the default console sink.
   */
  readonly formatter?: TextFormatter;
}

/**
 * Options for {@link getFailureLogReporterOptionsFromEnv}.
 *
 * @since 2.3.0
 */
export interface FailureLogReporterEnvOptions {
  /**
   * Reads an environment variable by name.
   *
   * The caller supplies this function so the shared parser can stay
   * runtime-agnostic.
   */
  readonly getEnv: (name: string) => string | undefined;

  /**
   * The environment variable prefix.  Defaults to `"LOGTAPE_TEST_"`.
   */
  readonly prefix?: string;
}

/**
 * A reporter that buffers LogTape records while a test callback runs and
 * reports them depending on the configured mode.
 *
 * @since 2.3.0
 */
export interface FailureLogReporter {
  /**
   * Wraps a callback so matching LogTape records are reported according to the
   * configured mode.
   *
   * @param callback The test callback to wrap.
   * @returns An async callback with the same parameters.
   */
  wrap<TThis, TArgs extends readonly unknown[], TResult>(
    callback: (this: TThis, ...args: TArgs) => TResult,
  ): (this: TThis, ...args: TArgs) => Promise<Awaited<TResult>>;

  /**
   * Runs a callback and reports matching LogTape records according to the
   * configured mode.
   *
   * @param callback The callback to run.
   * @returns The callback result.
   */
  run<TResult>(callback: () => TResult): Promise<Awaited<TResult>>;
}

/**
 * Creates a failure log reporter for tests.
 *
 * The reporter uses LogTape's scoped configuration support.  The process-wide
 * configuration must already include `Config.contextLocalStorage`, but the
 * reporter does not mutate global logger routing while a wrapped callback
 * runs.
 *
 * @example
 * ```ts
 * import { createFailureLogReporter } from "@logtape/testing/reporter";
 *
 * const reporter = createFailureLogReporter({ lowestLevel: "debug" });
 *
 * test("case", reporter.wrap(async () => {
 *   // Logs emitted here are reported only if this callback throws.
 * }));
 * ```
 *
 * @param options Reporter options.
 * @returns A failure log reporter.
 * @since 2.3.0
 */
export function createFailureLogReporter(
  options: FailureLogReporterOptions = {},
): FailureLogReporter {
  const mode = options.mode ?? "on-failure";
  const lowestLevel = options.lowestLevel ?? "info";
  const outputSink = options.sink ?? getConsoleSink({
    formatter: options.formatter,
  });

  async function run<TResult>(
    callback: () => TResult,
  ): Promise<Awaited<TResult>> {
    const records: LogRecord[] = [];
    const bufferSink: Sink = (record: LogRecord): void => {
      records.push(materializeLogRecord(record));
    };

    let result: Awaited<TResult>;
    try {
      result = await withConfig({
        sinks: { failureLogReporter: bufferSink },
        loggers: [{
          category: [],
          lowestLevel,
          parentSinks: "override",
          sinks: ["failureLogReporter"],
        }],
      }, callback);
    } catch (error) {
      if (mode !== "never") {
        try {
          flushRecords(records, outputSink);
        } catch {
          // Keep the test runner focused on the original assertion error.
        }
      }
      throw error;
    }

    if (mode === "always") flushRecords(records, outputSink);
    return result;
  }

  function wrap<TThis, TArgs extends readonly unknown[], TResult>(
    callback: (this: TThis, ...args: TArgs) => TResult,
  ): (this: TThis, ...args: TArgs) => Promise<Awaited<TResult>> {
    return function (
      this: TThis,
      ...args: TArgs
    ): Promise<Awaited<TResult>> {
      return run(() => Reflect.apply(callback, this, args) as TResult);
    };
  }

  return {
    run,
    wrap,
  };
}

/**
 * Reads failure log reporter options from environment variables.
 *
 * This helper parses `LOGTAPE_TEST_MODE` and `LOGTAPE_TEST_LOWEST_LEVEL` by
 * default.  It does not access the environment directly; pass a runtime
 * specific `getEnv` callback such as `(name) => process.env[name]`.
 *
 * @param options Environment parsing options.
 * @returns Reporter options parsed from the environment.
 * @throws {TypeError} If an environment variable has an invalid value.
 * @since 2.3.0
 */
export function getFailureLogReporterOptionsFromEnv(
  options: FailureLogReporterEnvOptions,
): FailureLogReporterOptions {
  const prefix = options.prefix ?? "LOGTAPE_TEST_";
  const reporterOptions: {
    mode?: FailureLogReportMode;
    lowestLevel?: LogLevel;
  } = {};
  const mode = options.getEnv(`${prefix}MODE`);
  if (mode != null) {
    reporterOptions.mode = parseFailureLogReportMode(mode);
  }
  const lowestLevel = options.getEnv(`${prefix}LOWEST_LEVEL`);
  if (lowestLevel != null) {
    reporterOptions.lowestLevel = parseLogLevel(lowestLevel.trim());
  }
  return reporterOptions;
}

function flushRecords(
  records: readonly LogRecord[],
  sink: Sink,
): void {
  for (const record of records) sink(record);
}

function parseFailureLogReportMode(mode: string): FailureLogReportMode {
  switch (mode.trim().toLowerCase()) {
    case "on-failure":
    case "always":
    case "never":
      return mode.trim().toLowerCase() as FailureLogReportMode;
    default:
      throw new TypeError(`Invalid failure log report mode: ${mode}.`);
  }
}
