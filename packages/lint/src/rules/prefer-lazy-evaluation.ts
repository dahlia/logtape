import type { Rule } from "eslint";
import {
  containsAwaitOrYield,
  LOG_METHODS,
  logMethodName,
  propsHaveEagerCall,
  selectLazyPropsObject,
} from "../core/ast.ts";
import { createLogtapeScope, getSourceCode } from "../utils.ts";

/**
 * ESLint rule that detects computed expressions (function calls) inside the
 * properties object passed to LogTape log methods.  Wrapping in a lazy
 * callback prevents unnecessary computation when the log level is disabled.
 *
 * ```ts
 * // Incorrect:
 * logger.debug("User data: {userData}.", { userData: fetchUserData(userId) });
 *
 * // Correct:
 * logger.debug("User data: {userData}.", () => ({ userData: fetchUserData(userId) }));
 * ```
 */
export const preferLazyEvaluation: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer lazy evaluation callbacks over eager property objects in LogTape log calls",
      recommended: true,
      url: "https://logtape.org/lint/prefer-lazy-evaluation",
    },
    fixable: "code",
    schema: [],
    messages: {
      preferLazy:
        "Wrap the properties object in a lazy callback to avoid unnecessary computation: " +
        'logger.debug("msg", () => ({ ... })).',
    },
  },

  create(context) {
    const scope = createLogtapeScope(context);

    return {
      ImportDeclaration: scope.ImportDeclaration,
      CallExpression(node) {
        const { callee } = node;
        if (!scope.isLogtapeCall(callee, node)) return;
        const propertyName = logMethodName(callee);
        if (!propertyName || !LOG_METHODS.has(propertyName)) return;

        // The eager properties object is the second argument in the
        // message+properties form, logger.debug("msg", { ... }), or the first
        // argument in the properties-only form, logger.debug({ ... }).
        const selected = selectLazyPropsObject(node.arguments);
        if (!selected) return;
        const { propsObject, fixTarget, propertiesOnly } = selected;

        // Use the lazy names that still resolve to the import at this call, so
        // a shadowed local `lazy(...)` is treated as an ordinary eager call.
        if (!propsHaveEagerCall(propsObject, scope.effectiveLazyNames(node))) {
          return;
        }

        const sourceCode = getSourceCode(context);
        const hasAsyncSyntax = containsAwaitOrYield(propsObject);
        context.report({
          node: propsObject,
          messageId: "preferLazy",
          // Wrap the whole argument (fixTarget), including any `as const` /
          // `satisfies` wrapper, so the assertion ends up inside the callback
          // instead of dangling on it.
          fix: hasAsyncSyntax ? undefined : (fixer) => {
            const objectText = sourceCode.getText(fixTarget);
            // The properties-only overload needs the "{*}" message inserted so
            // the lazy callback is still read as properties, not as a message.
            return fixer.replaceText(
              fixTarget,
              propertiesOnly
                ? `"{*}", () => (${objectText})`
                : `() => (${objectText})`,
            );
          },
        });
      },
    };
  },
};
