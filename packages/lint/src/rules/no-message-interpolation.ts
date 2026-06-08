import type { Rule } from "eslint";
import {
  LOG_METHODS,
  logMethodName,
  unwrapTypeAssertion,
} from "../core/ast.ts";
import { createLogtapeScope } from "../utils.ts";

/**
 * ESLint rule that detects string template literals with `${}` interpolation
 * passed as the message argument to LogTape log methods.
 *
 * Users should use message templates with structured properties instead:
 *
 * ```ts
 * // Incorrect:
 * logger.info(`User ${userId} logged in.`);
 *
 * // Correct:
 * logger.info("User {userId} logged in.", { userId });
 * ```
 */
export const noMessageInterpolation: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow string template literal interpolation in LogTape log message arguments",
      recommended: true,
      url: "https://logtape.org/lint/no-message-interpolation",
    },
    schema: [],
    messages: {
      noInterpolation:
        "Avoid using template literal interpolation in log messages. " +
        "Use a message template string with structured properties instead: " +
        'logger.info("User {userId} logged in.", { userId }).',
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

        const firstArg = unwrapTypeAssertion(node.arguments[0]);
        if (!firstArg || firstArg.type !== "TemplateLiteral") return;
        if (firstArg.expressions.length === 0) return;

        context.report({
          node: firstArg,
          messageId: "noInterpolation",
        });
      },
    };
  },
};
