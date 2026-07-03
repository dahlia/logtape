// @ts-types="npm:@types/bun@^1.2.15"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it as bunIt,
  jest,
  mock,
  setDefaultTimeout,
  setSystemTime,
  spyOn,
  test as bunTest,
} from "bun:test";
// @ts-types="npm:@types/bun@^1.2.15"
import * as bunTestModule from "bun:test";

import {
  createFailureLogReporter,
  type FailureLogReporterOptions,
} from "@logtape/testing/reporter";

export type {
  FailureLogReporterOptions,
  FailureLogReportMode,
} from "@logtape/testing/reporter";
export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
};

/**
 * Options accepted by Bun's `test()` and `it()` functions.
 *
 * The shape mirrors Bun's documented option bag while allowing newer Bun
 * options to pass through even when bundled TypeScript declarations lag behind
 * the current runtime.
 *
 * @since 2.3.0
 */
export interface BunTestOptions {
  readonly retry?: number;
  readonly repeats?: number;
  readonly timeout?: number;
  readonly [option: string]: unknown;
}

/**
 * A callback passed to Bun's `test()` or `it()`.
 *
 * @since 2.3.0
 */
export type BunTestCallback =
  | (() => unknown)
  | ((done: BunDoneCallback) => unknown);

/**
 * A Bun `test()`-compatible function.
 *
 * @since 2.3.0
 */
export interface BunTestFunction {
  (name: string, fn?: BunTestCallback, options?: number | BunTestOptions): void;
  (name: string, options: number | BunTestOptions, fn?: BunTestCallback): void;
  readonly skip: BunTestFunction & BunParameterizedTestFactory;
  readonly todo: BunTestFunction & BunParameterizedTestFactory;
  readonly only: BunTestFunction & BunParameterizedTestFactory;
  readonly failing: BunTestFunction & BunParameterizedTestFactory;
  readonly concurrent: BunTestFunction & BunParameterizedTestFactory;
  readonly serial: BunTestFunction & BunParameterizedTestFactory;
  readonly each: BunEachFunction;
  readonly if: BunConditionalTestFactory;
  readonly skipIf: BunConditionalTestFactory;
  readonly todoIf: BunConditionalTestFactory;
}

interface BunParameterizedTestFactory {
  readonly each: BunEachFunction;
}

interface BunConditionalTestFactory {
  (condition: unknown): BunTestFunction & BunParameterizedTestFactory;
}

interface BunEachFunction {
  (...cases: readonly unknown[]): BunEachRegisterFunction;
}

interface BunEachRegisterFunction {
  (
    name: string,
    fn: (...args: never[]) => unknown,
    options?: number | BunTestOptions,
  ): void;
  (
    name: string,
    options: number | BunTestOptions,
    fn: (...args: never[]) => unknown,
  ): void;
}

type BunDoneCallback = (error?: unknown) => void;
type AnyFunction = (...args: never[]) => unknown;
type BunFunction = (...args: unknown[]) => unknown;
type BunEachInvoker = (
  thisArg: unknown,
  args: readonly unknown[],
) => unknown;
type ExpectTypeOfFunction = (...args: unknown[]) => unknown;
type OnTestFinishedFunction = (callback: () => unknown) => void;
type BaseBunTestFunction = AnyFunction & {
  readonly skip?: BaseBunTestFunction;
  readonly todo?: BaseBunTestFunction;
  readonly only?: BaseBunTestFunction;
  readonly failing?: BaseBunTestFunction;
  readonly concurrent?: BaseBunTestFunction;
  readonly serial?: BaseBunTestFunction;
  readonly each?: AnyFunction;
  readonly if?: AnyFunction;
  readonly skipIf?: AnyFunction;
  readonly todoIf?: AnyFunction;
};

const helperNames = [
  "skip",
  "todo",
  "only",
  "failing",
  "concurrent",
  "serial",
] as const;

const conditionalHelperNames = [
  "if",
  "skipIf",
  "todoIf",
] as const;

const expectTypeOf: ExpectTypeOfFunction = (
  bunTestModule as unknown as { readonly expectTypeOf: ExpectTypeOfFunction }
).expectTypeOf;
const onTestFinished: OnTestFinishedFunction = (
  bunTestModule as unknown as {
    readonly onTestFinished: OnTestFinishedFunction;
  }
).onTestFinished;
const vi: typeof jest =
  (bunTestModule as unknown as { readonly vi: typeof jest }).vi;
const xdescribe: BunFunction =
  (bunTestModule as unknown as { readonly xdescribe: BunFunction })
    .xdescribe;
const xit: BunFunction =
  (bunTestModule as unknown as { readonly xit: BunFunction }).xit;
const xtest: BunFunction = (bunTestModule as unknown as {
  readonly xtest: BunFunction;
})
  .xtest;

/**
 * Creates a `bun:test` test function that reports LogTape records from failed
 * test callbacks.
 *
 * The returned function preserves Bun test options and shorthand helpers such
 * as `test.skip()`, `test.todo()`, `test.only()`, `test.if()`,
 * `test.failing()`, `test.concurrent()`, `test.serial()`, and `test.each()`.
 * Only callback arguments are adapted; options are passed through to
 * `bun:test`.
 *
 * @param options Failure log reporter options.
 * @returns A configured `bun:test`-compatible test function.
 * @since 2.3.0
 */
export function createTest(
  options: FailureLogReporterOptions = {},
): BunTestFunction {
  return createBunTestFunction(
    bunTest as unknown as BaseBunTestFunction,
    options,
  );
}

/**
 * Creates an `it()` alias that reports LogTape records from failed test
 * callbacks.
 *
 * @param options Failure log reporter options.
 * @returns A configured `bun:test`-compatible `it()` function.
 * @since 2.3.0
 */
export function createIt(
  options: FailureLogReporterOptions = {},
): BunTestFunction {
  return createBunTestFunction(
    bunIt as unknown as BaseBunTestFunction,
    options,
  );
}

/**
 * A `bun:test` test function that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const test: BunTestFunction = createTest();

/**
 * A `bun:test` `it()` alias that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const it: BunTestFunction = createIt();

/**
 * Shorthand for skipping a test.
 *
 * @since 2.3.0
 */
export const skip: BunTestFunction = test.skip;

/**
 * Shorthand for marking a test as TODO.
 *
 * @since 2.3.0
 */
export const todo: BunTestFunction = test.todo;

/**
 * Shorthand for marking a test as `only`.
 *
 * @since 2.3.0
 */
export const only: BunTestFunction = test.only;

/**
 * Shorthand for marking a test as expected to fail.
 *
 * @since 2.3.0
 */
export const failing: BunTestFunction = test.failing;

/**
 * Shorthand for running a test concurrently.
 *
 * @since 2.3.0
 */
export const concurrent: BunTestFunction = test.concurrent;

/**
 * Shorthand for running a test serially.
 *
 * @since 2.3.0
 */
export const serial: BunTestFunction = test.serial;

/**
 * Shorthand for Bun's parameterized tests.
 *
 * @since 2.3.0
 */
export const each: BunEachFunction = test.each;

export default test;

function createBunTestFunction(
  baseTest: BaseBunTestFunction,
  options: FailureLogReporterOptions,
): BunTestFunction {
  const register: BunTestFunction = ((...args: unknown[]) =>
    Reflect.apply(
      baseTest,
      undefined,
      wrapBunTestArguments(args, options),
    )) as BunTestFunction;

  for (const helperName of helperNames) {
    const helper = getFunctionProperty(baseTest, helperName);
    if (helper == null) continue;
    Object.defineProperty(register, helperName, {
      configurable: true,
      enumerable: true,
      value: createBunTestFunction(
        helper as BaseBunTestFunction,
        options,
      ),
      writable: true,
    });
  }

  for (const helperName of conditionalHelperNames) {
    const helper = getFunctionProperty(baseTest, helperName);
    if (helper == null) continue;
    Object.defineProperty(register, helperName, {
      configurable: true,
      enumerable: true,
      value: ((condition: unknown) => {
        const conditionalTest = Reflect.apply(helper, baseTest, [condition]);
        return createBunTestFunction(
          conditionalTest as BaseBunTestFunction,
          options,
        );
      }) as BunConditionalTestFactory,
      writable: true,
    });
  }

  const each = getFunctionProperty(baseTest, "each");
  if (each != null) {
    Object.defineProperty(register, "each", {
      configurable: true,
      enumerable: true,
      value: createWrappedEach(baseTest, each, options),
      writable: true,
    });
  }

  return register;
}

function createWrappedEach(
  baseTest: BaseBunTestFunction,
  baseEach: AnyFunction,
  options: FailureLogReporterOptions,
): BunEachFunction {
  return ((...cases: readonly unknown[]) => {
    const maxCaseArgumentCount = getMaxCaseArgumentCount(cases);
    const registerEach = Reflect.apply(baseEach, baseTest, cases);
    return ((...args: unknown[]) =>
      Reflect.apply(
        registerEach as AnyFunction,
        undefined,
        wrapBunEachArguments(args, options, maxCaseArgumentCount),
      )) as BunEachRegisterFunction;
  }) as BunEachFunction;
}

function wrapBunTestArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  const callbackIndex = args.findIndex((arg) => typeof arg === "function");
  if (callbackIndex < 0) return [...args];

  return [
    ...args.slice(0, callbackIndex),
    wrapBunTestCallback(args[callbackIndex] as AnyFunction, options),
    ...args.slice(callbackIndex + 1),
  ];
}

function wrapBunEachArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
  maxCaseArgumentCount: number,
): unknown[] {
  const callbackIndex = args.findIndex((arg, index) =>
    index > 0 && typeof arg === "function"
  );
  if (callbackIndex < 0) return [...args];

  return [
    ...args.slice(0, callbackIndex),
    wrapBunEachCallback(
      args[callbackIndex] as AnyFunction,
      options,
      maxCaseArgumentCount,
    ),
    ...args.slice(callbackIndex + 1),
  ];
}

function wrapBunTestCallback(
  callback: AnyFunction,
  options: FailureLogReporterOptions,
): AnyFunction {
  const reporter = createFailureLogReporter(options);

  if (callback.length >= 1) {
    return function (this: unknown, done: BunDoneCallback): void {
      const wrapped = reporter.wrap(() =>
        new Promise<void>((resolve, reject) => {
          let settled = false;
          const wrappedDone: BunDoneCallback = (error?: unknown) => {
            if (settled) return;
            settled = true;
            if (error == null) resolve();
            else reject(error);
          };

          try {
            Reflect.apply(callback, this, [wrappedDone]);
          } catch (error) {
            reject(error);
          }
        })
      );

      void wrapped().then(
        () => done(),
        (error: unknown) => done(error),
      );
    };
  }

  return function (this: unknown): unknown {
    return reporter.run(() => Reflect.apply(callback, this, []));
  };
}

function wrapBunEachCallback(
  callback: AnyFunction,
  options: FailureLogReporterOptions,
  maxCaseArgumentCount: number,
): AnyFunction {
  const reporter = createFailureLogReporter(options);
  const invoke = (thisArg: unknown, args: readonly unknown[]): unknown =>
    runBunEachCallback(
      reporter,
      callback,
      thisArg,
      args,
      maxCaseArgumentCount,
    );

  return createArityPreservingFunction(callback.length, invoke);
}

function createArityPreservingFunction(
  length: number,
  invoke: BunEachInvoker,
): AnyFunction {
  const parameters = Array.from(
    { length },
    (_, index) => `arg${index}`,
  ).join(", ");
  const createFunction = Function(
    "invoke",
    `return function (${parameters}) {` +
      " return invoke(this, Array.from(arguments));" +
      " };",
  ) as (invoke: BunEachInvoker) => AnyFunction;
  return createFunction(invoke);
}

function runBunEachCallback(
  reporter: ReturnType<typeof createFailureLogReporter>,
  callback: AnyFunction,
  thisArg: unknown,
  args: readonly unknown[],
  maxCaseArgumentCount: number,
): unknown {
  const lastArgument = args.at(-1);
  if (
    callback.length > maxCaseArgumentCount &&
    typeof lastArgument === "function"
  ) {
    const done = lastArgument as BunDoneCallback;
    void reporter.run(() =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const wrappedDone: BunDoneCallback = (error?: unknown) => {
          if (settled) return;
          settled = true;
          if (error == null) resolve();
          else reject(error);
        };

        try {
          Reflect.apply(callback, thisArg, [
            ...args.slice(0, -1),
            wrappedDone,
          ]);
        } catch (error) {
          reject(error);
        }
      })
    ).then(
      () => done(),
      (error: unknown) => done(error),
    );
    return undefined;
  }

  return reporter.run(() => Reflect.apply(callback, thisArg, args));
}

function getMaxCaseArgumentCount(cases: readonly unknown[]): number {
  const rows = cases.length === 1 && Array.isArray(cases[0])
    ? cases[0] as readonly unknown[]
    : cases;
  let maxArgumentCount = 0;
  for (const row of rows) {
    const argumentCount = Array.isArray(row) ? row.length : 1;
    maxArgumentCount = Math.max(maxArgumentCount, argumentCount);
  }
  return maxArgumentCount;
}

function getFunctionProperty(
  value: BaseBunTestFunction,
  property: string,
): AnyFunction | undefined {
  try {
    const propertyValue = Reflect.get(value, property);
    return typeof propertyValue === "function" ? propertyValue : undefined;
  } catch {
    return undefined;
  }
}
