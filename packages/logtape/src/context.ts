import { LoggerImpl } from "./logger.ts";

/**
 * Internal symbol for storing category prefix in context.
 */
const categoryPrefixSymbol: unique symbol = Symbol.for(
  "logtape.categoryPrefix",
) as typeof categoryPrefixSymbol;

/**
 * A generic interface for a context-local storage.  It resembles
 * the {@link AsyncLocalStorage} API from Node.js.
 * @template T The type of the context-local store.
 * @since 0.7.0
 */
export interface ContextLocalStorage<T> {
  /**
   * Runs a callback with the given store as the context-local store.
   * @param store The store to use as the context-local store.
   * @param callback The callback to run.
   * @returns The return value of the callback.
   */
  run<R>(store: T, callback: () => R): R;

  /**
   * Returns the current context-local store.
   * @returns The current context-local store, or `undefined` if there is no
   *          store.
   */
  getStore(): T | undefined;
}

/**
 * Runs a callback with the given implicit context.  Every single log record
 * in the callback will have the given context.
 *
 * If no `contextLocalStorage` is configured, this function does nothing and
 * just returns the return value of the callback.  It also logs a warning to
 * the `["logtape", "meta"]` logger in this case.
 * @param context The context to inject.
 * @param callback The callback to run.
 * @returns The return value of the callback.
 * @since 0.7.0
 */
export function withContext<T>(
  context: Record<string, unknown>,
  callback: () => T,
): T {
  const rootLogger = LoggerImpl.getLogger();
  if (rootLogger.contextLocalStorage == null) {
    LoggerImpl.getLogger(["logtape", "meta"]).warn(
      "Context-local storage is not configured.  " +
        "Specify contextLocalStorage option in the configure() function.",
    );
    return callback();
  }
  const parentContext = rootLogger.contextLocalStorage.getStore() ?? {};
  return rootLogger.contextLocalStorage.run(
    { ...parentContext, ...context },
    callback,
  );
}

/**
 * Gets the current category prefix from context local storage.
 * @returns The current category prefix, or an empty array if not set.
 * @since 1.3.0
 */
export function getCategoryPrefix(): readonly string[] {
  const rootLogger = LoggerImpl.getLogger();
  const store = rootLogger.contextLocalStorage?.getStore();
  if (store == null) return [];
  const prefix = store[categoryPrefixSymbol as unknown as string];
  return Array.isArray(prefix) ? prefix : [];
}

/**
 * Gets the current implicit context from context local storage, excluding
 * internal symbol keys (like category prefix).
 * @returns The current implicit context without internal symbol keys.
 * @since 1.3.0
 */
export function getImplicitContext(): Record<string, unknown> {
  const rootLogger = LoggerImpl.getLogger();
  const store = rootLogger.contextLocalStorage?.getStore();
  if (store == null) return {};
  // Filter out symbol keys (like categoryPrefixSymbol)
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(store)) {
    result[key] = store[key];
  }
  return result;
}

/**
 * Runs a callback with the given category prefix prepended to all log
 * categories within the callback context.
 *
 * This is useful for SDKs or libraries that want to add their own category
 * as a prefix to logs from their internal dependencies.
 *
 * If no `contextLocalStorage` is configured, this function does nothing and
 * just returns the return value of the callback.  It also logs a warning to
 * the `["logtape", "meta"]` logger in this case.
 *
 * @example Basic usage
 * ```typescript
 * import { getLogger, withCategoryPrefix } from "@logtape/logtape";
 *
 * export function sdkFunction() {
 *   return withCategoryPrefix(["my-sdk"], () => {
 *     // Any logs from internal libraries within this context
 *     // will have ["my-sdk"] prepended to their category
 *     return internalLibraryFunction();
 *   });
 * }
 * ```
 *
 * @param prefix The category prefix to prepend.  Can be a string or an array
 *               of strings.
 * @param callback The callback to run.
 * @returns The return value of the callback.
 * @since 1.3.0
 */
export function withCategoryPrefix<T>(
  prefix: string | readonly string[],
  callback: () => T,
): T {
  const rootLogger = LoggerImpl.getLogger();
  if (rootLogger.contextLocalStorage == null) {
    LoggerImpl.getLogger(["logtape", "meta"]).warn(
      "Context-local storage is not configured.  " +
        "Specify contextLocalStorage option in the configure() function.",
    );
    return callback();
  }
  const parentContext = rootLogger.contextLocalStorage.getStore() ?? {};
  const parentPrefix = getCategoryPrefix();
  const newPrefix = typeof prefix === "string" ? [prefix] : [...prefix];
  return rootLogger.contextLocalStorage.run(
    {
      ...parentContext,
      [categoryPrefixSymbol as unknown as string]: [
        ...parentPrefix,
        ...newPrefix,
      ],
    },
    callback,
  );
}
