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
  describe,
  expect,
  expectTypeOf,
  inject,
  it as vitestIt,
  onTestFailed,
  onTestFinished,
  should,
  suite,
  test as vitestTest,
  vi,
  vitest,
} from "vitest";

import {
  createFailureLogReporter,
  type FailureLogReporterOptions,
} from "@logtape/testing/reporter";

export type {
  FailureLogReporterOptions,
  FailureLogReportMode,
} from "@logtape/testing/reporter";
export type {
  TestAPI as VitestTestFunction,
  TestContext as VitestTestContext,
  TestFunction as VitestTestCallback,
  TestOptions as VitestTestOptions,
} from "vitest";
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
  createExpect,
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
};

import type { TestAPI as VitestTestFunction } from "vitest";

/**
 * A Vitest-compatible namespace with LogTape-wrapped `test()` and `it()`
 * functions.
 *
 * @since 2.3.0
 */
export interface VitestTesting {
  readonly afterAll: typeof afterAll;
  readonly afterEach: typeof afterEach;
  readonly aroundAll: typeof aroundAll;
  readonly aroundEach: typeof aroundEach;
  readonly assert: typeof assert;
  readonly bench: typeof bench;
  readonly beforeAll: typeof beforeAll;
  readonly beforeEach: typeof beforeEach;
  readonly chai: typeof chai;
  readonly createExpect: typeof createExpect;
  readonly describe: typeof describe;
  readonly expect: typeof expect;
  readonly expectTypeOf: typeof expectTypeOf;
  readonly inject: typeof inject;
  readonly it: VitestTestFunction;
  readonly onTestFailed: typeof onTestFailed;
  readonly onTestFinished: typeof onTestFinished;
  readonly should: typeof should;
  readonly suite: typeof suite;
  readonly test: VitestTestFunction;
  readonly vi: typeof vi;
  readonly vitest: typeof vitest;
}

type AnyFunction = (...args: never[]) => unknown;
type BaseVitestTestFunction = AnyFunction & {
  readonly skip?: BaseVitestTestFunction;
  readonly todo?: BaseVitestTestFunction;
  readonly only?: BaseVitestTestFunction;
  readonly fails?: BaseVitestTestFunction;
  readonly concurrent?: BaseVitestTestFunction;
  readonly sequential?: BaseVitestTestFunction;
  readonly each?: AnyFunction;
  readonly for?: AnyFunction;
  readonly skipIf?: AnyFunction;
  readonly runIf?: AnyFunction;
  readonly extend?: AnyFunction;
  readonly override?: AnyFunction;
  readonly scoped?: AnyFunction;
  readonly beforeAll?: AnyFunction;
  readonly afterAll?: AnyFunction;
  readonly aroundAll?: AnyFunction;
  readonly beforeEach?: AnyFunction;
  readonly afterEach?: AnyFunction;
  readonly aroundEach?: AnyFunction;
  readonly describe?: AnyFunction;
  readonly suite?: AnyFunction;
};

const helperNames = [
  "skip",
  "todo",
  "only",
  "fails",
  "concurrent",
  "sequential",
] as const;

const conditionalHelperNames = [
  "skipIf",
  "runIf",
] as const;

const hookNames = [
  "beforeAll",
  "afterAll",
  "aroundAll",
  "beforeEach",
  "afterEach",
  "aroundEach",
] as const;

const nestedSuiteNames = [
  "describe",
  "suite",
] as const;

/**
 * Creates a Vitest `test()` function that reports LogTape records from failed
 * test callbacks.
 *
 * The returned function preserves Vitest test options and shorthand helpers
 * such as `test.skip()`, `test.todo()`, `test.only()`, `test.fails()`,
 * `test.concurrent()`, `test.sequential()`, `test.skipIf()`,
 * `test.runIf()`, `test.each()`, `test.for()`, and `test.extend()`.  Only
 * callback arguments are adapted; options are passed through to Vitest.
 *
 * @param options Failure log reporter options.
 * @returns A configured Vitest-compatible test function.
 * @since 2.3.0
 */
export function createTest(
  options: FailureLogReporterOptions = {},
): VitestTestFunction {
  return createVitestTestFunction(
    vitestTest as unknown as BaseVitestTestFunction,
    options,
  );
}

/**
 * Creates an `it()` alias that reports LogTape records from failed test
 * callbacks.
 *
 * @param options Failure log reporter options.
 * @returns A configured Vitest-compatible `it()` function.
 * @since 2.3.0
 */
export function createIt(
  options: FailureLogReporterOptions = {},
): VitestTestFunction {
  return createVitestTestFunction(
    vitestIt as unknown as BaseVitestTestFunction,
    options,
  );
}

/**
 * Creates a Vitest-compatible namespace with wrapped `test()` and `it()`
 * functions.
 *
 * This is useful when existing test files already import several helpers from
 * Vitest and you want to switch them to one LogTape-aware namespace.
 *
 * @param options Failure log reporter options.
 * @returns A Vitest-compatible namespace.
 * @since 2.3.0
 */
export function createVitest(
  options: FailureLogReporterOptions = {},
): VitestTesting {
  return {
    afterAll,
    afterEach,
    aroundAll,
    aroundEach,
    assert,
    bench,
    beforeAll,
    beforeEach,
    chai,
    createExpect,
    describe,
    expect,
    expectTypeOf,
    inject,
    it: createIt(options),
    onTestFailed,
    onTestFinished,
    should,
    suite,
    test: createTest(options),
    vi,
    vitest,
  };
}

/**
 * A Vitest `test()` function that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const test: VitestTestFunction = createTest();

/**
 * A Vitest `it()` alias that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const it: VitestTestFunction = createIt();

/**
 * Shorthand for skipping a test.
 *
 * @since 2.3.0
 */
export const skip: VitestTestFunction["skip"] = test.skip;

/**
 * Shorthand for marking a test as TODO.
 *
 * @since 2.3.0
 */
export const todo: VitestTestFunction["todo"] = test.todo;

/**
 * Shorthand for marking a test as `only`.
 *
 * @since 2.3.0
 */
export const only: VitestTestFunction["only"] = test.only;

/**
 * Shorthand for marking a test as expected to fail.
 *
 * @since 2.3.0
 */
export const fails: VitestTestFunction["fails"] = test.fails;

/**
 * Shorthand for running a test concurrently.
 *
 * @since 2.3.0
 */
export const concurrent: VitestTestFunction["concurrent"] = test.concurrent;

/**
 * Shorthand for running a test sequentially.
 *
 * @since 2.3.0
 */
export const sequential: VitestTestFunction["sequential"] = test.sequential;

/**
 * Shorthand for Vitest's parameterized tests.
 *
 * @since 2.3.0
 */
export const each: VitestTestFunction["each"] = test.each;

/**
 * Shorthand for Vitest's parameterized tests with a preserved test context.
 *
 * @since 2.3.0
 */
const for_: VitestTestFunction["for"] = test.for;

export { for_ as for };
export default test;

function createVitestTestFunction(
  baseTest: BaseVitestTestFunction,
  options: FailureLogReporterOptions,
  cache: WeakMap<BaseVitestTestFunction, VitestTestFunction> = new WeakMap(),
): VitestTestFunction {
  const cached = cache.get(baseTest);
  if (cached != null) return cached;

  const register: VitestTestFunction = ((...args: unknown[]) =>
    Reflect.apply(
      baseTest,
      undefined,
      wrapVitestArguments(args, options),
    )) as unknown as VitestTestFunction;
  cache.set(baseTest, register);

  for (const helperName of helperNames) {
    const helper = getFunctionProperty(baseTest, helperName);
    if (helper == null) continue;
    Object.defineProperty(register, helperName, {
      configurable: true,
      enumerable: true,
      get() {
        return createVitestTestFunction(
          helper as BaseVitestTestFunction,
          options,
          cache,
        );
      },
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
        return createVitestTestFunction(
          conditionalTest as BaseVitestTestFunction,
          options,
          cache,
        );
      }) as VitestTestFunction[typeof helperName],
      writable: true,
    });
  }

  for (const helperName of hookNames) {
    const helper = getFunctionProperty(baseTest, helperName);
    if (helper == null) continue;
    Object.defineProperty(register, helperName, {
      configurable: true,
      enumerable: true,
      value: createWrappedFunction(helper, options),
      writable: true,
    });
  }

  for (const helperName of nestedSuiteNames) {
    const helper = getFunctionProperty(baseTest, helperName);
    if (helper == null) continue;
    Object.defineProperty(register, helperName, {
      configurable: true,
      enumerable: true,
      value: helper,
      writable: true,
    });
  }

  const each = getFunctionProperty(baseTest, "each");
  if (each != null) {
    Object.defineProperty(register, "each", {
      configurable: true,
      enumerable: true,
      value: createWrappedParameterized(baseTest, each, options),
      writable: true,
    });
  }

  const for_ = getFunctionProperty(baseTest, "for");
  if (for_ != null) {
    Object.defineProperty(register, "for", {
      configurable: true,
      enumerable: true,
      value: createWrappedParameterized(baseTest, for_, options),
      writable: true,
    });
  }

  const extend = getFunctionProperty(baseTest, "extend");
  if (extend != null) {
    Object.defineProperty(register, "extend", {
      configurable: true,
      enumerable: true,
      value: ((...args: never[]) => {
        const extendedTest = Reflect.apply(extend, baseTest, args);
        return createVitestTestFunction(
          extendedTest as BaseVitestTestFunction,
          options,
          cache,
        );
      }) as VitestTestFunction["extend"],
      writable: true,
    });
  }

  const override = getFunctionProperty(baseTest, "override");
  if (override != null) {
    Object.defineProperty(register, "override", {
      configurable: true,
      enumerable: true,
      value: override,
      writable: true,
    });
  }

  const scoped = getFunctionProperty(baseTest, "scoped");
  if (scoped != null) {
    Object.defineProperty(register, "scoped", {
      configurable: true,
      enumerable: true,
      value: scoped,
      writable: true,
    });
  }

  return register;
}

function createWrappedParameterized(
  baseTest: BaseVitestTestFunction,
  baseParameterized: AnyFunction,
  options: FailureLogReporterOptions,
): AnyFunction {
  return ((...cases: readonly unknown[]) => {
    const registerParameterized = Reflect.apply(
      baseParameterized,
      baseTest,
      cases,
    );
    return ((...args: unknown[]) =>
      Reflect.apply(
        registerParameterized as AnyFunction,
        undefined,
        wrapVitestParameterizedArguments(args, options),
      )) as AnyFunction;
  }) as AnyFunction;
}

function createWrappedFunction(
  baseFunction: AnyFunction,
  options: FailureLogReporterOptions,
): AnyFunction {
  return function (this: unknown, ...args: never[]): unknown {
    return Reflect.apply(
      baseFunction,
      this,
      wrapVitestArguments(args, options),
    );
  };
}

function wrapVitestArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  const callbackIndex = args.findIndex((arg) => typeof arg === "function");
  if (callbackIndex < 0) return [...args];

  return [
    ...args.slice(0, callbackIndex),
    wrapVitestCallback(args[callbackIndex] as AnyFunction, options),
    ...args.slice(callbackIndex + 1),
  ];
}

function wrapVitestParameterizedArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  const callbackIndex = args.findIndex((arg, index) =>
    index > 0 && typeof arg === "function"
  );
  if (callbackIndex < 0) return [...args];

  return [
    ...args.slice(0, callbackIndex),
    wrapVitestCallback(args[callbackIndex] as AnyFunction, options),
    ...args.slice(callbackIndex + 1),
  ];
}

function wrapVitestCallback(
  callback: AnyFunction,
  options: FailureLogReporterOptions,
): AnyFunction {
  const reporter = createFailureLogReporter(options);
  const wrapped = function (this: unknown, ...args: never[]) {
    return reporter.run(() => Reflect.apply(callback, this, args));
  };
  Object.defineProperty(wrapped, "toString", {
    configurable: true,
    value: () => String(callback),
  });
  return wrapped;
}

function getFunctionProperty(
  value: BaseVitestTestFunction,
  property: string,
): AnyFunction | undefined {
  try {
    const propertyValue = Reflect.get(value, property);
    return typeof propertyValue === "function" ? propertyValue : undefined;
  } catch {
    return undefined;
  }
}
