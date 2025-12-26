import type { EnvExpansionOptions } from "./types.ts";

/**
 * Expands environment variables in a configuration object.
 *
 * @param config Configuration object
 * @param options Expansion options
 * @returns Configuration with expanded environment variables
 * @since 1.4.0
 */
export function expandEnvVars<T extends object>(
  config: T,
  options?: EnvExpansionOptions,
): T {
  const pattern = options?.pattern ?? /\$\{([^}:]+)(?::([^}]+))?\}/g;

  function replace(value: string): string {
    return value.replace(pattern, (_, key, defaultValue) => {
      let val: string | undefined;
      // deno-lint-ignore no-explicit-any
      if (typeof (globalThis as any).process?.env === "object") {
        // Node.js / Bun
        // deno-lint-ignore no-explicit-any
        val = (globalThis as any).process.env[key];
      } else if (typeof Deno !== "undefined") {
        // Deno
        val = Deno.env.get(key);
      }

      return val ?? defaultValue ?? "";
    });
  }

  function walk(obj: unknown): unknown {
    if (typeof obj === "string") {
      return replace(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(walk);
    }
    if (obj !== null && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = walk(value);
      }
      return result;
    }
    return obj;
  }

  return walk(config) as T;
}
