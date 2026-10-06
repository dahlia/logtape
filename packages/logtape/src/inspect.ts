import { getConfiguredLoggerIds, isConfigured } from "./config.ts";
import { getCategoryPrefix } from "./context.ts";
import { type Filter, getFilterLevel } from "./filter.ts";
import { compareLogLevel, isLogLevel, type LogLevel } from "./level.ts";
import {
  findLogger,
  isMetaLoggerCategory,
  type Logger,
  LoggerImpl,
} from "./logger.ts";
import {
  type CompiledScopedLogger,
  getCurrentScopedConfig,
  getScopedLogger,
} from "./scoped-config.ts";
import type { Sink } from "./sink.ts";

/**
 * Options for {@link inspectLogger}.
 * @since 2.4.0
 */
export interface InspectLoggerOptions {
  /**
   * The level of the records to evaluate the statuses for.  If omitted,
   * each status tells whether records of some level can be delivered.
   */
  readonly level?: LogLevel;
}

/**
 * Whether records can be delivered, as far as the configuration alone can
 * tell:
 *
 * - `"enabled"`: records are delivered without consulting any custom filter.
 * - `"conditional"`: records are delivered only if the custom filters
 *   accept them, which cannot be known before they are logged.
 * - `"disabled"`: records are never delivered, because a level gate or
 *   a level filter rejects them.
 *
 * Sinks are opaque: a sink that filters records by itself, such as one
 * made by `withFilter()` or `fingersCrossed()`, may still drop records
 * that are reported as delivered.
 * @since 2.4.0
 */
export type LoggerInspectionStatus = "enabled" | "conditional" | "disabled";

/**
 * A report on how the configuration in effect routes the records of
 * a logger, made by {@link inspectLogger}.
 *
 * Every object and array in the report is created anew for each call, so
 * modifying them does not affect LogTape.  Sinks and filters in the report
 * are the configured functions themselves.
 * @since 2.4.0
 */
export interface LoggerInspection {
  /**
   * Which configuration the report reflects:
   *
   * - `"scoped"`: the innermost scoped configuration active in the current
   *   execution context, set by `withConfig()` or `withConfigSync()`.
   *   It replaces the process-global configuration entirely.
   * - `"global"`: the process-global configuration, set by `configure()`
   *   or `configureSync()`.
   * - `"unconfigured"`: neither; records are not delivered anywhere unless
   *   loggers were modified directly.
   *
   * If another copy of LogTape older than 2.4.0 is loaded in the same
   * process, configuring or resetting through that copy is not reflected
   * here, nor in {@link LoggerNodeInspection.configured}.
   */
  readonly source: "scoped" | "global" | "unconfigured";

  /**
   * The category of the inspected logger.
   */
  readonly category: readonly string[];

  /**
   * The category prefix active in the current execution context, set by
   * `withCategoryPrefix()`.  It is empty if there is none.  The prefix does
   * not apply to the meta logger and its descendants; compare
   * {@link LoggerInspection.effectiveCategory} to see whether it applied.
   */
  readonly categoryPrefix: readonly string[];

  /**
   * The category that records of the inspected logger are dispatched under,
   * i.e., {@link LoggerInspection.category} with the category prefix
   * prepended if it applies.
   */
  readonly effectiveCategory: readonly string[];

  /**
   * The level that the statuses were evaluated for, if
   * {@link InspectLoggerOptions.level} was given.
   */
  readonly level?: LogLevel;

  /**
   * The logger for each category from the root category to
   * {@link LoggerInspection.effectiveCategory}, root first.
   */
  readonly loggers: readonly LoggerNodeInspection[];

  /**
   * The filters selected for records of the inspected logger.
   */
  readonly filters: FilterSetInspection;

  /**
   * The nearest category, from {@link LoggerInspection.effectiveCategory}
   * toward the root, beyond which no sinks are inherited.
   */
  readonly inheritanceBoundary: InheritanceBoundaryInspection;

  /**
   * Every way a record can reach a sink, in the order the sinks are called.
   * A sink appears once per path, so a sink that would receive the same
   * record more than once appears more than once.  Paths that are disabled
   * are included too, so that it is visible which gate disables them.
   */
  readonly sinkPaths: readonly SinkPathInspection[];

  /**
   * The status of the logger as a whole: `"enabled"` if any sink path is
   * enabled, otherwise `"conditional"` if any sink path is conditional,
   * otherwise `"disabled"` (including when there are no sink paths).
   */
  readonly status: LoggerInspectionStatus;
}

/**
 * The settings of the logger for one category, as part of
 * a {@link LoggerInspection}.
 * @since 2.4.0
 */
export interface LoggerNodeInspection {
  /**
   * The category of the logger.
   */
  readonly category: readonly string[];

  /**
   * Whether the category is configured explicitly.  An unconfigured category
   * normally accepts every level, inherits its parent's sinks, and has no
   * sinks or filters of its own.  The exceptions are the meta logger, to
   * which `configure()` adds a console sink unless the meta logger is
   * configured, and loggers modified directly.
   */
  readonly configured: boolean;

  /**
   * The lowest level the logger accepts, or `null` if it rejects every
   * record.
   */
  readonly lowestLevel: LogLevel | null;

  /**
   * How the logger combines its sinks with its ancestors' sinks.
   */
  readonly parentSinks: "inherit" | "override" | "forward";

  /**
   * The identifiers of the logger's own sinks, in order.  An identifier is
   * `undefined` if the sink was not attached by a configuration, e.g., the
   * console sink that `configure()` adds to the meta logger, or if the
   * logger's sinks were modified directly after configuration.
   */
  readonly sinkIds: readonly (string | undefined)[];

  /**
   * The identifiers of the logger's own filters, in order.  An identifier is
   * `undefined` if the filter was not attached by a configuration, or if the
   * logger's filters were modified directly after configuration.
   */
  readonly filterIds: readonly (string | undefined)[];
}

/**
 * Where sink inheritance stops, as part of a {@link LoggerInspection}.
 *
 * This is a structural boundary: sinks beyond it are never inherited.
 * Sinks inside it may still be unreachable because of level gates.
 * @since 2.4.0
 */
export interface InheritanceBoundaryInspection {
  /**
   * The category of the logger at the boundary.  Its own sinks are still
   * inherited, but none of its ancestors' sinks.
   */
  readonly category: readonly string[];

  /**
   * Why the inheritance stops there: `"override"` if the logger is
   * configured with `parentSinks: "override"`, or `"root"` if it is the
   * root logger.
   */
  readonly reason: "override" | "root";
}

/**
 * A `lowestLevel` threshold that a record must meet to reach a sink.
 * @since 2.4.0
 */
export interface LevelGateInspection {
  /**
   * The category of the logger that supplies the gate.
   */
  readonly category: readonly string[];

  /**
   * The lowest level the gate lets through, or `null` if it rejects every
   * record.
   */
  readonly lowestLevel: LogLevel | null;
}

/**
 * One way a record can reach a sink, as part of a {@link LoggerInspection}.
 * @since 2.4.0
 */
export interface SinkPathInspection {
  /**
   * The identifier of the sink in the configuration, or `undefined` if it is
   * unknown.  See {@link LoggerNodeInspection.sinkIds}.
   */
  readonly id: string | undefined;

  /**
   * The sink.
   */
  readonly sink: Sink;

  /**
   * The category of the logger that has the sink as its own.
   */
  readonly category: readonly string[];

  /**
   * The level gates that constrain this path, ordered from the effective
   * category toward its ancestors.  They are the `lowestLevel` thresholds of
   * the loggers from the effective category up to the logger that has the
   * sink, or up to the logger that forwards it with
   * `parentSinks: "forward"`; the thresholds of the ancestors a sink is
   * forwarded from do not apply.  Unconfigured categories contribute gates
   * that accept every level.
   */
  readonly gates: readonly LevelGateInspection[];

  /**
   * The lowest level that can reach the sink through this path, combining
   * {@link SinkPathInspection.gates} and the level filters in
   * {@link LoggerInspection.filters}, or `null` if no level can.
   */
  readonly lowestLevel: LogLevel | null;

  /**
   * Whether records can reach the sink through this path.
   */
  readonly status: LoggerInspectionStatus;
}

/**
 * The filters selected for records of a logger, as part of
 * a {@link LoggerInspection}.
 *
 * A logger uses its own filters if it has any, and otherwise the filters of
 * its nearest ancestor that has any.  Every selected filter must accept
 * a record for the record to reach any sink.  The selected filters are not
 * necessarily invoked for every record, e.g., when a level gate rejects the
 * record first.
 * @since 2.4.0
 */
export interface FilterSetInspection {
  /**
   * The category of the logger that supplies the filters (an empty array for
   * the root logger), or `null` if no filters are selected.
   */
  readonly category: readonly string[] | null;

  /**
   * The selected filters, in order.
   */
  readonly filters: readonly FilterInspection[];
}

/**
 * A filter selected for records of a logger, as part of
 * a {@link LoggerInspection}.
 * @since 2.4.0
 */
export interface FilterInspection {
  /**
   * The identifier of the filter in the configuration, or `undefined` if it
   * is unknown.  See {@link LoggerNodeInspection.filterIds}.
   */
  readonly id: string | undefined;

  /**
   * The filter.  It is never invoked by {@link inspectLogger}.
   */
  readonly filter: Filter;

  /**
   * If the filter is a level filter, i.e., a log level or `null` in the
   * configuration or a filter made by `getLevelFilter()`, the lowest level
   * it accepts, or `null` if it rejects every record.  The property is absent
   * for any other filter, whose outcome is only known at logging time.
   */
  readonly lowestLevel?: LogLevel | null;
}

type ParentSinksMode = "inherit" | "override" | "forward";

interface LoggerNode {
  readonly category: readonly string[];
  readonly configured: boolean;
  readonly lowestLevel: LogLevel | null;
  readonly parentSinks: ParentSinksMode;
  readonly sinks: readonly Sink[];
  readonly sinkIds: readonly (string | undefined)[];
  readonly filters: readonly Filter[];
  readonly filterIds: readonly (string | undefined)[];
}

interface SinkPath {
  readonly node: LoggerNode;
  readonly index: number;
  readonly gates: readonly LoggerNode[];
}

/**
 * Explains how the configuration in effect in the current execution context
 * routes the records of a logger: which configuration applies, the category
 * the records are dispatched under, the level gates and sink paths with
 * the categories that supply them, the selected filters, and where sink
 * inheritance stops.
 *
 * The inspection has no side effects.  It does not log anything, invoke any
 * sink or filter, evaluate lazy properties, create loggers, or dispose
 * anything.  Therefore it cannot tell whether a custom filter will accept
 * a record; it reports such paths as `"conditional"` instead.
 *
 * ```typescript
 * const report = inspectLogger(["my-app", "db"], { level: "debug" });
 * for (const path of report.sinkPaths) {
 *   console.log(path.id, path.category, path.status);
 * }
 * ```
 *
 * The report reflects the configuration at the time of the call; it is not
 * updated afterwards, and it may be inconsistent if the configuration is
 * changed concurrently.
 *
 * @param logger The logger to inspect, or its category as a string or array
 *               of strings.  Defaults to the root logger.
 * @param options The options.
 * @returns The report.
 * @throws {TypeError} If the category or the level is invalid.
 * @since 2.4.0
 */
export function inspectLogger(
  logger?: Logger | string | readonly string[],
  options: InspectLoggerOptions = {},
): LoggerInspection {
  const category = normalizeCategory(logger);
  const level = options.level;
  if (level !== undefined && !isLogLevel(level)) {
    throw new TypeError(`Invalid log level: ${String(level)}.`);
  }
  const categoryPrefix = [...getCategoryPrefix()];
  const effectiveCategory = isMetaLoggerCategory(category)
    ? category
    : [...categoryPrefix, ...category];

  const scopedConfig = getCurrentScopedConfig(
    LoggerImpl.getLogger().contextLocalStorage,
  );
  const nodes: LoggerNode[] = [];
  for (let length = 0; length <= effectiveCategory.length; length++) {
    const nodeCategory = effectiveCategory.slice(0, length);
    nodes.push(
      scopedConfig == null ? getGlobalNode(nodeCategory) : getScopedNode(
        getScopedLogger(scopedConfig, nodeCategory),
        nodeCategory,
      ),
    );
  }

  // The nearest logger, from the effective category toward the root, that
  // has filters supplies them:
  let filterNode: LoggerNode | undefined;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].filters.length > 0) {
      filterNode = nodes[i];
      break;
    }
  }
  const filters: FilterInspection[] = filterNode == null
    ? []
    : filterNode.filters.map((filter, i) => {
      const filterLevel = getFilterLevel(filter);
      return filterLevel === undefined
        ? { id: filterNode.filterIds[i], filter }
        : { id: filterNode.filterIds[i], filter, lowestLevel: filterLevel };
    });
  const hasCustomFilters = filters.some((f) => !("lowestLevel" in f));
  const filterLevels = filters
    .filter((f) => "lowestLevel" in f)
    .map((f) => f.lowestLevel as LogLevel | null);

  const sinkPaths = collectSinkPaths(nodes, nodes.length - 1, []).map(
    (path): SinkPathInspection => {
      const lowestLevel = getHighestLevel([
        ...path.gates.map((gate) => gate.lowestLevel),
        ...filterLevels,
      ]);
      return {
        id: path.node.sinkIds[path.index],
        sink: path.node.sinks[path.index],
        category: [...path.node.category],
        gates: path.gates.map((gate) => ({
          category: [...gate.category],
          lowestLevel: gate.lowestLevel,
        })),
        lowestLevel,
        status: lowestLevel === null ||
            level !== undefined && compareLogLevel(level, lowestLevel) < 0
          ? "disabled"
          : hasCustomFilters
          ? "conditional"
          : "enabled",
      };
    },
  );

  const inspection: LoggerInspection = {
    source: scopedConfig != null
      ? "scoped"
      : isConfigured()
      ? "global"
      : "unconfigured",
    category: [...category],
    categoryPrefix,
    effectiveCategory: [...effectiveCategory],
    loggers: nodes.map((node) => ({
      category: [...node.category],
      configured: node.configured,
      lowestLevel: node.lowestLevel,
      parentSinks: node.parentSinks,
      sinkIds: [...node.sinkIds],
      filterIds: [...node.filterIds],
    })),
    filters: {
      category: filterNode == null ? null : [...filterNode.category],
      filters,
    },
    inheritanceBoundary: getInheritanceBoundary(nodes),
    sinkPaths,
    status: sinkPaths.some((path) => path.status === "enabled")
      ? "enabled"
      : sinkPaths.some((path) => path.status === "conditional")
      ? "conditional"
      : "disabled",
  };
  return level === undefined ? inspection : { ...inspection, level };
}

function normalizeCategory(
  logger: Logger | string | readonly string[] | undefined,
): readonly string[] {
  const category = logger == null
    ? []
    : typeof logger === "string"
    ? [logger]
    : Array.isArray(logger)
    ? logger
    : (logger as Logger).category;
  if (
    !Array.isArray(category) ||
    category.some((part) => typeof part !== "string")
  ) {
    throw new TypeError(
      "The logger must be a Logger, a string, or an array of strings.",
    );
  }
  return [...category];
}

function getGlobalNode(category: readonly string[]): LoggerNode {
  const logger = findLogger(category);
  if (logger == null) return getDefaultNode(category);
  const ids = getConfiguredLoggerIds(logger);
  return {
    category,
    configured: ids != null,
    lowestLevel: logger.lowestLevel,
    parentSinks: logger.parentSinks,
    sinks: [...logger.sinks],
    sinkIds: ids?.sinkIds ?? logger.sinks.map(() => undefined),
    filters: [...logger.filters],
    filterIds: ids?.filterIds ?? logger.filters.map(() => undefined),
  };
}

function getScopedNode(
  logger: CompiledScopedLogger | undefined,
  category: readonly string[],
): LoggerNode {
  if (logger == null) return getDefaultNode(category);
  return {
    category,
    configured: true,
    lowestLevel: logger.lowestLevel,
    parentSinks: logger.parentSinks,
    sinks: logger.sinks,
    // Scoped configurations compiled by an older copy of LogTape in the same
    // process have no identifiers:
    sinkIds: logger.sinkIds ?? logger.sinks.map(() => undefined),
    filters: logger.filters,
    filterIds: logger.filterIds ?? logger.filters.map(() => undefined),
  };
}

function getDefaultNode(category: readonly string[]): LoggerNode {
  return {
    category,
    configured: false,
    lowestLevel: "trace",
    parentSinks: "inherit",
    sinks: [],
    sinkIds: [],
    filters: [],
    filterIds: [],
  };
}

// Mirrors LoggerImpl.createSinkDispatchPlan() and
// getScopedSinkDispatchPlanForPrefix(), except that paths rejected by a level
// gate are kept (and later reported as disabled) instead of being pruned.
function collectSinkPaths(
  nodes: readonly LoggerNode[],
  index: number,
  gates: readonly LoggerNode[],
): SinkPath[] {
  const node = nodes[index];
  const nodeGates = [...gates, node];
  const paths: SinkPath[] = [];
  if (index > 0 && node.parentSinks === "inherit") {
    paths.push(...collectSinkPaths(nodes, index - 1, nodeGates));
  } else if (index > 0 && node.parentSinks === "forward") {
    for (const path of collectForwardedSinkPaths(nodes, index - 1)) {
      paths.push({ ...path, gates: nodeGates });
    }
  }
  for (let i = 0; i < node.sinks.length; i++) {
    paths.push({ node, index: i, gates: nodeGates });
  }
  return paths;
}

// Mirrors LoggerImpl.getForwardSinkPlan() and collectScopedForwardSinks():
// ancestors' own sinks, ancestors first, regardless of their levels, up to
// and including the nearest ancestor that overrides its parent's sinks.
function collectForwardedSinkPaths(
  nodes: readonly LoggerNode[],
  index: number,
): SinkPath[] {
  const node = nodes[index];
  const paths = index > 0 && node.parentSinks !== "override"
    ? collectForwardedSinkPaths(nodes, index - 1)
    : [];
  for (let i = 0; i < node.sinks.length; i++) {
    paths.push({ node, index: i, gates: [] });
  }
  return paths;
}

function getInheritanceBoundary(
  nodes: readonly LoggerNode[],
): InheritanceBoundaryInspection {
  for (let i = nodes.length - 1; i > 0; i--) {
    if (nodes[i].parentSinks === "override") {
      return { category: [...nodes[i].category], reason: "override" };
    }
  }
  return { category: [], reason: "root" };
}

function getHighestLevel(
  levels: readonly (LogLevel | null)[],
): LogLevel | null {
  let highest: LogLevel = "trace";
  for (const level of levels) {
    if (level === null) return null;
    if (compareLogLevel(level, highest) > 0) highest = level;
  }
  return highest;
}
