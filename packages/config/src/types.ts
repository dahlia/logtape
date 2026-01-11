import type { LogLevel } from "@logtape/logtape";

/**
 * Configuration object schema for `configureFromObject()`.
 * @since 2.0.0
 */
export interface LogTapeConfig {
  /**
   * The sinks to configure.
   */
  sinks?: Record<string, SinkConfig>;

  /**
   * The filters to configure.
   */
  filters?: Record<string, FilterConfig>;

  /**
   * The loggers to configure.
   */
  loggers?: LoggerConfig[];

  /**
   * Whether to reset the configuration before applying this one.
   */
  reset?: boolean;
}

/**
 * Sink configuration with module reference.
 * @since 2.0.0
 */
export interface SinkConfig {
  /** Module reference in `module#export()` format */
  type: string;
  /** Formatter configuration or shorthand */
  formatter?: string | FormatterConfig;
  /** Additional options passed to the factory function */
  [key: string]: unknown;
}

/**
 * Filter configuration with module reference.
 * @since 2.0.0
 */
export interface FilterConfig {
  /** Module reference in `module#export()` format */
  type: string;
  /** Additional options passed to the factory function */
  [key: string]: unknown;
}

/**
 * Formatter configuration with module reference.
 * @since 2.0.0
 */
export interface FormatterConfig {
  /** Module reference in `module#export()` format */
  type: string;
  /** Additional options passed to the factory function */
  [key: string]: unknown;
}

/**
 * Logger configuration.
 * @since 2.0.0
 */
export interface LoggerConfig {
  /**
   * The category of the logger.
   */
  category: string | string[];

  /**
   * The sink identifiers to use.
   */
  sinks?: string[];

  /**
   * The filter identifiers to use.
   */
  filters?: string[];

  /**
   * The lowest log level to log.
   */
  lowestLevel?: LogLevel;

  /**
   * Whether to inherit the parent's sinks.
   */
  parentSinks?: "inherit" | "override";
}

/**
 * Registry of shorthand mappings.
 * @since 2.0.0
 */
export interface ShorthandRegistry {
  /**
   * The shorthand mappings for sinks.
   */
  sinks?: Record<string, string>;

  /**
   * The shorthand mappings for filters.
   */
  filters?: Record<string, string>;

  /**
   * The shorthand mappings for formatters.
   */
  formatters?: Record<string, string>;
}

/**
 * Options for `configureFromObject()`.
 * @since 2.0.0
 */
export interface ConfigureOptions {
  /**
   * Custom shorthand mappings to extend or override defaults.
   */
  shorthands?: ShorthandRegistry;

  /**
   * How to handle invalid configuration entries.
   *
   * - `"throw"` (default): Throw `ConfigError` on any invalid configuration.
   * - `"warn"`: Apply only valid parts and log warnings to meta logger.
   */
  onInvalidConfig?: "throw" | "warn";
}

/**
 * Options for environment variable expansion.
 * @since 2.0.0
 */
export interface EnvExpansionOptions {
  /**
   * Regular expression pattern for matching environment variables.
   * Default: `/\$\{([^}:]+)(?::([^}]+))?\}/g` (matches `${VAR}` or `${VAR:default}`)
   */
  pattern?: RegExp;
}

/**
 * Parsed module reference.
 * @since 2.0.0
 */
export interface ParsedModuleReference {
  /** Whether this is a shorthand (starts with #) */
  isShorthand: boolean;
  /** The shorthand name (if isShorthand is true) */
  shorthandName?: string;
  /** The module path */
  modulePath?: string;
  /** The export name (after #) */
  exportName?: string;
  /** Whether this is a factory function (ends with ()) */
  isFactory: boolean;
}

/**
 * Error thrown when configuration is invalid.
 * @since 2.0.0
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
