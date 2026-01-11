import type { ShorthandRegistry } from "./types.ts";

/**
 * Default shorthand mappings for built-in sinks and formatters.
 * @since 2.0.0
 */
export const DEFAULT_SHORTHANDS: ShorthandRegistry = {
  sinks: {
    console: "@logtape/logtape#getConsoleSink",
    stream: "@logtape/logtape#getStreamSink",
  },
  filters: {},
  formatters: {
    text: "@logtape/logtape#getTextFormatter",
    ansiColor: "@logtape/logtape#getAnsiColorFormatter",
    jsonLines: "@logtape/logtape#getJsonLinesFormatter",
  },
};

/**
 * Merges user shorthands with default shorthands.
 * @param defaults Default shorthands
 * @param custom Custom shorthands
 * @returns Merged shorthands
 * @since 2.0.0
 */
export function mergeShorthands(
  defaults: ShorthandRegistry,
  custom?: ShorthandRegistry,
): ShorthandRegistry {
  if (!custom) return defaults;

  return {
    sinks: { ...defaults.sinks, ...custom.sinks },
    filters: { ...defaults.filters, ...custom.filters },
    formatters: { ...defaults.formatters, ...custom.formatters },
  };
}
