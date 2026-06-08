import type { Rule } from "eslint";
import {
  canInsertAwait,
  isAsyncFunctionExpr,
  isLogPromiseHandled,
  isPromiseReturningCallback,
  LOG_METHODS,
  logMethodName,
} from "../core/ast.ts";
import { createLogtapeScope } from "../utils.ts";

/**
 * ESLint rule that detects async lazy callbacks passed to LogTape log methods
 * without `await`.  The resulting `Promise<void>` would be silently ignored.
 *
 * ```ts
 * // Incorrect:
 * logger.debug("msg", async () => ({ data: await fetchData() }));
 *
 * // Correct:
 * await logger.debug("msg", async () => ({ data: await fetchData() }));
 * ```
 */
export const noUnawaitedLog: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require await on LogTape log calls that use async lazy callbacks",
      recommended: true,
      url: "https://logtape.org/lint/no-unawaited-log",
    },
    fixable: "code",
    schema: [],
    messages: {
      requireAwait:
        "Async lazy callbacks must be awaited to ensure the log is flushed: " +
        'await logger.debug("msg", async () => ({ ... })).',
    },
  },

  create(context) {
    const scope = createLogtapeScope(context);

    // Does the identifier argument resolve to a binding whose value yields a
    // promise: an async function, or a non-async function that syntactically
    // returns one?  This catches a callback passed by reference in both the
    // variable form (`const props = async () => ({ ... })` or
    // `const props = () => fetchData().then(...)`) and the function-declaration
    // form (`async function props() {}` or `function props() { return p.then(...) }`).
    // deno-lint-ignore no-explicit-any
    function resolvesToPromiseCallback(idNode: any, callNode: any): boolean {
      // deno-lint-ignore no-explicit-any
      let cur: any = (context as any).sourceCode?.getScope?.(callNode) ??
        // deno-lint-ignore no-explicit-any
        (context as any).getScope?.();
      while (cur) {
        const variable = cur.set?.get(idNode.name);
        if (variable) {
          // deno-lint-ignore no-explicit-any
          return variable.defs?.some((d: any) => {
            if (d.type === "Variable") {
              return isAsyncFunctionExpr(d.node?.init) ||
                isPromiseReturningCallback(d.node?.init);
            }
            // function props() {} is a FunctionName def.
            if (d.type === "FunctionName") {
              return d.node?.async === true ||
                isPromiseReturningCallback(d.node);
            }
            return false;
          }) ?? false;
        }
        cur = cur.upper;
      }
      return false;
    }

    return {
      ImportDeclaration: scope.ImportDeclaration,
      CallExpression(node) {
        const { callee } = node;
        if (!scope.isLogtapeCall(callee, node)) return;
        const propertyName = logMethodName(callee);
        if (!propertyName || !LOG_METHODS.has(propertyName)) return;

        const secondArg = node.arguments[1];
        if (!secondArg) return;

        const isAsyncCallback = isAsyncFunctionExpr(secondArg) ||
          isPromiseReturningCallback(secondArg) ||
          (secondArg.type === "Identifier" &&
            resolvesToPromiseCallback(secondArg, node));
        if (!isAsyncCallback) return;

        // Walk the ancestor chain to check if the promise is handled (awaited,
        // returned, chained with .then(), or consumed by Promise.all()).
        if (isLogPromiseHandled(node)) return;

        context.report({
          node,
          messageId: "requireAwait",
          // Only autofix a standalone statement.  Inserting `await` where the
          // call's value is used (assigned, passed as an argument, returned)
          // would change a Promise<void> into void and can break code that
          // uses that promise, so those contexts are reported without a fix.
          fix: canInsertAwait(node)
            ? (fixer) => fixer.insertTextBefore(node, "await ")
            : undefined,
        });
      },
    };
  },
};
