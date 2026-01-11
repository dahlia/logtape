import { configure, getLogger } from "@logtape/logtape";
import type { Config, Filter, Sink } from "@logtape/logtape";
import { createFilter, createSink } from "./loader.ts";
import { DEFAULT_SHORTHANDS, mergeShorthands } from "./shorthands.ts";
import { ConfigError } from "./types.ts";
import type { ConfigureOptions, LogTapeConfig } from "./types.ts";

/**
 * Configures LogTape from a plain object.
 *
 * @param config Configuration object (typically loaded from JSON/YAML/TOML)
 * @param options Configuration options
 * @throws {ConfigError} If configuration is invalid and onInvalidConfig is "throw"
 *
 * @example
 * ```typescript
 * import { configureFromObject } from "@logtape/config";
 * import { readFile } from "fs/promises";
 *
 * const config = JSON.parse(await readFile("./logtape.json", "utf-8"));
 * await configureFromObject(config);
 * ```
 * @since 2.0.0
 */
export async function configureFromObject(
  config: LogTapeConfig,
  options?: ConfigureOptions,
): Promise<void> {
  const shorthands = mergeShorthands(
    DEFAULT_SHORTHANDS,
    options?.shorthands,
  );
  const onInvalidConfig = options?.onInvalidConfig ?? "throw";
  const warnings: string[] = [];

  // 1. Create sinks
  const sinks: Record<string, Sink> = {};
  if (config.sinks) {
    for (const [name, sinkConfig] of Object.entries(config.sinks)) {
      try {
        sinks[name] = await createSink(sinkConfig, shorthands);
      } catch (e) {
        if (onInvalidConfig === "throw") {
          throw e;
        }
        warnings.push(`Failed to create sink '${name}': ${e}`);
      }
    }
  }

  // 2. Create filters
  const filters: Record<string, Filter> = {};
  if (config.filters) {
    for (const [name, filterConfig] of Object.entries(config.filters)) {
      try {
        filters[name] = await createFilter(filterConfig, shorthands);
      } catch (e) {
        if (onInvalidConfig === "throw") {
          throw e;
        }
        warnings.push(`Failed to create filter '${name}': ${e}`);
      }
    }
  }

  // 3. Configure logtape
  const logTapeConfig: Config<string, string> = {
    sinks,
    filters,
    loggers: [],
  };

  if (config.loggers) {
    for (const loggerConfig of config.loggers) {
      // Validate sink references
      const validSinks: string[] = [];
      if (loggerConfig.sinks) {
        for (const sinkName of loggerConfig.sinks) {
          if (sinkName in sinks) {
            validSinks.push(sinkName);
          } else {
            const msg = `Logger '${
              Array.isArray(loggerConfig.category)
                ? loggerConfig.category.join(".")
                : loggerConfig.category
            }' references unknown or failed sink '${sinkName}'`;
            if (onInvalidConfig === "throw") {
              throw new ConfigError(msg);
            }
            warnings.push(msg);
          }
        }
      }

      // Validate filter references
      const validFilters: string[] = [];
      if (loggerConfig.filters) {
        for (const filterName of loggerConfig.filters) {
          if (filterName in filters) {
            validFilters.push(filterName);
          } else {
            const msg = `Logger '${
              Array.isArray(loggerConfig.category)
                ? loggerConfig.category.join(".")
                : loggerConfig.category
            }' references unknown or failed filter '${filterName}'`;
            if (onInvalidConfig === "throw") {
              throw new ConfigError(msg);
            }
            warnings.push(msg);
          }
        }
      }

      logTapeConfig.loggers.push({
        category: loggerConfig.category,
        sinks: validSinks.length > 0 ? validSinks : undefined,
        filters: validFilters.length > 0 ? validFilters : undefined,
        lowestLevel: loggerConfig.lowestLevel,
        parentSinks: loggerConfig.parentSinks,
      });
    }
  }

  if (config.reset) {
    logTapeConfig.reset = true;
  }

  await configure(logTapeConfig);

  // 4. Log warnings to meta logger
  if (warnings.length > 0) {
    const metaLogger = getLogger(["logtape", "meta"]);
    for (const warning of warnings) {
      metaLogger.warn(warning);
    }
  }
}
