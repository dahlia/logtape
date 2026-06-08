import type { Rule } from "eslint";
import {
  configNeedsMetaSink,
  isLogtapeImportSource,
  unwrapTypeAssertion,
} from "../core/ast.ts";

/**
 * ESLint rule that detects `configure()` / `configureSync()` calls imported
 * from `@logtape/logtape` that lack a dedicated sink for the meta logger.
 *
 * ```ts
 * // Incorrect (missing meta sink):
 * await configure({ sinks: { main: s }, loggers: [{ category: [], sinks: ["main"] }] });
 *
 * // Correct:
 * await configure({
 *   sinks: { console: getConsoleSink(), main: s },
 *   loggers: [
 *     { category: ["logtape", "meta"], sinks: ["console"] },
 *     { category: [], sinks: ["main"] },
 *   ],
 * });
 * ```
 */
export const requireMetaSink: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a dedicated sink for the LogTape meta logger in configure() calls",
      recommended: true,
      url: "https://logtape.org/lint/require-meta-sink",
    },
    schema: [],
    messages: {
      requireMeta: "Add a dedicated sink for the meta logger " +
        '(category: ["logtape"] or ["logtape", "meta"]) ' +
        "to handle LogTape's own diagnostic messages.",
    },
  },

  create(context) {
    // Track local names of configure/configureSync imported from @logtape/logtape
    const configFns = new Set<string>();

    return {
      ImportDeclaration(node) {
        // deno-lint-ignore no-explicit-any
        if (!isLogtapeImportSource((node as any).source?.value)) return;
        // deno-lint-ignore no-explicit-any
        for (const specifier of (node as any).specifiers ?? []) {
          if (specifier.type !== "ImportSpecifier") continue;
          const imported = specifier.imported?.name;
          if (imported === "configure" || imported === "configureSync") {
            configFns.add(specifier.local?.name);
          }
        }
      },

      CallExpression(node) {
        if (configFns.size === 0) return;

        const { callee } = node;
        if (callee.type !== "Identifier") return;
        // deno-lint-ignore no-explicit-any
        const calleeName = (callee as any).name as string;
        if (!configFns.has(calleeName)) return;

        // Verify the callee resolves to the actual import, not a shadow
        // (e.g. a function parameter also named configure).
        // deno-lint-ignore no-explicit-any
        const scope = (context as any).sourceCode?.getScope?.(node) ??
          // deno-lint-ignore no-explicit-any
          (context as any).getScope?.();
        if (scope) {
          // deno-lint-ignore no-explicit-any
          let cur: any = scope;
          // deno-lint-ignore no-explicit-any
          let calleeVar: any = null;
          while (cur) {
            const v = cur.set?.get(calleeName);
            if (v) {
              calleeVar = v;
              break;
            }
            cur = cur.upper;
          }
          if (
            // deno-lint-ignore no-explicit-any
            !calleeVar?.defs?.some((d: any) => d.type === "ImportBinding")
          ) return;
        }

        // Unwrap a TypeScript type assertion (e.g. `configure({ ... } as const)`).
        const configArg = unwrapTypeAssertion(node.arguments[0]);
        if (configNeedsMetaSink(configArg)) {
          context.report({ node, messageId: "requireMeta" });
        }
      },
    };
  },
};
