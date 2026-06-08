import type { Rule } from "eslint";
import { isLogtapeImportSource } from "./core/ast.ts";

// deno-lint-ignore no-explicit-any
type AnyNode = any;

/**
 * Returns visitor hooks and a scope-aware checker for detecting LogTape log
 * method calls.  Uses ESLint's scope manager to resolve variable bindings,
 * so parameter- and local-variable shadowing are handled correctly.
 *
 * Wire the returned `ImportDeclaration` hook into your rule's visitor object,
 * then call `isLogtapeCall(node.callee, node)` inside `CallExpression`.
 */
export function createLogtapeScope(context: Rule.RuleContext): {
  ImportDeclaration(node: AnyNode): void;
  isLogtapeCall(callee: AnyNode, callNode: AnyNode): boolean;
  lazyNames: Set<string>;
  effectiveLazyNames(callNode: AnyNode): Set<string>;
} {
  const getterNames = new Set<string>();
  // Local names of `lazy` imported from @logtape/logtape.  A lazy() value is
  // already deferred, so the eager-call rules must not treat it as eager.
  const lazyNames = new Set<string>();

  function resolveVariable(scope: AnyNode, name: string): AnyNode {
    let current = scope;
    while (current) {
      const variable = current.set?.get(name);
      if (variable) return variable;
      current = current.upper;
    }
    return null;
  }

  // Does `name`, resolved from `scope`, refer to the actual imported
  // getLogger (an ImportBinding) rather than a shadow such as a parameter?
  function resolvesToImportedGetter(name: string, scope: AnyNode): boolean {
    if (!getterNames.has(name)) return false;
    const calleeVar = resolveVariable(scope, name);
    return calleeVar?.defs?.some(
      (d: AnyNode) => d.type === "ImportBinding",
    ) ?? false;
  }

  // Is `node` an expression that evaluates to a LogTape logger?  Handles
  // direct getLogger(...) calls, identifiers bound to a logger via a variable
  // declaration, and contextual/child loggers produced by chaining
  // Logger.with(...) or Logger.getChild(...).
  function isLoggerExpression(
    node: AnyNode,
    scope: AnyNode,
    depth = 0,
  ): boolean {
    if (depth > 16 || !node) return false;

    // getLogger(...) — direct call to the imported getter.
    if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
      return resolvesToImportedGetter(node.callee.name, scope);
    }

    // logger.with(...) / logger.getChild(...) — contextual or child loggers,
    // which return a Logger and so are themselves logger expressions.
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property?.type === "Identifier" &&
      (node.callee.property.name === "with" ||
        node.callee.property.name === "getChild")
    ) {
      return isLoggerExpression(node.callee.object, scope, depth + 1);
    }

    // An identifier bound to a logger by a variable declaration.
    if (node.type === "Identifier") {
      const variable = resolveVariable(scope, node.name);
      if (!variable) return false;
      // Parameters have def.type === "Parameter"; only "Variable" defs from
      // VariableDeclarator nodes carry an initializer to inspect.  Resolve the
      // initializer in the variable's declaration scope (variable.scope) so a
      // logger declared in an outer scope is still recognised when a closer
      // scope shadows getLogger.
      return variable.defs?.some((def: AnyNode) => {
        if (def.type !== "Variable") return false;
        return isLoggerExpression(
          def.node?.init,
          variable.scope ?? scope,
          depth + 1,
        );
      }) ?? false;
    }

    return false;
  }

  function isLogtapeCall(callee: AnyNode, callNode: AnyNode): boolean {
    if (!callee || callee.type !== "MemberExpression") return false;

    // Use ESLint's scope manager to resolve variable bindings at the call site.
    const scope =
      // deno-lint-ignore no-explicit-any
      (context as any).sourceCode?.getScope?.(callNode) ??
        // deno-lint-ignore no-explicit-any
        (context as any).getScope?.();

    return isLoggerExpression(callee.object, scope);
  }

  // The subset of lazyNames that, at `callNode`, still resolve to the imported
  // `lazy` rather than a shadowing local binding (e.g. a parameter named
  // `lazy`).  The eager-call rules use this so a shadowed `lazy(...)` is
  // treated as an ordinary eager call, not LogTape's deferred wrapper.
  function effectiveLazyNames(callNode: AnyNode): Set<string> {
    if (lazyNames.size === 0) return lazyNames;
    const scope =
      // deno-lint-ignore no-explicit-any
      (context as any).sourceCode?.getScope?.(callNode) ??
        // deno-lint-ignore no-explicit-any
        (context as any).getScope?.();
    const result = new Set<string>();
    for (const name of lazyNames) {
      const variable = resolveVariable(scope, name);
      const isImport = variable?.defs?.some(
        (d: AnyNode) => d.type === "ImportBinding",
      ) ?? false;
      if (isImport) result.add(name);
    }
    return result;
  }

  return {
    ImportDeclaration(node: AnyNode): void {
      if (!isLogtapeImportSource(node.source?.value)) return;
      for (const spec of node.specifiers ?? []) {
        if (spec.type !== "ImportSpecifier") continue;
        if (spec.imported?.name === "getLogger") {
          getterNames.add(spec.local?.name);
        } else if (spec.imported?.name === "lazy") {
          lazyNames.add(spec.local?.name);
        }
      }
    },
    isLogtapeCall,
    lazyNames,
    effectiveLazyNames,
  };
}

/**
 * Get the SourceCode object from a rule context (v8/v9 compatible).
 */
export function getSourceCode(
  context: Rule.RuleContext,
): Rule.RuleContext["sourceCode"] {
  // deno-lint-ignore no-explicit-any
  return (context as any).sourceCode ?? context.getSourceCode?.();
}
