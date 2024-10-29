import { LoggerImpl } from "./logger.ts";

/**
 * A generic interface for a context-local storage.  It resembles
 * the {@link AsyncLocalStorage} API from Node.js.
 * @typeParam T The type of the context-local store.
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
    throw new TypeError(
      "Context-local storage is not configured.  " +
        "Specify contextLocalStorage option in the configure() function.",
    );
  }
  const parentContext = rootLogger.contextLocalStorage.getStore() ?? {};
  return rootLogger.contextLocalStorage.run(
    { ...parentContext, ...context },
    callback,
  );
}