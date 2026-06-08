import type { ContextLocalStorage } from "./context.ts";
import { type FilterLike, toFilter } from "./filter.ts";
import type { LogLevel } from "./level.ts";
import { LoggerImpl } from "./logger.ts";
import { getConsoleSink, type Sink } from "./sink.ts";

/**
 * A configuration for the loggers.
 */
export interface Config<TSinkId extends string, TFilterId extends string> {
  /**
   * The sinks to use.  The keys are the sink identifiers, and the values are
   * {@link Sink}s.
   */
  sinks: Record<TSinkId, Sink>;
  /**
   * The filters to use.  The keys are the filter identifiers, and the values
   * are either {@link Filter}s or {@link LogLevel}s.
   */
  filters?: Record<TFilterId, FilterLike>;

  /**
   * The loggers to configure.
   */
  loggers: LoggerConfig<TSinkId, TFilterId>[];

  /**
   * The context-local storage to use for implicit contexts.
   * @since 0.7.0
   */
  contextLocalStorage?: ContextLocalStorage<Record<string, unknown>>;

  /**
   * Whether to reset the configuration before applying this one.
   */
  reset?: boolean;
}

/**
 * A logger configuration.
 */
export interface LoggerConfig<
  TSinkId extends string,
  TFilterId extends string,
> {
  /**
   * The category of the logger.  If a string, it is equivalent to an array
   * with one element.
   */
  category: string | string[];

  /**
   * The sink identifiers to use.
   */
  sinks?: TSinkId[];

  /**
   * Whether to inherit the parent's sinks.  If `inherit`, the parent's sinks
   * are used along with the specified sinks.  If `override`, the parent's
   * sinks are not used, and only the specified sinks are used.
   *
   * The default is `inherit`.
   * @default `"inherit"
   * @since 0.6.0
   */
  parentSinks?: "inherit" | "override";

  /**
   * The filter identifiers to use.
   */
  filters?: TFilterId[];

  /**
   * The lowest log level to accept.  If `null`, the logger will reject all
   * records.
   * @since 0.8.0
   */
  lowestLevel?: LogLevel | null;
}

/**
 * The current configuration, if any.  Otherwise, `null`.
 */
let currentConfig: Config<string, string> | null = null;

/**
 * Strong references to the loggers.
 * This is to prevent the loggers from being garbage collected so that their
 * sinks and filters are not removed.
 */
const strongRefs: Set<LoggerImpl> = new Set();

/**
 * Sync filter disposables to dispose when resetting the configuration.
 */
const filterDisposables: Set<Disposable> = new Set();

/**
 * Sync sink disposables to dispose when resetting the configuration.
 */
const sinkDisposables: Set<Disposable> = new Set();

/**
 * Async filter disposables to dispose when resetting the configuration.
 */
const asyncFilterDisposables: Set<AsyncDisposable> = new Set();

/**
 * Async sink disposables to dispose when resetting the configuration.
 */
const asyncSinkDisposables: Set<AsyncDisposable> = new Set();

/**
 * Check if a config is for the meta logger.
 */
function isLoggerConfigMeta<TSinkId extends string, TFilterId extends string>(
  cfg: LoggerConfig<TSinkId, TFilterId>,
): boolean {
  const category = Array.isArray(cfg.category) ? cfg.category : [cfg.category];
  return category.length === 0 ||
    (category.length === 1 && category[0] === "logtape") ||
    (category.length === 2 &&
      category[0] === "logtape" &&
      category[1] === "meta");
}

function registerDisposeHook(allowAsync: boolean): void {
  const handler = allowAsync ? dispose : disposeSync;

  if (
    // deno-lint-ignore no-explicit-any
    typeof (globalThis as any).EdgeRuntime !== "string" &&
    "process" in globalThis &&
    !("Deno" in globalThis)
  ) {
    // deno-lint-ignore no-explicit-any
    const proc = (globalThis as any).process;
    // Use bracket notation to avoid static analysis detection in Edge Runtime.
    const onMethod = proc?.["on"];
    if (typeof onMethod === "function") {
      onMethod.call(proc, "exit", handler);
      return;
    }
  }

  // Some edge runtimes expose neither process.on() nor addEventListener().
  // In those environments users can still call dispose()/disposeSync() manually.
  // deno-lint-ignore no-explicit-any
  const addEventListenerMethod = (globalThis as any).addEventListener;
  if (typeof addEventListenerMethod !== "function") return;

  if ("Deno" in globalThis) {
    addEventListenerMethod.call(globalThis, "unload", handler);
  } else {
    addEventListenerMethod.call(globalThis, "pagehide", handler);
  }
}

/**
 * Configure the loggers with the specified configuration.
 *
 * Note that if the given sinks or filters are disposable, they will be
 * disposed when the configuration is reset, or when the process exits.
 *
 * @example
 * ```typescript
 * await configure({
 *   sinks: {
 *     console: getConsoleSink(),
 *   },
 *   filters: {
 *     slow: (log) =>
 *       "duration" in log.properties &&
 *       log.properties.duration as number > 1000,
 *   },
 *   loggers: [
 *     {
 *       category: "my-app",
 *       sinks: ["console"],
 *       lowestLevel: "info",
 *     },
 *     {
 *       category: ["my-app", "sql"],
 *       filters: ["slow"],
 *       lowestLevel: "debug",
 *     },
 *     {
 *       category: "logtape",
 *       sinks: ["console"],
 *       lowestLevel: "error",
 *     },
 *   ],
 * });
 * ```
 *
 * @param config The configuration.
 */
export async function configure<
  TSinkId extends string,
  TFilterId extends string,
>(config: Config<TSinkId, TFilterId>): Promise<void> {
  if (currentConfig != null && !config.reset) {
    throw new ConfigError(
      "Already configured; if you want to reset, turn on the reset flag.",
    );
  }
  await reset();
  try {
    configureInternal(config, true);
  } catch (e) {
    if (e instanceof ConfigError) await reset();
    throw e;
  }
}

/**
 * Configure sync loggers with the specified configuration.
 *
 * Note that if the given sinks or filters are disposable, they will be
 * disposed when the configuration is reset, or when the process exits.
 *
 * Also note that passing async sinks or filters will throw. If
 * necessary use {@link resetSync} or {@link disposeSync}.
 *
 * @example
 * ```typescript
 * configureSync({
 *   sinks: {
 *     console: getConsoleSink(),
 *   },
 *   loggers: [
 *     {
 *       category: "my-app",
 *       sinks: ["console"],
 *       lowestLevel: "info",
 *     },
 *     {
 *       category: "logtape",
 *       sinks: ["console"],
 *       lowestLevel: "error",
 *     },
 *   ],
 * });
 * ```
 *
 * @param config The configuration.
 * @since 0.9.0
 */
export function configureSync<TSinkId extends string, TFilterId extends string>(
  config: Config<TSinkId, TFilterId>,
): void {
  if (currentConfig != null && !config.reset) {
    throw new ConfigError(
      "Already configured; if you want to reset, turn on the reset flag.",
    );
  }
  if (asyncFilterDisposables.size > 0 || asyncSinkDisposables.size > 0) {
    throw new ConfigError(
      "Previously configured async disposables are still active. " +
        "Use configure() instead or explicitly dispose them using dispose().",
    );
  }
  resetSync();
  try {
    configureInternal(config, false);
  } catch (e) {
    if (e instanceof ConfigError) resetSync();
    throw e;
  }
}

function configureInternal<
  TSinkId extends string,
  TFilterId extends string,
>(config: Config<TSinkId, TFilterId>, allowAsync: boolean): void {
  currentConfig = config;

  let metaConfigured = false;
  const configuredCategories = new Set<string>();

  for (const cfg of config.loggers) {
    if (isLoggerConfigMeta(cfg)) {
      metaConfigured = true;
    }

    // Check for duplicate logger categories
    const categoryKey = Array.isArray(cfg.category)
      ? JSON.stringify(cfg.category)
      : JSON.stringify([cfg.category]);
    if (configuredCategories.has(categoryKey)) {
      throw new ConfigError(
        `Duplicate logger configuration for category: ${categoryKey}. ` +
          `Each category can only be configured once.`,
      );
    }
    configuredCategories.add(categoryKey);

    const logger = LoggerImpl.getLogger(cfg.category);
    for (const sinkId of cfg.sinks ?? []) {
      const sink = config.sinks[sinkId];
      if (!sink) {
        throw new ConfigError(`Sink not found: ${sinkId}.`);
      }
      logger.sinks.push(sink);
    }
    logger.parentSinks = cfg.parentSinks ?? "inherit";
    if (cfg.lowestLevel !== undefined) {
      logger.lowestLevel = cfg.lowestLevel;
    }
    for (const filterId of cfg.filters ?? []) {
      const filter = config.filters?.[filterId];
      if (filter === undefined) {
        throw new ConfigError(`Filter not found: ${filterId}.`);
      }
      logger.filters.push(toFilter(filter));
    }
    strongRefs.add(logger);
  }

  LoggerImpl.getLogger().contextLocalStorage = config.contextLocalStorage;

  for (const sink of Object.values<Sink>(config.sinks)) {
    if (Symbol.asyncDispose in sink) {
      if (allowAsync) asyncSinkDisposables.add(sink as AsyncDisposable);
      else {
        throw new ConfigError(
          "Async disposables cannot be used with configureSync().",
        );
      }
    }
    if (Symbol.dispose in sink) sinkDisposables.add(sink as Disposable);
  }

  for (const filter of Object.values<FilterLike>(config.filters ?? {})) {
    if (filter == null || typeof filter === "string") continue;
    if (Symbol.asyncDispose in filter) {
      if (allowAsync) asyncFilterDisposables.add(filter as AsyncDisposable);
      else {
        throw new ConfigError(
          "Async disposables cannot be used with configureSync().",
        );
      }
      asyncSinkDisposables.delete(filter as AsyncDisposable);
    }
    if (Symbol.dispose in filter) {
      filterDisposables.add(filter as Disposable);
      sinkDisposables.delete(filter as Disposable);
    }
  }

  registerDisposeHook(allowAsync);
  const meta = LoggerImpl.getLogger(["logtape", "meta"]);
  if (!metaConfigured) {
    meta.sinks.push(getConsoleSink());
  }

  meta.info(
    "LogTape loggers are configured.  Note that LogTape itself uses the meta " +
      "logger, which has category {metaLoggerCategory}.  The meta logger is " +
      "used to log internal diagnostics such as sink exceptions.  " +
      "It's recommended to configure the meta logger with a separate sink " +
      "so that you can easily notice if logging itself fails or is " +
      "misconfigured.  To turn off this message, configure the meta logger " +
      "with higher log levels than {dismissLevel}.  See also " +
      "<https://logtape.org/manual/categories#meta-logger>.",
    { metaLoggerCategory: ["logtape", "meta"], dismissLevel: "info" },
  );
}

/**
 * Get the current configuration, if any.  Otherwise, `null`.
 * @returns The current configuration, if any.  Otherwise, `null`.
 */
export function getConfig(): Config<string, string> | null {
  return currentConfig;
}

/**
 * Reset the configuration.  Mostly for testing purposes.
 */
export async function reset(): Promise<void> {
  await dispose();
  resetInternal();
}

/**
 * Reset the configuration.  Mostly for testing purposes. Will not clear async
 * sinks, only use with sync sinks. Use {@link reset} if you have async sinks.
 * @since 0.9.0
 */
export function resetSync(): void {
  disposeSync();
  resetInternal();
}

function resetInternal(): void {
  const rootLogger = LoggerImpl.getLogger([]);
  rootLogger.resetDescendants();
  delete rootLogger.contextLocalStorage;
  strongRefs.clear();
  currentConfig = null;
}

/**
 * Dispose of the disposables.
 */
export async function dispose(): Promise<void> {
  const errors: unknown[] = [];
  try {
    disposeSyncFilters();
  } catch (error) {
    errors.push(error);
  }
  try {
    await disposeAsyncFilters();
  } catch (error) {
    errors.push(error);
  }
  try {
    disposeSyncSinks();
  } catch (error) {
    errors.push(error);
  }
  try {
    await disposeAsyncSinks();
  } catch (error) {
    errors.push(error);
  }
  throwDisposeErrors(errors);
}

/**
 * Dispose of the sync disposables. Async disposables will be untouched,
 * use {@link dispose} if you have async sinks.
 * @since 0.9.0
 */
export function disposeSync(): void {
  const errors: unknown[] = [];
  try {
    disposeSyncFilters();
  } catch (error) {
    errors.push(error);
  }
  try {
    disposeSyncSinks();
  } catch (error) {
    errors.push(error);
  }
  throwDisposeErrors(errors);
}

function disposeSyncFilters(): void {
  disposeSyncDisposables(filterDisposables);
}

function disposeSyncSinks(): void {
  disposeSyncDisposables(sinkDisposables);
}

function disposeSyncDisposables(disposables: Set<Disposable>): void {
  const errors: unknown[] = [];
  try {
    for (const disposable of disposables) {
      try {
        disposable[Symbol.dispose]();
      } catch (error) {
        errors.push(error);
      } finally {
        disposables.delete(disposable);
      }
    }
  } finally {
    disposables.clear();
  }
  throwDisposeErrors(errors);
}

async function disposeAsyncFilters(): Promise<void> {
  await disposeAsyncDisposables(asyncFilterDisposables);
}

async function disposeAsyncSinks(): Promise<void> {
  await disposeAsyncDisposables(asyncSinkDisposables);
}

async function disposeAsyncDisposables(
  disposables: Set<AsyncDisposable>,
): Promise<void> {
  const promises: PromiseLike<void>[] = [];
  try {
    for (const disposable of disposables) {
      try {
        promises.push(Promise.resolve(disposable[Symbol.asyncDispose]()));
      } catch (error) {
        promises.push(Promise.reject(error));
      } finally {
        disposables.delete(disposable);
      }
    }
  } finally {
    disposables.clear();
  }
  await settleDisposePromises(promises);
}

async function settleDisposePromises(
  promises: readonly PromiseLike<void>[],
): Promise<void> {
  const results = await Promise.allSettled(promises);
  throwDisposeErrors(
    results
      .filter((result): result is PromiseRejectedResult =>
        result.status === "rejected"
      )
      .map((result) => result.reason),
  );
}

function throwDisposeErrors(errors: readonly unknown[]): void {
  if (errors.length < 1) return;
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(
    errors,
    "Multiple errors occurred while disposing LogTape resources.",
  );
}

/**
 * A configuration error.
 */
export class ConfigError extends Error {
  /**
   * Constructs a new configuration error.
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "ConfigureError";
  }
}
