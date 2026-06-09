/**
 * Options for bounding recursive redaction traversal.
 * @since 2.2.0
 */
export interface RedactionTraversalOptions {
  /**
   * Maximum recursion depth for object and array traversal.
   * @default `20`
   */
  readonly maxDepth?: number;

  /**
   * Maximum number of properties or array elements to process per object.
   * @default `1000`
   */
  readonly maxProperties?: number;
}

export interface RedactionTraversalLimits {
  readonly maxDepth: number;
  readonly maxProperties: number;
}

export type RedactionLimit = keyof RedactionTraversalLimits;

export interface RedactionTraversalContext {
  readonly limits: RedactionTraversalLimits;
  readonly visited: Map<object, object>;
  readonly exceededLimits: Set<RedactionLimit>;
  reportLimitExceeded(limit: RedactionLimit): void;
}

export const redactionTruncatedValue = "[truncated]";

const defaultMaxDepth = 20;
const defaultMaxProperties = 1000;

export function createRedactionTraversalContext(
  options: RedactionTraversalOptions,
  reportLimitExceeded: (
    limit: RedactionLimit,
    limits: RedactionTraversalLimits,
  ) => void,
  visited = new Map<object, object>(),
): RedactionTraversalContext {
  const limits: RedactionTraversalLimits = {
    maxDepth: normalizeLimit(options.maxDepth, defaultMaxDepth),
    maxProperties: normalizeLimit(options.maxProperties, defaultMaxProperties),
  };
  const exceededLimits = new Set<RedactionLimit>();
  return {
    limits,
    visited,
    exceededLimits,
    reportLimitExceeded(limit) {
      exceededLimits.add(limit);
      reportLimitExceeded(limit, limits);
    },
  };
}

function normalizeLimit(
  value: number | undefined,
  defaultValue: number,
): number {
  if (value == null) return defaultValue;
  if (!Number.isFinite(value) || value < 0) return defaultValue;
  return Math.floor(value);
}
