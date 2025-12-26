import { parseModuleReference } from "./parser.ts";
import { ConfigError } from "./types.ts";
import type {
  FilterConfig,
  FormatterConfig,
  ParsedModuleReference,
  ShorthandRegistry,
  SinkConfig,
} from "./types.ts";
import type { Filter, Sink } from "@logtape/logtape";

/**
 * Loads a module and extracts the specified export.
 *
 * @param parsed Parsed module reference
 * @param shorthands Shorthand registry for resolving shorthands
 * @param type Type of shorthand (sinks, filters, formatters)
 * @returns The loaded module export
 * @since 1.4.0
 */
export async function loadModuleExport(
  parsed: ParsedModuleReference,
  shorthands: ShorthandRegistry,
  type: "sinks" | "filters" | "formatters",
): Promise<unknown> {
  if (parsed.isShorthand) {
    const registry = shorthands[type];
    const resolved = registry ? registry[parsed.shorthandName!] : undefined;

    if (!resolved) {
      throw new ConfigError(
        `Unknown ${type.slice(0, -1)} shorthand: #${parsed.shorthandName}`,
      );
    }

    const resolvedParsed = parseModuleReference(resolved);
    // Inherit isFactory from the original shorthand usage if meaningful?
    // Actually, the resolved string decides the module and export.
    // The usage (with or without parens) decides if we call it.
    // But here we are just loading the export.
    return loadModuleExport(resolvedParsed, shorthands, type);
  }

  if (!parsed.modulePath) {
    throw new ConfigError("Module path is missing");
  }

  let mod: Record<string, unknown>;
  try {
    mod = await import(parsed.modulePath);
  } catch (e) {
    throw new ConfigError(
      `Failed to load module ${parsed.modulePath}: ${e}`,
    );
  }

  const exportName = parsed.exportName ?? "default";
  const exported = mod[exportName];

  if (exported === undefined) {
    throw new ConfigError(
      `Module ${parsed.modulePath} does not have export '${exportName}'`,
    );
  }

  return exported;
}

/**
 * Creates a sink from configuration.
 *
 * @param config Sink configuration
 * @param shorthands Shorthand registry
 * @returns The created sink
 * @since 1.4.0
 */
export async function createSink(
  config: SinkConfig,
  shorthands: ShorthandRegistry,
): Promise<Sink> {
  const parsed = parseModuleReference(config.type);
  const factory = await loadModuleExport(parsed, shorthands, "sinks");

  let sink: Sink;
  if (parsed.isFactory) {
    if (typeof factory !== "function") {
      throw new ConfigError(
        `Export ${parsed.exportName} in ${parsed.modulePath} is not a function, but invoked as factory`,
      );
    }

    // Process formatter if present
    const options: Record<string, unknown> = { ...config };
    delete options.type;

    if (options.formatter) {
      if (typeof options.formatter === "string") {
        const fmtParsed = parseModuleReference(options.formatter);
        const fmtFactory = await loadModuleExport(
          fmtParsed,
          shorthands,
          "formatters",
        );
        if (fmtParsed.isFactory) {
          if (typeof fmtFactory !== "function") {
            throw new ConfigError(
              `Formatter ${options.formatter} is not a function`,
            );
          }
          options.formatter = (fmtFactory as (opts?: unknown) => unknown)({});
        } else {
          options.formatter = fmtFactory;
        }
      } else {
        // FormatterConfig
        const fmtConfig = options.formatter as FormatterConfig;
        const fmtParsed = parseModuleReference(fmtConfig.type);
        const fmtFactory = await loadModuleExport(
          fmtParsed,
          shorthands,
          "formatters",
        );

        if (fmtParsed.isFactory) {
          if (typeof fmtFactory !== "function") {
            throw new ConfigError(
              `Formatter ${fmtConfig.type} is not a function`,
            );
          }
          const fmtOptions: Record<string, unknown> = { ...fmtConfig };
          delete fmtOptions.type;
          options.formatter = (fmtFactory as (opts: unknown) => unknown)(
            fmtOptions,
          );
        } else {
          options.formatter = fmtFactory;
        }
      }
    }

    sink = (factory as (opts: unknown) => Sink)(options);
  } else {
    sink = factory as Sink;
  }

  return sink;
}

/**
 * Creates a filter from configuration.
 *
 * @param config Filter configuration
 * @param shorthands Shorthand registry
 * @returns The created filter
 * @since 1.4.0
 */
export async function createFilter(
  config: FilterConfig,
  shorthands: ShorthandRegistry,
): Promise<Filter> {
  const parsed = parseModuleReference(config.type);
  const factory = await loadModuleExport(parsed, shorthands, "filters");

  if (parsed.isFactory) {
    if (typeof factory !== "function") {
      throw new ConfigError(
        `Export ${parsed.exportName} in ${parsed.modulePath} is not a function, but invoked as factory`,
      );
    }
    const options: Record<string, unknown> = { ...config };
    delete options.type;
    return (factory as (opts: unknown) => Filter)(options);
  }

  return factory as Filter;
}
