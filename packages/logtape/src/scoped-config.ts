import type { ContextLocalStorage } from "./context.ts";
import { type FilterLike, toFilter } from "./filter.ts";
import { compareLogLevel, type LogLevel } from "./level.ts";
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
  parent: CompiledScopedConfig | undefined;
  disposed: boolean;
  readonly syncFilters: ReadonlySet<Disposable>;
  readonly asyncFilters: ReadonlySet<AsyncDisposable>;
  readonly syncSinks: ReadonlySet<Disposable>;
  readonly asyncSinks: ReadonlySet<AsyncDisposable>;
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
  const nodes = new Map<string, CompiledScopedLogger>();
  const configuredCategories = new Set<string>();
  for (const logger of config.loggers) {
    const category = normalizeCategory(logger.category);
    const key = categoryKey(category);
    if (configuredCategories.has(key)) {
      throw createError(
        `Duplicate logger configuration for category: ${key}. ` +
          "Each category can only be configured once.",
      );
    }
    configuredCategories.add(key);

    const sinks: Sink[] = [];
    for (const sinkId of logger.sinks ?? []) {
      const sink = config.sinks[sinkId];
      if (!sink) throw createError(`Sink not found: ${sinkId}.`);
      sinks.push(sink);
    }

    const filters: ((record: LogRecord) => boolean)[] = [];
    for (const filterId of logger.filters ?? []) {
      const filter = config.filters?.[filterId];
      if (filter === undefined) {
        throw createError(`Filter not found: ${filterId}.`);
      }
      filters.push(toFilter(filter));
    }

    nodes.set(key, {
      filters,
      lowestLevel: logger.lowestLevel === undefined
        ? "trace"
        : logger.lowestLevel,
      parentSinks: logger.parentSinks ?? "inherit",
      sinks,
    });
  }

  const syncFilters = new Set<Disposable>();
  const asyncFilters = new Set<AsyncDisposable>();
  const syncSinks = new Set<Disposable>();
  const asyncSinks = new Set<AsyncDisposable>();

  for (const sink of Object.values<Sink>(config.sinks)) {
    if (Symbol.asyncDispose in sink) {
      if (!allowAsync) {
        throw createError(
          "Async disposables cannot be used with withConfigSync().",
        );
      }
      asyncSinks.add(sink as AsyncDisposable);
    }
    if (Symbol.dispose in sink) syncSinks.add(sink as Disposable);
  }

  for (const filter of Object.values<FilterLike>(config.filters ?? {})) {
    if (filter == null || typeof filter === "string") continue;
    if (Symbol.asyncDispose in filter) {
      if (!allowAsync) {
        throw createError(
          "Async disposables cannot be used with withConfigSync().",
        );
      }
      asyncFilters.add(filter as AsyncDisposable);
      asyncSinks.delete(filter as AsyncDisposable);
    }
    if (Symbol.dispose in filter) {
      syncFilters.add(filter as Disposable);
      syncSinks.delete(filter as Disposable);
    }
  }

  return {
    asyncFilters,
    asyncSinks,
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
): Promise<void> {
  scopedConfig.disposed = true;
  const errors: unknown[] = [];
  try {
    disposeSyncDisposables(scopedConfig.syncFilters);
  } catch (error) {
    errors.push(error);
  }
  try {
    await disposeAsyncDisposables(scopedConfig.asyncFilters);
  } catch (error) {
    errors.push(error);
  }
  try {
    disposeSyncDisposables(scopedConfig.syncSinks);
  } catch (error) {
    errors.push(error);
  }
  try {
    await disposeAsyncDisposables(scopedConfig.asyncSinks);
  } catch (error) {
    errors.push(error);
  }
  throwDisposeErrors(errors);
}

export function disposeScopedConfigSync(
  scopedConfig: CompiledScopedConfig,
): void {
  scopedConfig.disposed = true;
  const errors: unknown[] = [];
  try {
    disposeSyncDisposables(scopedConfig.syncFilters);
  } catch (error) {
    errors.push(error);
  }
  try {
    disposeSyncDisposables(scopedConfig.syncSinks);
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

function getActiveScopedConfig(
  scopedConfig: CompiledScopedConfig,
): CompiledScopedConfig | undefined {
  let activeConfig: CompiledScopedConfig | undefined = scopedConfig;
  while (activeConfig?.disposed) activeConfig = activeConfig.parent;
  return activeConfig;
}

function normalizeCategory(category: string | readonly string[]): string[] {
  return typeof category === "string" ? [category] : [...category];
}

function categoryKey(category: readonly string[]): string {
  return JSON.stringify(category);
}

function getScopedSinkDispatchPlan(
  scopedConfig: CompiledScopedConfig,
  category: readonly string[],
  level: LogLevel,
): ScopedSinkDispatchPlan {
  return getScopedSinkDispatchPlanForPrefix(
    scopedConfig,
    category,
    category.length,
    level,
  );
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

function disposeSyncDisposables(disposables: ReadonlySet<Disposable>): void {
  const errors: unknown[] = [];
  for (const disposable of disposables) {
    try {
      disposable[Symbol.dispose]();
    } catch (error) {
      errors.push(error);
    }
  }
  throwDisposeErrors(errors);
}

async function disposeAsyncDisposables(
  disposables: ReadonlySet<AsyncDisposable>,
): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(
      disposables,
      (disposable) =>
        Promise.resolve().then(() => disposable[Symbol.asyncDispose]()),
    ),
  );
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
