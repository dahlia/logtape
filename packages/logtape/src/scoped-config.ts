import type { ContextLocalStorage } from "./context.ts";
import { type FilterLike, toFilter } from "./filter.ts";
import { compareLogLevel, isLogLevel, type LogLevel } from "./level.ts";
import type { LogRecord } from "./record.ts";
import type { Sink } from "./sink.ts";

export type ScopedConfigSymbol = typeof scopedConfigSymbol;

export const scopedConfigSymbol: unique symbol = Symbol.for(
  "logtape.scopedConfig",
);

export interface ScopedConfigLike<
  TSinkId extends string,
  TFilterId extends string,
> {
  readonly sinks: Record<TSinkId, Sink>;
  readonly filters?: Record<TFilterId, FilterLike>;
  readonly loggers: readonly ScopedLoggerConfigLike<TSinkId, TFilterId>[];
}

export interface ScopedLoggerConfigLike<
  TSinkId extends string,
  TFilterId extends string,
> {
  readonly category: string | readonly string[];
  readonly sinks?: readonly TSinkId[];
  readonly parentSinks?: "inherit" | "override";
  readonly filters?: readonly TFilterId[];
  readonly lowestLevel?: LogLevel | null;
}

export interface CompiledScopedConfig {
  readonly nodes: ReadonlyMap<string, CompiledScopedLogger>;
  readonly dispatchCache: Map<string, ScopedSinkDispatchPlan>;
  parent: CompiledScopedConfig | undefined;
  disposed: boolean;
  readonly syncFilters: Set<Disposable>;
  readonly asyncFilters: Set<AsyncDisposable>;
  readonly syncSinks: Set<Disposable>;
  readonly asyncSinks: Set<AsyncDisposable>;
}

interface CompiledScopedLogger {
  readonly filters: readonly ((record: LogRecord) => boolean)[];
  readonly lowestLevel: LogLevel | null;
  readonly parentSinks: "inherit" | "override";
  readonly sinks: readonly Sink[];
}

type ScopedSinkDispatchPlan =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly sink: Sink }
  | { readonly kind: "many"; readonly sinks: readonly Sink[] };

const defaultScopedLogger: CompiledScopedLogger = {
  filters: [],
  lowestLevel: "trace",
  parentSinks: "inherit",
  sinks: [],
};

export function compileScopedConfig<
  TSinkId extends string,
  TFilterId extends string,
>(
  config: ScopedConfigLike<TSinkId, TFilterId>,
  allowAsync: boolean,
  createError: (message: string) => Error,
): CompiledScopedConfig {
  if (!isObjectLike(config)) {
    throw createError("Configuration must be an object.");
  }
  if (!isObjectLike(config.sinks)) {
    throw createError("Configuration must include a sinks object.");
  }
  if (!Array.isArray(config.loggers)) {
    throw createError("Configuration must include a loggers array.");
  }
  if (config.filters !== undefined && !isObjectLike(config.filters)) {
    throw createError("Configuration filters must be an object.");
  }

  const nodes = new Map<string, CompiledScopedLogger>();
  const configuredCategories = new Set<string>();
  for (const logger of config.loggers) {
    if (!isObjectLike(logger)) {
      throw createError("Logger configuration must be an object.");
    }
    const loggerConfig = logger as ScopedLoggerConfigLike<TSinkId, TFilterId>;
    const category = normalizeCategory(loggerConfig.category, createError);
    if (
      loggerConfig.sinks !== undefined && !Array.isArray(loggerConfig.sinks)
    ) {
      throw createError("Logger sinks must be an array.");
    }
    if (
      loggerConfig.filters !== undefined &&
      !Array.isArray(loggerConfig.filters)
    ) {
      throw createError("Logger filters must be an array.");
    }
    if (
      loggerConfig.parentSinks !== undefined &&
      loggerConfig.parentSinks !== "inherit" &&
      loggerConfig.parentSinks !== "override"
    ) {
      throw createError(
        'Logger parentSinks must be "inherit" or "override".',
      );
    }
    if (
      loggerConfig.lowestLevel !== undefined &&
      loggerConfig.lowestLevel !== null &&
      !isLogLevel(loggerConfig.lowestLevel)
    ) {
      throw createError("Logger lowestLevel must be a log level or null.");
    }
    const key = categoryKey(category);
    if (configuredCategories.has(key)) {
      throw createError(
        `Duplicate logger configuration for category: ${key}. ` +
          "Each category can only be configured once.",
      );
    }
    configuredCategories.add(key);

    const sinks: Sink[] = [];
    const sinkIds: readonly TSinkId[] = loggerConfig.sinks ?? [];
    for (const sinkId of sinkIds) {
      const sink = config.sinks[sinkId];
      if (!sink) throw createError(`Sink not found: ${sinkId}.`);
      if (typeof sink !== "function") {
        throw createError(`Sink must be a function: ${sinkId}.`);
      }
      sinks.push(sink);
    }

    const filters: ((record: LogRecord) => boolean)[] = [];
    const filterIds: readonly TFilterId[] = loggerConfig.filters ?? [];
    for (const filterId of filterIds) {
      const filter = config.filters?.[filterId];
      if (filter === undefined) {
        throw createError(`Filter not found: ${filterId}.`);
      }
      if (!isFilterLike(filter)) {
        throw createError(
          `Filter must be a function, log level, or null: ${filterId}.`,
        );
      }
      filters.push(toFilter(filter));
    }

    nodes.set(key, {
      filters,
      lowestLevel: loggerConfig.lowestLevel === undefined
        ? "trace"
        : loggerConfig.lowestLevel,
      parentSinks: loggerConfig.parentSinks ?? "inherit",
      sinks,
    });
  }

  const syncFilters = new Set<Disposable>();
  const asyncFilters = new Set<AsyncDisposable>();
  const syncSinks = new Set<Disposable>();
  const asyncSinks = new Set<AsyncDisposable>();

  for (const sink of Object.values<Sink>(config.sinks)) {
    if (!isObjectLike(sink)) continue;
    if (Symbol.asyncDispose in sink) {
      if (!allowAsync) {
        throw createError(
          "Async disposables cannot be used with withConfigSync().",
        );
      }
      asyncSinks.add(sink as AsyncDisposable);
    } else if (Symbol.dispose in sink) syncSinks.add(sink as Disposable);
  }

  for (const filter of Object.values<FilterLike>(config.filters ?? {})) {
    if (!isObjectLike(filter)) continue;
    if (Symbol.asyncDispose in filter) {
      if (!allowAsync) {
        throw createError(
          "Async disposables cannot be used with withConfigSync().",
        );
      }
      asyncFilters.add(filter as AsyncDisposable);
      asyncSinks.delete(filter as AsyncDisposable);
    } else if (Symbol.dispose in filter) {
      syncFilters.add(filter as Disposable);
      syncSinks.delete(filter as Disposable);
    }
  }

  return {
    asyncFilters,
    asyncSinks,
    dispatchCache: new Map(),
    disposed: false,
    nodes,
    parent: undefined,
    syncFilters,
    syncSinks,
  };
}

export function getCurrentScopedConfig(
  contextLocalStorage:
    | ContextLocalStorage<Record<string, unknown>>
    | undefined,
): CompiledScopedConfig | undefined {
  const store = contextLocalStorage?.getStore();
  const scopedConfig = (store as Record<ScopedConfigSymbol, unknown> | null)
    ?.[scopedConfigSymbol];
  return isCompiledScopedConfig(scopedConfig)
    ? getActiveScopedConfig(scopedConfig)
    : undefined;
}

export function runWithScopedConfig<R>(
  contextLocalStorage: ContextLocalStorage<Record<string, unknown>>,
  scopedConfig: CompiledScopedConfig,
  callback: () => R,
): R {
  const parentStore = contextLocalStorage.getStore() ?? {};
  scopedConfig.parent = getCurrentScopedConfig(contextLocalStorage);
  return contextLocalStorage.run({
    ...parentStore,
    [scopedConfigSymbol]: scopedConfig,
  } as Record<string, unknown>, callback);
}

export function scopedConfigHasSink(
  scopedConfig: CompiledScopedConfig,
  category: readonly string[],
  level: LogLevel,
): boolean {
  return getScopedSinkDispatchPlan(scopedConfig, category, level).kind !==
    "none";
}

export function emitWithScopedConfig(
  scopedConfig: CompiledScopedConfig,
  record: LogRecord,
  bypassSinks: Set<Sink> | undefined,
  emitToSink: (sink: Sink, bypassSinks: Set<Sink> | undefined) => void,
): void {
  const plan = getScopedSinkDispatchPlan(
    scopedConfig,
    record.category,
    record.level,
  );
  if (plan.kind === "none") return;
  if (!filterScopedRecord(scopedConfig, record.category, record)) return;
  if (plan.kind === "one") {
    if (!bypassSinks?.has(plan.sink)) emitToSink(plan.sink, bypassSinks);
    return;
  }
  for (const sink of plan.sinks) {
    if (bypassSinks?.has(sink)) continue;
    emitToSink(sink, bypassSinks);
  }
}

export async function disposeScopedConfig(
  scopedConfig: CompiledScopedConfig,
  retainedDisposables?: ReadonlySet<Disposable | AsyncDisposable>,
): Promise<void> {
  const parentDisposables = getParentScopedDisposables(
    scopedConfig,
    retainedDisposables,
  );
  scopedConfig.disposed = true;
  const errors: unknown[] = [];
  try {
    disposeSyncDisposables(scopedConfig.syncFilters, parentDisposables);
  } catch (error) {
    errors.push(error);
  }
  try {
    await disposeAsyncDisposables(scopedConfig.asyncFilters, parentDisposables);
  } catch (error) {
    errors.push(error);
  }
  try {
    disposeSyncDisposables(scopedConfig.syncSinks, parentDisposables);
  } catch (error) {
    errors.push(error);
  }
  try {
    await disposeAsyncDisposables(scopedConfig.asyncSinks, parentDisposables);
  } catch (error) {
    errors.push(error);
  }
  throwDisposeErrors(errors);
}

export function disposeScopedConfigSync(
  scopedConfig: CompiledScopedConfig,
  retainedDisposables?: ReadonlySet<Disposable | AsyncDisposable>,
): void {
  const parentDisposables = getParentScopedDisposables(
    scopedConfig,
    retainedDisposables,
  );
  scopedConfig.disposed = true;
  const errors: unknown[] = [];
  try {
    disposeSyncDisposables(scopedConfig.syncFilters, parentDisposables);
  } catch (error) {
    errors.push(error);
  }
  try {
    disposeSyncDisposables(scopedConfig.syncSinks, parentDisposables);
  } catch (error) {
    errors.push(error);
  }
  throwDisposeErrors(errors);
}

export function throwCombinedErrors(
  primary: unknown,
  secondary: unknown,
): never {
  throw new AggregateError(
    flattenErrors(primary, secondary),
    "Multiple errors occurred while running LogTape scoped configuration.",
  );
}

function isCompiledScopedConfig(value: unknown): value is CompiledScopedConfig {
  return value != null && typeof value === "object" && "nodes" in value;
}

function isObjectLike(
  value: unknown,
): value is object | ((...args: never[]) => unknown) {
  return value != null &&
    (typeof value === "object" || typeof value === "function");
}

function isFilterLike(value: unknown): value is FilterLike {
  return value == null || typeof value === "function" ||
    (typeof value === "string" && isLogLevel(value));
}

function getActiveScopedConfig(
  scopedConfig: CompiledScopedConfig,
): CompiledScopedConfig | undefined {
  let activeConfig: CompiledScopedConfig | undefined = scopedConfig;
  while (activeConfig?.disposed) activeConfig = activeConfig.parent;
  return activeConfig;
}

function getParentScopedDisposables(
  scopedConfig: CompiledScopedConfig,
  extraRetained?: ReadonlySet<Disposable | AsyncDisposable>,
): ReadonlySet<Disposable | AsyncDisposable> {
  const disposables = new Set<Disposable | AsyncDisposable>(extraRetained);
  let parent = scopedConfig.parent;
  while (parent != null) {
    const activeParent = getActiveScopedConfig(parent);
    if (activeParent == null) break;
    addScopedDisposables(disposables, activeParent);
    parent = activeParent.parent;
  }
  return disposables;
}

function addScopedDisposables(
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

function normalizeCategory(
  category: unknown,
  createError: (message: string) => Error,
): string[] {
  if (typeof category === "string") return [category];
  if (!Array.isArray(category)) {
    throw createError("Logger category must be a string or array of strings.");
  }
  if (category.some((part) => typeof part !== "string")) {
    throw createError("Logger category must only contain strings.");
  }
  return [...category];
}

function categoryKey(category: readonly string[]): string {
  return JSON.stringify(category);
}

function getScopedSinkDispatchPlan(
  scopedConfig: CompiledScopedConfig,
  category: readonly string[],
  level: LogLevel,
): ScopedSinkDispatchPlan {
  const cacheKey = `${categoryKey(category)}:${level}`;
  let plan = scopedConfig.dispatchCache.get(cacheKey);
  if (plan == null) {
    plan = getScopedSinkDispatchPlanForPrefix(
      scopedConfig,
      category,
      category.length,
      level,
    );
    scopedConfig.dispatchCache.set(cacheKey, plan);
  }
  return plan;
}

function getScopedSinkDispatchPlanForPrefix(
  scopedConfig: CompiledScopedConfig,
  category: readonly string[],
  length: number,
  level: LogLevel,
): ScopedSinkDispatchPlan {
  const prefix = category.slice(0, length);
  const logger = scopedConfig.nodes.get(categoryKey(prefix)) ??
    defaultScopedLogger;
  if (
    logger.lowestLevel === null ||
    compareLogLevel(level, logger.lowestLevel) < 0
  ) {
    return { kind: "none" };
  }

  const parentPlan = length > 0 && logger.parentSinks === "inherit"
    ? getScopedSinkDispatchPlanForPrefix(
      scopedConfig,
      category,
      length - 1,
      level,
    )
    : { kind: "none" } as const;

  let firstSink: Sink | undefined;
  let sinks: Sink[] | undefined;
  const appendSink = (sink: Sink): void => {
    if (sinks != null) {
      sinks.push(sink);
    } else if (firstSink == null) {
      firstSink = sink;
    } else {
      sinks = [firstSink, sink];
    }
  };

  if (parentPlan.kind === "one") appendSink(parentPlan.sink);
  else if (parentPlan.kind === "many") {
    for (const sink of parentPlan.sinks) appendSink(sink);
  }
  for (const sink of logger.sinks) appendSink(sink);

  if (sinks != null) return { kind: "many", sinks };
  if (firstSink != null) return { kind: "one", sink: firstSink };
  return { kind: "none" };
}

function filterScopedRecord(
  scopedConfig: CompiledScopedConfig,
  category: readonly string[],
  record: LogRecord,
): boolean {
  for (let length = category.length; length >= 0; length--) {
    const logger = scopedConfig.nodes.get(
      categoryKey(category.slice(0, length)),
    );
    if (logger == null || logger.filters.length < 1) continue;
    return logger.filters.every((filter) => filter(record));
  }
  return true;
}

function disposeSyncDisposables(
  disposables: Set<Disposable>,
  retainedDisposables: ReadonlySet<Disposable | AsyncDisposable>,
): void {
  const disposableList = filterRetainedDisposables(
    disposables,
    retainedDisposables,
  );
  const errors: unknown[] = [];
  try {
    for (const disposable of disposableList) {
      try {
        disposable[Symbol.dispose]();
      } catch (error) {
        errors.push(error);
      }
    }
  } finally {
    disposables.clear();
  }
  throwDisposeErrors(errors);
}

async function disposeAsyncDisposables(
  disposables: Set<AsyncDisposable>,
  retainedDisposables: ReadonlySet<Disposable | AsyncDisposable>,
): Promise<void> {
  const disposableList = filterRetainedDisposables(
    disposables,
    retainedDisposables,
  );
  for (const disposable of disposableList) disposables.delete(disposable);
  try {
    const results = await Promise.allSettled(
      disposableList.map((disposable) =>
        Promise.resolve().then(() => disposable[Symbol.asyncDispose]())
      ),
    );
    throwDisposeErrors(
      results
        .filter((result): result is PromiseRejectedResult =>
          result.status === "rejected"
        )
        .map((result) => result.reason),
    );
  } finally {
    disposables.clear();
  }
}

function filterRetainedDisposables<
  TDisposable extends Disposable | AsyncDisposable,
>(
  disposables: ReadonlySet<TDisposable>,
  retainedDisposables: ReadonlySet<Disposable | AsyncDisposable>,
): TDisposable[] {
  return Array.from(
    disposables,
  ).filter((disposable) => !retainedDisposables.has(disposable));
}

function throwDisposeErrors(errors: readonly unknown[]): void {
  if (errors.length < 1) return;
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(
    errors,
    "Multiple errors occurred while disposing LogTape scoped resources.",
  );
}

function flattenErrors(...errors: readonly unknown[]): unknown[] {
  const flattened: unknown[] = [];
  for (const error of errors) {
    if (error instanceof AggregateError) flattened.push(...error.errors);
    else flattened.push(error);
  }
  return flattened;
}
