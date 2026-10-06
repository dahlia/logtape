import type { ContextLocalStorage } from "./context.ts";
import { type Filter, type FilterLike, toFilter } from "./filter.ts";
import type { LogLevel } from "./level.ts";
import { LoggerImpl } from "./logger.ts";
import {
  type CompiledScopedConfig,
  compileScopedConfig,
  disposeScopedConfig,
  disposeScopedConfigSync,
  getCurrentScopedConfig,
  runWithScopedConfig,
  type ScopedConfigLike,
  throwCombinedErrors,
} from "./scoped-config.ts";
import { type Drainable, getConsoleSink, type Sink } from "./sink.ts";

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
 * A scoped configuration for the current execution context.
 *
 * Unlike {@link Config}, this type does not include `reset` or
 * `contextLocalStorage`.  Scoped configuration changes only the logging policy
 * for a callback; the context-local storage must already be initialized by the
 * process-global configuration.
 *
 * @since 2.3.0
 */
export type ScopedConfig<TSinkId extends string, TFilterId extends string> =
  ScopedConfigLike<TSinkId, TFilterId>;

type SyncCallbackResult<TResult> = TResult extends PromiseLike<unknown> ? never
  : TResult;

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
   * How to combine the logger's sinks with its ancestors' sinks.
   *
   * If `inherit`, the sinks that the parent would use for a record's level
   * are used along with the specified sinks.  The parent's `lowestLevel`
   * continues to apply to the inherited sinks.
   *
   * If `override`, only the specified sinks are used.
   *
   * If `forward`, every ancestor's configured sinks are used along with the
   * specified sinks, ignoring each ancestor's `lowestLevel` (including
   * `null`); only this logger's own `lowestLevel` applies.  An ancestor
   * configured with `parentSinks: "override"` forms a boundary: its own
   * sinks are still inherited, but nothing beyond it.  Repeated references
   * to the same sink are not deduplicated.  Available since 2.4.0.
   *
   * The default is `inherit`.
   * @default "inherit"
   * @since 0.6.0
   */
  parentSinks?: "inherit" | "override" | "forward";

  /**
   * The filter identifiers to use.  If no filters are specified, the logger
   * uses the filters from the nearest ancestor that has them.  Specifying one
   * or more filters replaces the inherited filters instead of combining with
   * them.
   */
  filters?: TFilterId[];

  /**
   * The lowest log level to accept.  If `null`, the logger will reject all
   * records.
   * @since 0.8.0
   */
  lowestLevel?: LogLevel | null;

  /**
   * Whether to capture where in the source code each logging method of this
   * logger and its descendants is called, and put it in the
   * `LogRecord.sourceLocation` field of the log records.  Formatters
   * show it only if asked to, e.g., with the
   * `TextFormatterOptions.sourceLocation` option.
   *
   * Capturing builds a stack trace for every logging call that is not
   * filtered out by its level, so this is meant for development rather than
   * production.  The location comes from the runtime's stack trace and is
   * absent if it cannot be determined.
   *
   * If omitted, the setting is inherited from the parent category.  The meta
   * logger never captures source locations.
   * @default `false` for the root logger
   * @since 2.4.0
   */
  captureSourceLocation?: boolean;
}

/**
 * The current configuration, if any.  Otherwise, `null`.
 */
let currentConfig: Config<string, string> | null = null;
let activeScopedConfigCount = 0;
const activeScopedConfigs: Set<CompiledScopedConfig> = new Set();
let globalConfigMutationInProgress = false;

/**
 * Strong references to the loggers.
 * This is to prevent the loggers from being garbage collected so that their
 * sinks and filters are not removed.
 */
const strongRefs: Set<LoggerImpl> = new Set();

/**
 * The sinks installed by the current configuration, which {@link drain}
 * drains.  Kept separately from {@link currentConfig} because the caller may
 * mutate the configuration object after configuring.
 */
const installedSinks: Set<Sink> = new Set();

/**
 * What {@link configure} attached to each configured logger, together with the
 * sink and filter identifiers it resolved them from.
 */
interface ConfiguredLogger {
  readonly sinks: readonly Sink[];
  readonly sinkIds: readonly string[];
  readonly filters: readonly Filter[];
  readonly filterIds: readonly string[];
}

/**
 * The state that {@link inspectLogger} reads.  Like the logger tree, it is
 * shared through `globalThis`, so that copies of LogTape in the same process
 * (e.g., the CommonJS build next to the ESM build) describe the configuration
 * that actually dispatches records, whichever copy applied it.  Copies older
 * than 2.4.0 do not maintain it.
 */
interface InspectionState {
  configured: boolean;
  loggers: WeakMap<object, ConfiguredLogger>;
}

const inspectionStateSymbol = Symbol.for("logtape.inspectionState");

function getInspectionState(): InspectionState {
  const registry = globalThis as unknown as Record<symbol, unknown>;
  const state = registry[inspectionStateSymbol] as InspectionState | undefined;
  if (state != null && state.loggers instanceof WeakMap) return state;
  const newState: InspectionState = {
    configured: false,
    loggers: new WeakMap(),
  };
  registry[inspectionStateSymbol] = newState;
  return newState;
}

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

let unregisterDisposeHook: (() => void) | undefined;

/**
 * Gets the root logger to toggle source location capture on.  The root logger
 * is shared through the global object, so it can be made by an older copy of
 * LogTape loaded by another package, which lacks these methods.  Its loggers
 * never capture source locations, so the calls are just skipped then.
 */
function getSourceLocationRoot(): Partial<
  Pick<
    LoggerImpl,
    | "setGlobalSourceLocationCapture"
    | "retainScopedSourceLocationCapture"
    | "releaseScopedSourceLocationCapture"
  >
> {
  return LoggerImpl.getLogger();
}

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
  unregisterDisposeHook?.();
  unregisterDisposeHook = undefined;

  const handler = allowAsync ? disposeInternal : disposeSyncInternal;

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
      unregisterDisposeHook = () => {
        const offMethod = proc?.["off"] ?? proc?.["removeListener"];
        if (typeof offMethod === "function") {
          offMethod.call(proc, "exit", handler);
        }
      };
      return;
    }
  }

  // Some edge runtimes expose neither process.on() nor addEventListener().
  // In those environments users can still call dispose()/disposeSync() manually.
  // deno-lint-ignore no-explicit-any
  const addEventListenerMethod = (globalThis as any).addEventListener;
  if (typeof addEventListenerMethod !== "function") return;
  // deno-lint-ignore no-explicit-any
  const removeEventListenerMethod = (globalThis as any).removeEventListener;

  if ("Deno" in globalThis) {
    addEventListenerMethod.call(globalThis, "unload", handler);
    if (typeof removeEventListenerMethod === "function") {
      unregisterDisposeHook = () => {
        removeEventListenerMethod.call(globalThis, "unload", handler);
      };
    }
  } else {
    addEventListenerMethod.call(globalThis, "pagehide", handler);
    if (typeof removeEventListenerMethod === "function") {
      unregisterDisposeHook = () => {
        removeEventListenerMethod.call(globalThis, "pagehide", handler);
      };
    }
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
  await runGlobalConfigMutation("configure()", async () => {
    if (currentConfig != null && !config.reset) {
      throw new ConfigError(
        "Already configured; if you want to reset, turn on the reset flag.",
      );
    }
    await disposeInternal();
    resetInternal();
    try {
      configureInternal(config, true);
    } catch (e) {
      if (e instanceof ConfigError) {
        await disposeInternal();
        resetInternal();
      }
      throw e;
    }
  });
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
  runGlobalConfigMutationSync("configureSync()", () => {
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
    disposeSyncInternal();
    resetInternal();
    try {
      configureInternal(config, false);
    } catch (e) {
      if (e instanceof ConfigError) {
        disposeSyncInternal();
        resetInternal();
      }
      throw e;
    }
  });
}

/**
 * Runs a callback with a LogTape configuration scoped to the current execution
 * context.
 *
 * The process-global configuration must already provide
 * `contextLocalStorage`.  The scoped configuration fully overrides global
 * logger routing while the callback and its async work run.
 *
 * @param config The scoped configuration.
 * @param callback The callback to run.
 * @returns The callback's resolved return value.
 * @since 2.3.0
 */
export async function withConfig<
  TSinkId extends string,
  TFilterId extends string,
  TResult,
>(
  config: ScopedConfig<TSinkId, TFilterId>,
  callback: () => TResult,
): Promise<Awaited<TResult>> {
  const contextLocalStorage = getConfiguredContextLocalStorage("withConfig()");
  const scopedConfig = compileScopedConfig(
    config,
    true,
    (message) => new ConfigError(message),
  );

  let result: Awaited<TResult>;
  let callbackError: unknown;
  let callbackFailed = false;
  activeScopedConfigCount++;
  activeScopedConfigs.add(scopedConfig);
  const capturesSourceLocation = scopedConfig.capturesSourceLocation;
  if (capturesSourceLocation) {
    getSourceLocationRoot().retainScopedSourceLocationCapture?.();
  }
  try {
    result = await runWithScopedConfig(
      contextLocalStorage,
      scopedConfig,
      callback,
    );
  } catch (error) {
    callbackFailed = true;
    callbackError = error;
  }

  try {
    await disposeScopedConfig(
      scopedConfig,
      getRetainedDisposables(scopedConfig),
    );
  } catch (disposeError) {
    if (callbackFailed) {
      throwCombinedErrors(callbackError, disposeError);
    }
    throw disposeError;
  } finally {
    activeScopedConfigs.delete(scopedConfig);
    activeScopedConfigCount--;
    if (capturesSourceLocation) {
      getSourceLocationRoot().releaseScopedSourceLocationCapture?.();
    }
  }

  if (callbackFailed) throw callbackError;
  return result!;
}

/**
 * Runs a synchronous callback with a LogTape configuration scoped to the
 * current execution context.
 *
 * The scoped configuration must not contain async disposable sinks or filters.
 *
 * @param config The scoped configuration.
 * @param callback The callback to run.
 * @returns The callback's return value.
 * @since 2.3.0
 */
export function withConfigSync<
  TSinkId extends string,
  TFilterId extends string,
  TResult,
>(
  config: ScopedConfig<TSinkId, TFilterId>,
  callback: () => SyncCallbackResult<TResult>,
): SyncCallbackResult<TResult> {
  const contextLocalStorage = getConfiguredContextLocalStorage(
    "withConfigSync()",
  );
  const scopedConfig = compileScopedConfig(
    config,
    false,
    (message) => new ConfigError(message),
  );

  let result: SyncCallbackResult<TResult>;
  let callbackError: unknown;
  let callbackFailed = false;
  activeScopedConfigCount++;
  activeScopedConfigs.add(scopedConfig);
  const capturesSourceLocation = scopedConfig.capturesSourceLocation;
  if (capturesSourceLocation) {
    getSourceLocationRoot().retainScopedSourceLocationCapture?.();
  }
  try {
    result = runWithScopedConfig(contextLocalStorage, scopedConfig, callback);
    if (isThenable(result)) {
      void Promise.resolve(result).catch(() => {});
      callbackFailed = true;
      callbackError = new ConfigError(
        "withConfigSync() callback must not return a promise. " +
          "Use withConfig() for async callbacks.",
      );
    }
  } catch (error) {
    callbackFailed = true;
    callbackError = error;
  }

  try {
    disposeScopedConfigSync(scopedConfig, getRetainedDisposables(scopedConfig));
  } catch (disposeError) {
    if (callbackFailed) {
      throwCombinedErrors(callbackError, disposeError);
    }
    throw disposeError;
  } finally {
    activeScopedConfigs.delete(scopedConfig);
    activeScopedConfigCount--;
    if (capturesSourceLocation) {
      getSourceLocationRoot().releaseScopedSourceLocationCapture?.();
    }
  }

  if (callbackFailed) throw callbackError;
  return result!;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value != null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function";
}

function getGlobalDisposables(): ReadonlySet<Disposable | AsyncDisposable> {
  return new Set<Disposable | AsyncDisposable>([
    ...filterDisposables,
    ...asyncFilterDisposables,
    ...sinkDisposables,
    ...asyncSinkDisposables,
  ]);
}

function getRetainedDisposables(
  scopedConfig: CompiledScopedConfig,
): ReadonlySet<Disposable | AsyncDisposable> {
  const disposables = new Set<Disposable | AsyncDisposable>(
    getGlobalDisposables(),
  );
  for (const activeScopedConfig of activeScopedConfigs) {
    if (activeScopedConfig === scopedConfig || activeScopedConfig.disposed) {
      continue;
    }
    addScopedConfigDisposables(disposables, activeScopedConfig);
  }
  return disposables;
}

function addScopedConfigDisposables(
  disposables: Set<Disposable | AsyncDisposable>,
  scopedConfig: CompiledScopedConfig,
): void {
  for (const disposable of scopedConfig.syncFilters) {
    disposables.add(disposable);
  }
  for (const disposable of scopedConfig.asyncFilters) {
    disposables.add(disposable);
  }
  for (const disposable of scopedConfig.syncSinks) disposables.add(disposable);
  for (const disposable of scopedConfig.asyncSinks) disposables.add(disposable);
}

function configureInternal<
  TSinkId extends string,
  TFilterId extends string,
>(config: Config<TSinkId, TFilterId>, allowAsync: boolean): void {
  currentConfig = config;
  getInspectionState().configured = true;

  let metaConfigured = false;
  let capturesSourceLocation = false;
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
    if (cfg.captureSourceLocation !== undefined) {
      if (typeof cfg.captureSourceLocation !== "boolean") {
        throw new ConfigError(
          "Logger captureSourceLocation must be a boolean.",
        );
      }
      logger.sourceLocationCapture = cfg.captureSourceLocation;
      if (cfg.captureSourceLocation) capturesSourceLocation = true;
    }
    for (const filterId of cfg.filters ?? []) {
      const filter = config.filters?.[filterId];
      if (filter === undefined) {
        throw new ConfigError(`Filter not found: ${filterId}.`);
      }
      logger.filters.push(toFilter(filter));
    }
    getInspectionState().loggers.set(logger, {
      sinks: [...logger.sinks],
      sinkIds: [...(cfg.sinks ?? [])],
      filters: [...logger.filters],
      filterIds: [...(cfg.filters ?? [])],
    });
    strongRefs.add(logger);
  }

  LoggerImpl.getLogger().contextLocalStorage = config.contextLocalStorage;
  getSourceLocationRoot().setGlobalSourceLocationCapture?.(
    capturesSourceLocation,
  );

  for (const sink of Object.values<Sink>(config.sinks)) {
    installedSinks.add(sink);
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
  await runGlobalConfigMutation("reset()", async () => {
    await disposeInternal();
    resetInternal();
  });
}

/**
 * Reset the configuration.  Mostly for testing purposes. Will not clear async
 * sinks, only use with sync sinks. Use {@link reset} if you have async sinks.
 * @since 0.9.0
 */
export function resetSync(): void {
  runGlobalConfigMutationSync("resetSync()", () => {
    disposeSyncInternal();
    resetInternal();
  });
}

function resetInternal(): void {
  unregisterDisposeHook?.();
  unregisterDisposeHook = undefined;
  const rootLogger = LoggerImpl.getLogger([]);
  rootLogger.resetDescendants();
  getSourceLocationRoot().setGlobalSourceLocationCapture?.(false);
  delete rootLogger.contextLocalStorage;
  strongRefs.clear();
  installedSinks.clear();
  const inspectionState = getInspectionState();
  inspectionState.configured = false;
  inspectionState.loggers = new WeakMap();
  currentConfig = null;
}

/**
 * Checks whether the process-global configuration is in effect.  Unlike
 * {@link getConfig}, it also reflects configuring and resetting through
 * another copy of LogTape in the same process.
 */
export function isConfigured(): boolean {
  return getInspectionState().configured;
}

/**
 * The sink and filter identifiers of a logger configured by
 * {@link configure}.  Each list is `undefined` when the logger's sinks or
 * filters no longer match what the configuration attached, e.g., because
 * they were modified directly.
 */
export interface ConfiguredLoggerIds {
  readonly sinkIds: readonly string[] | undefined;
  readonly filterIds: readonly string[] | undefined;
}

/**
 * Gets the sink and filter identifiers that the process-global configuration
 * attached to the given logger.
 * @param logger The logger to look up.
 * @returns The identifiers, or `undefined` if the logger is not configured.
 */
export function getConfiguredLoggerIds(
  logger: LoggerImpl,
): ConfiguredLoggerIds | undefined {
  const configured = getInspectionState().loggers.get(logger);
  if (configured == null) return undefined;
  return {
    sinkIds: isSameList(logger.sinks, configured.sinks)
      ? configured.sinkIds
      : undefined,
    filterIds: isSameList(logger.filters, configured.filters)
      ? configured.filterIds
      : undefined,
  };
}

function isSameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Dispose of the disposables.
 */
export async function dispose(): Promise<void> {
  await runGlobalConfigMutation("dispose()", disposeInternal);
}

async function disposeInternal(): Promise<void> {
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
 * Waits for the pending output of every {@link Drainable} sink in the active
 * configuration without disposing of the sinks, so that they keep accepting
 * records afterwards.  Sinks that are not drainable are skipped.
 *
 * The active configuration is the innermost scoped configuration when called
 * within a {@link withConfig} or {@link withConfigSync} callback, and
 * otherwise the configuration set by {@link configure} or
 * {@link configureSync}.  A sink registered under multiple identifiers is
 * drained once.  Each sink's {@link Drainable.drain} method is called before
 * this function returns, so records logged after this call are not waited
 * for.
 *
 * Unlike `FingersCrossedSink.flush()`, draining does not release records
 * that a fingers crossed sink buffers until a trigger.
 *
 * @example Wait for logs after responding in Cloudflare Workers
 * ```typescript
 * export default {
 *   async fetch(request, env, ctx) {
 *     // ...
 *     ctx.waitUntil(drain());
 *     return new Response("...");
 *   },
 * };
 * ```
 *
 * @returns A promise that resolves when every drained sink has settled its
 *          pending output.  If a sink fails to drain, the promise rejects with
 *          its error after the other sinks have settled, or with an
 *          {@link AggregateError} if multiple sinks fail.  It also rejects with
 *          a {@link ConfigError} if LogTape is being reconfigured.
 * @since 2.4.0
 */
export function drain(): Promise<void> {
  if (globalConfigMutationInProgress) {
    return Promise.reject(
      new ConfigError(
        "drain() cannot be called while LogTape is being reconfigured.",
      ),
    );
  }
  const scopedConfig = getCurrentScopedConfig(
    LoggerImpl.getLogger().contextLocalStorage,
  );
  const sinks = [...(scopedConfig?.sinks ?? installedSinks)];
  const promises: PromiseLike<void>[] = [];
  for (const sink of sinks) {
    try {
      // Read the method once, inside the try, since it may be a getter
      const method = (sink as Sink & Partial<Drainable>).drain;
      if (typeof method !== "function") continue;
      promises.push(Promise.resolve(method.call(sink)));
    } catch (error) {
      promises.push(Promise.reject(error));
    }
  }
  return settleDrainPromises(promises);
}

async function settleDrainPromises(
  promises: readonly PromiseLike<void>[],
): Promise<void> {
  const results = await Promise.allSettled(promises);
  const errors = results
    .filter((result): result is PromiseRejectedResult =>
      result.status === "rejected"
    )
    .map((result) => result.reason);
  if (errors.length < 1) return;
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(
    errors,
    "Multiple errors occurred while draining LogTape sinks.",
  );
}

/**
 * Dispose of the sync disposables. Async disposables will be untouched,
 * use {@link dispose} if you have async sinks.
 * @since 0.9.0
 */
export function disposeSync(): void {
  runGlobalConfigMutationSync("disposeSync()", disposeSyncInternal);
}

function disposeSyncInternal(): void {
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

function getConfiguredContextLocalStorage(
  functionName: string,
): ContextLocalStorage<Record<string, unknown>> {
  if (globalConfigMutationInProgress) {
    throw new ConfigError(
      `${functionName} cannot be called while LogTape is being reconfigured.`,
    );
  }
  if (currentConfig == null) {
    throw new ConfigError(
      `${functionName} requires LogTape to be configured first.`,
    );
  }
  const contextLocalStorage = LoggerImpl.getLogger().contextLocalStorage;
  if (contextLocalStorage == null) {
    throw new ConfigError(
      `${functionName} requires Config.contextLocalStorage to be configured.`,
    );
  }
  return contextLocalStorage;
}

async function runGlobalConfigMutation<T>(
  functionName: string,
  callback: () => Promise<T>,
): Promise<T> {
  assertCanMutateGlobalConfig(functionName);
  globalConfigMutationInProgress = true;
  try {
    return await callback();
  } finally {
    globalConfigMutationInProgress = false;
  }
}

function runGlobalConfigMutationSync<T>(
  functionName: string,
  callback: () => T,
): T {
  assertCanMutateGlobalConfig(functionName);
  globalConfigMutationInProgress = true;
  try {
    return callback();
  } finally {
    globalConfigMutationInProgress = false;
  }
}

function assertCanMutateGlobalConfig(functionName: string): void {
  if (globalConfigMutationInProgress) {
    throw new ConfigError(
      `${functionName} cannot be called while LogTape is being reconfigured.`,
    );
  }
  assertNoScopedConfig(functionName);
}

function assertNoScopedConfig(functionName: string): void {
  if (activeScopedConfigCount > 0) {
    throw new ConfigError(
      `${functionName} cannot be called while a scoped configuration is ` +
        "active. Use nested withConfig() instead.",
    );
  }
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
    this.name = "ConfigError";
  }
}
