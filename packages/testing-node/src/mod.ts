// deno-coverage-ignore-file -- This package targets node:test.  Deno's
// node:test shim rejects the nested registrations needed by the integration
// tests, so coverage for this module comes from the Node.js and Bun jobs.
import nodeTest, { it as nodeIt } from "node:test";
import type { TestContext } from "node:test";

import {
  createFailureLogReporter,
  type FailureLogReporterOptions,
} from "@logtape/testing/reporter";

export type {
  FailureLogReporterOptions,
  FailureLogReportMode,
} from "@logtape/testing/reporter";
export {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  mock,
  run,
  suite,
} from "node:test";

/**
 * Options accepted by Node.js `test()` and `it()` functions.
 *
 * The shape intentionally mirrors Node's documented option bag while allowing
 * newer Node.js options to pass through even when a runtime's bundled TypeScript
 * declarations lag behind the current documentation.
 *
 * @since 2.3.0
 */
export interface NodeTestOptions {
  readonly concurrency?: number | boolean;
  readonly expectFailure?:
    | boolean
    | string
    | RegExp
    | ((error: unknown) => boolean)
    | object
    | Error;
  readonly only?: boolean;
  readonly signal?: AbortSignal;
  readonly skip?: boolean | string;
  readonly tags?: readonly string[];
  readonly todo?: boolean | string;
  readonly timeout?: number;
  readonly plan?: number;
}

/**
 * A callback passed to Node.js `test()` or `it()`.
 *
 * @since 2.3.0
 */
export type NodeTestCallback = (
  context: TestContext,
  done?: NodeDoneCallback,
) => unknown;

/**
 * A Node.js `test()`-compatible function.
 *
 * @since 2.3.0
 */
export interface NodeTestFunction {
  (name?: string, options?: NodeTestOptions, fn?: NodeTestCallback): Promise<
    void
  >;
  (name?: string, fn?: NodeTestCallback): Promise<void>;
  (options?: NodeTestOptions, fn?: NodeTestCallback): Promise<void>;
  (fn?: NodeTestCallback): Promise<void>;
  readonly only: NodeTestFunction;
  readonly skip: NodeTestFunction;
  readonly todo: NodeTestFunction;
  readonly expectFailure?: NodeTestFunction;
  readonly it?: NodeTestFunction;
  readonly test?: NodeTestFunction;
}

type NodeDoneCallback = (error?: unknown) => void;
type AnyFunction = (...args: never[]) => unknown;
type BaseNodeTestFunction = AnyFunction & {
  readonly only: AnyFunction;
  readonly skip: AnyFunction;
  readonly todo: AnyFunction;
  readonly expectFailure?: AnyFunction;
  readonly it?: AnyFunction;
  readonly test?: AnyFunction;
};

/**
 * Creates a `node:test` test function that reports LogTape records from failed
 * test callbacks.
 *
 * The returned function preserves Node.js test options and shorthand helpers
 * such as `test.only()`, `test.skip()`, and `test.todo()`.  Only callback
 * arguments are adapted; options are passed through to `node:test`.
 *
 * @param options Failure log reporter options.
 * @returns A configured `node:test`-compatible test function.
 * @since 2.3.0
 */
export function createTest(
  options: FailureLogReporterOptions = {},
): NodeTestFunction {
  return createNodeTestFunction(
    nodeTest as unknown as BaseNodeTestFunction,
    options,
  );
}

/**
 * Creates an `it()` alias that reports LogTape records from failed test
 * callbacks.
 *
 * @param options Failure log reporter options.
 * @returns A configured `node:test`-compatible `it()` function.
 * @since 2.3.0
 */
export function createIt(
  options: FailureLogReporterOptions = {},
): NodeTestFunction {
  return createNodeTestFunction(
    nodeIt as unknown as BaseNodeTestFunction,
    options,
  );
}

/**
 * A `node:test` test function that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const test: NodeTestFunction = createTest();

/**
 * A `node:test` `it()` alias that reports LogTape records from failed test
 * callbacks using the default reporter options.
 *
 * @since 2.3.0
 */
export const it: NodeTestFunction = createIt();

/**
 * Shorthand for marking a test as `only`.
 *
 * @since 2.3.0
 */
export const only: NodeTestFunction = test.only;

/**
 * Shorthand for skipping a test.
 *
 * @since 2.3.0
 */
export const skip: NodeTestFunction = test.skip;

/**
 * Shorthand for marking a test as TODO.
 *
 * @since 2.3.0
 */
export const todo: NodeTestFunction = test.todo;

/**
 * Shorthand for expecting a test to fail when supported by the active Node.js
 * runtime.
 *
 * @since 2.3.0
 */
export const expectFailure: NodeTestFunction | undefined = test.expectFailure;

/**
 * Node.js' test assertion tracker when supported by the active runtime.
 *
 * @since 2.3.0
 */
export const assert: unknown = (test as { readonly assert?: unknown }).assert;

/**
 * Node.js' snapshot helper when supported by the active runtime.
 *
 * @since 2.3.0
 */
export const snapshot: unknown = (test as { readonly snapshot?: unknown })
  .snapshot;

export default test;

function createNodeTestFunction(
  baseTest: BaseNodeTestFunction,
  options: FailureLogReporterOptions,
  includeExtendedProperties = true,
): NodeTestFunction {
  const register = ((...args: unknown[]) =>
    Reflect.apply(
      baseTest,
      undefined,
      wrapCallbackArgument(args, options),
    )) as NodeTestFunction;

  const baseExpectFailure = baseTest.expectFailure;
  const wrapped = Object.assign(register, baseTest, {
    only: ((...args: unknown[]) =>
      Reflect.apply(
        baseTest.only,
        undefined,
        wrapCallbackArgument(args, options),
      )) as NodeTestFunction["only"],
    skip: ((...args: unknown[]) =>
      Reflect.apply(
        baseTest.skip,
        undefined,
        wrapCallbackArgument(args, options),
      )) as NodeTestFunction["skip"],
    todo: ((...args: unknown[]) =>
      Reflect.apply(
        baseTest.todo,
        undefined,
        wrapCallbackArgument(args, options),
      )) as NodeTestFunction["todo"],
    expectFailure: typeof baseExpectFailure === "function"
      ? ((...args: unknown[]) =>
        Reflect.apply(
          baseExpectFailure,
          undefined,
          wrapCallbackArgument(args, options),
        )) as NodeTestFunction["expectFailure"]
      : undefined,
  });

  if (includeExtendedProperties) {
    if (typeof baseTest.it === "function") {
      Object.defineProperty(wrapped, "it", {
        configurable: true,
        enumerable: true,
        value: createNodeTestFunction(
          baseTest.it as BaseNodeTestFunction,
          options,
          false,
        ),
        writable: true,
      });
    }
    if (typeof baseTest.test === "function") {
      Object.defineProperty(wrapped, "test", {
        configurable: true,
        enumerable: true,
        value: wrapped,
        writable: true,
      });
    }
  }

  return wrapped;
}

function wrapCallbackArgument(
  args: readonly unknown[],
  options: FailureLogReporterOptions,
): unknown[] {
  const callback = args.at(-1);
  if (typeof callback !== "function") return [...args];

  const reporter = createFailureLogReporter(options);
  const wrapped = wrapNodeCallback(
    reporter.wrap.bind(reporter),
    callback as unknown as AnyFunction,
  );
  return [...args.slice(0, -1), wrapped];
}

function wrapNodeCallback(
  wrap: ReturnType<typeof createFailureLogReporter>["wrap"],
  callback: AnyFunction,
): AnyFunction {
  if (callback.length >= 2) {
    return function (
      this: unknown,
      context: TestContext,
      done: NodeDoneCallback,
    ): void {
      const runCallback = (...args: readonly unknown[]): unknown =>
        Reflect.apply(callback, this, args);
      void wrap(() =>
        new Promise<void>((resolve, reject) => {
          let settled = false;
          const wrappedDone: NodeDoneCallback = ((error?: unknown) => {
            if (settled) return;
            settled = true;
            if (error == null) resolve();
            else reject(error);
          }) as NodeDoneCallback;

          try {
            runCallback(context, wrappedDone);
          } catch (error) {
            reject(error);
          }
        })
      )().then(
        () => done(),
        (error: unknown) => done(error),
      );
    };
  }

  if (callback.length === 0) {
    return function (this: unknown): Promise<unknown> {
      return wrap(() => Reflect.apply(callback, this, []))();
    };
  }

  return function (this: unknown, context: TestContext): Promise<unknown> {
    return wrap(() => Reflect.apply(callback, this, [context]))();
  };
}

export type { TestContext };
