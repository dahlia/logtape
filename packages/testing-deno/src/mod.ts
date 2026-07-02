// deno-coverage-ignore-file -- This module is exercised through subprocess
// Deno.test fixtures so the runner behavior is real, but those child processes
// do not merge line hits reliably enough for the PR coverage gate.
import {
  createFailureLogReporter,
  type FailureLogReporterOptions,
} from "@logtape/testing/reporter";

export type {
  FailureLogReporterOptions,
  FailureLogReportMode,
} from "@logtape/testing/reporter";

/**
 * Options accepted by Deno's `Deno.test()` function.
 *
 * The shape mirrors Deno's documented option bag while allowing newer Deno
 * options to pass through even when bundled TypeScript declarations lag behind
 * the current runtime.
 *
 * @since 2.3.0
 */
export interface DenoTestOptions {
  readonly ignore?: boolean;
  readonly only?: boolean;
  readonly permissions?: unknown;
  readonly sanitizeExit?: boolean;
  readonly sanitizeOps?: boolean;
  readonly sanitizeResources?: boolean;
  readonly timeout?: number;
  readonly [option: string]: unknown;
}

/**
 * A callback passed to Deno's `Deno.test()`.
 *
 * @since 2.3.0
 */
export type DenoTestCallback = (context: Deno.TestContext) =>
  | void
  | Promise<void>;

/**
 * A Deno `Deno.test()`-compatible definition object.
 *
 * @since 2.3.0
 */
export interface DenoTestDefinition extends DenoTestOptions {
  readonly name: string;
  readonly fn: DenoTestCallback;
}

/**
 * A Deno `Deno.test()`-compatible function.
 *
 * @since 2.3.0
 */
export interface DenoTestFunction {
  (definition: DenoTestDefinition): void;
  (name: string, fn: DenoTestCallback): void;
  (fn: DenoTestCallback): void;
  (name: string, options: DenoTestOptions, fn: DenoTestCallback): void;
  (options: DenoTestOptions, fn: DenoTestCallback): void;
  (
    options: DenoTestOptions & { readonly name: string },
    fn: DenoTestCallback,
  ): void;
  readonly ignore: DenoTestFunction & DenoParameterizedTestFactory;
  readonly only: DenoTestFunction & DenoParameterizedTestFactory;
  readonly each: DenoEachFunction;
  readonly beforeAll: typeof Deno.test.beforeAll;
  readonly beforeEach: typeof Deno.test.beforeEach;
  readonly afterEach: typeof Deno.test.afterEach;
  readonly afterAll: typeof Deno.test.afterAll;
  readonly sanitizer: typeof Deno.test.sanitizer;
}

interface DenoParameterizedTestFactory {
  readonly each: DenoEachFunction;
}

interface DenoEachFunction {
  (...cases: readonly unknown[]): DenoEachRegisterFunction;
}

interface DenoEachRegisterFunction {
  (name: string, fn: (...args: never[]) => void | Promise<void>): void;
  (
    name: string,
    options: DenoTestOptions,
    fn: (...args: never[]) => void | Promise<void>,
  ): void;
}

type AnyFunction = (...args: never[]) => unknown;
type BaseDenoTestFunction = AnyFunction & {
  readonly ignore?: AnyFunction & { readonly each?: AnyFunction };
  readonly only?: AnyFunction & { readonly each?: AnyFunction };
  readonly each?: AnyFunction;
  readonly beforeAll?: typeof Deno.test.beforeAll;
  readonly beforeEach?: typeof Deno.test.beforeEach;
  readonly afterEach?: typeof Deno.test.afterEach;
  readonly afterAll?: typeof Deno.test.afterAll;
  readonly sanitizer?: typeof Deno.test.sanitizer;
};

/**
 * Creates a `Deno.test()` function that reports LogTape records from failed
 * test callbacks.
 *
 * The returned function preserves Deno test options and shorthand helpers such
 * as `test.ignore()`, `test.only()`, `test.each()`, hooks, and sanitizer
 * configuration.  Only callback arguments are adapted; options are passed
 * through to Deno's test runner.
 *
 * @param options Failure log reporter options.
 * @returns A configured `Deno.test()`-compatible test function.
 * @since 2.3.0
 */
export function createTest(
  options: FailureLogReporterOptions = {},
): DenoTestFunction {
  return createDenoTestFunction(
    Deno.test as unknown as BaseDenoTestFunction,
    options,
  );
}

/**
 * A `Deno.test()` function that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const test: DenoTestFunction = createTest();

/**
 * Shorthand for ignoring a test.
 *
 * @since 2.3.0
 */
export const ignore: DenoTestFunction = test.ignore;

/**
 * Shorthand for focusing a test.
 *
 * @since 2.3.0
 */
export const only: DenoTestFunction = test.only;

/**
 * Shorthand for Deno's parameterized tests.
 *
 * @since 2.3.0
 */
export const each: DenoEachFunction = test.each;

/**
 * Deno's before-all test hook.
 *
 * @since 2.3.0
 */
export const beforeAll: typeof Deno.test.beforeAll = test.beforeAll;

/**
 * Deno's before-each test hook.
 *
 * @since 2.3.0
 */
export const beforeEach: typeof Deno.test.beforeEach = test.beforeEach;

/**
 * Deno's after-each test hook.
 *
 * @since 2.3.0
 */
export const afterEach: typeof Deno.test.afterEach = test.afterEach;

/**
 * Deno's after-all test hook.
 *
 * @since 2.3.0
 */
export const afterAll: typeof Deno.test.afterAll = test.afterAll;

/**
 * Deno's module-level test sanitizer configuration helper.
 *
 * @since 2.3.0
 */
export const sanitizer: typeof Deno.test.sanitizer = test.sanitizer;

export default test;

function createDenoTestFunction(
  baseTest: BaseDenoTestFunction,
  options: FailureLogReporterOptions,
): DenoTestFunction {
  const register = ((...args: unknown[]) =>
    Reflect.apply(
      baseTest,
      undefined,
      wrapDenoTestArguments(args, options),
    )) as DenoTestFunction;

  const wrapped = Object.assign(register, baseTest, {
    ignore: createOptionalWrappedTest(baseTest.ignore, options),
    only: createOptionalWrappedTest(baseTest.only, options),
    each: createWrappedEach(baseTest.each, options),
  });

  copyOptionalFunction(wrapped, "beforeAll", baseTest.beforeAll);
  copyOptionalFunction(wrapped, "beforeEach", baseTest.beforeEach);
  copyOptionalFunction(wrapped, "afterEach", baseTest.afterEach);
  copyOptionalFunction(wrapped, "afterAll", baseTest.afterAll);
  copyOptionalFunction(wrapped, "sanitizer", baseTest.sanitizer);

  return wrapped;
}

function createOptionalWrappedTest(
  baseTest: BaseDenoTestFunction["ignore"],
  options: FailureLogReporterOptions,
): DenoTestFunction & DenoParameterizedTestFactory {
  if (typeof baseTest !== "function") {
    return undefined as unknown as
      & DenoTestFunction
      & DenoParameterizedTestFactory;
  }

  const wrapped = ((...args: unknown[]) =>
    Reflect.apply(
      baseTest,
      undefined,
      wrapDenoTestArguments(args, options),
    )) as DenoTestFunction & DenoParameterizedTestFactory;

  Object.assign(wrapped, baseTest, {
    each: createWrappedEach(baseTest.each, options),
  });
  return wrapped;
}

function createWrappedEach(
  baseEach: AnyFunction | undefined,
  options: FailureLogReporterOptions,
): DenoEachFunction {
  if (typeof baseEach !== "function") {
    return undefined as unknown as DenoEachFunction;
  }

  return ((...cases: readonly unknown[]) => {
    const registerEach = Reflect.apply(baseEach, undefined, cases);
    return ((...args: unknown[]) =>
      Reflect.apply(
        registerEach as AnyFunction,
        undefined,
        wrapDenoEachArguments(args, options),
      )) as DenoEachRegisterFunction;
  }) as DenoEachFunction;
}

function copyOptionalFunction<
  const TKey extends keyof BaseDenoTestFunction,
>(
  target: DenoTestFunction,
  key: TKey,
  value: BaseDenoTestFunction[TKey],
): void {
  if (typeof value !== "function") return;
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function wrapDenoTestArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  if (isDenoTestDefinition(args[0])) {
    return [
      {
        ...args[0],
        fn: wrapDenoTestCallback(args[0].fn, options),
      },
      ...args.slice(1),
    ];
  }

  const callback = args.at(-1);
  if (typeof callback !== "function") return [...args];

  if (args.length === 1) {
    return [
      {
        name: callback.name,
        fn: wrapDenoTestCallback(
          callback as unknown as DenoTestCallback,
          options,
        ),
      },
    ];
  }

  const optionsArgument = args.at(-2);
  if (
    args.length === 2 && isDenoTestOptions(optionsArgument) &&
    !("name" in optionsArgument)
  ) {
    return [
      {
        ...optionsArgument,
        name: callback.name,
        fn: wrapDenoTestCallback(
          callback as unknown as DenoTestCallback,
          options,
        ),
      },
    ];
  }

  return [
    ...args.slice(0, -1),
    wrapDenoTestCallback(callback as unknown as DenoTestCallback, options),
  ];
}

function wrapDenoEachArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  if (isDenoTestDefinition(args[0])) {
    return [
      {
        ...args[0],
        fn: wrapDenoEachCallback(args[0].fn as unknown as AnyFunction, options),
      },
      ...args.slice(1),
    ];
  }

  const callback = args.at(-1);
  if (typeof callback !== "function") return [...args];

  return [
    ...args.slice(0, -1),
    wrapDenoEachCallback(callback as AnyFunction, options),
  ];
}

function wrapDenoEachCallback(
  callback: AnyFunction,
  options: FailureLogReporterOptions,
): AnyFunction {
  const reporter = createFailureLogReporter(options);
  return function (this: unknown, ...args: never[]) {
    return reporter.run(() =>
      Reflect.apply(
        callback,
        this,
        wrapDenoEachCallbackArguments(args, options),
      )
    );
  };
}

function wrapDenoEachCallbackArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  const lastArgument = args.at(-1);
  if (!isDenoTestContext(lastArgument)) return [...args];
  return [
    ...args.slice(0, -1),
    wrapDenoTestContext(lastArgument, options),
  ];
}

function wrapDenoTestCallback(
  callback: DenoTestCallback,
  options: FailureLogReporterOptions,
): DenoTestCallback {
  const reporter = createFailureLogReporter(options);
  return function (this: unknown, context: Deno.TestContext) {
    return reporter.run(() =>
      Reflect.apply(callback, this, [wrapDenoTestContext(context, options)])
    );
  };
}

function wrapDenoTestContext(
  context: Deno.TestContext,
  options: FailureLogReporterOptions,
): Deno.TestContext {
  return new Proxy(context, {
    get(target, property, receiver) {
      if (property !== "step") return Reflect.get(target, property, receiver);
      const step = Reflect.get(target, property, receiver);
      if (typeof step !== "function") return step;
      return (...args: unknown[]) =>
        Reflect.apply(
          step,
          target,
          wrapDenoStepArguments(args, options),
        );
    },
  });
}

function wrapDenoStepArguments(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  if (isDenoStepDefinition(args[0])) {
    return [
      {
        ...args[0],
        fn: wrapDenoStepCallback(args[0].fn, options),
      },
      ...args.slice(1),
    ];
  }

  const callback = args.at(-1);
  if (typeof callback !== "function") return [...args];

  return [
    ...args.slice(0, -1),
    wrapDenoStepCallback(callback as AnyFunction, options),
  ];
}

function wrapDenoStepCallback(
  callback: AnyFunction,
  options: FailureLogReporterOptions,
): AnyFunction {
  const reporter = createFailureLogReporter(options);
  return function (this: unknown, ...args: never[]) {
    return reporter.run(() =>
      Reflect.apply(callback, this, [
        wrapDenoTestContext(
          args[0] as Deno.TestContext,
          options,
        ),
        ...args.slice(1),
      ])
    );
  };
}

function isDenoTestDefinition(value: unknown): value is DenoTestDefinition {
  return typeof value === "object" && value != null &&
    "fn" in value && typeof value.fn === "function";
}

function isDenoTestOptions(value: unknown): value is DenoTestOptions {
  return typeof value === "object" && value != null &&
    !isDenoTestDefinition(value);
}

function isDenoStepDefinition(
  value: unknown,
): value is { readonly fn: AnyFunction } {
  return typeof value === "object" && value != null &&
    "fn" in value && typeof value.fn === "function";
}

function isDenoTestContext(value: unknown): value is Deno.TestContext {
  return typeof value === "object" && value != null &&
    "step" in value && typeof value.step === "function";
}

/**
 * A Deno test context.
 *
 * @since 2.3.0
 */
export type TestContext = Deno.TestContext;
