import type { Rule } from "eslint";
import {
  classifyLogArgumentSyntax,
  ERROR_LOG_METHODS,
  LOG_METHODS,
  type LogArgumentKind,
  logMethodName,
  messageAccessReceiver,
} from "../core/ast.ts";
import { createLogtapeScope } from "../utils.ts";

// deno-lint-ignore no-explicit-any
type AnyNode = any;

/**
 * ESLint rule that detects dynamic expressions passed as LogTape message
 * arguments.
 *
 * Static message templates keep the event shape stable and preserve dynamic
 * values as structured properties.  This rule intentionally has no autofix,
 * because choosing property names and an eager or lazy evaluation form
 * requires application context.
 */
export const noDynamicMessage: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow dynamic expressions in LogTape log message arguments",
      recommended: false,
      url: "https://logtape.org/lint/no-dynamic-message",
    },
    schema: [],
    messages: {
      noDynamicMessage:
        "Avoid using a dynamic expression as a log message. Use a static " +
        "message template with structured properties instead.",
      passError:
        "Pass the Error object directly instead of its message, or use a " +
        "static message template with structured properties.",
    },
  },

  create(context) {
    const scope = createLogtapeScope(context);

    return {
      ImportDeclaration: scope.ImportDeclaration,
      CallExpression(node) {
        if (!scope.isLogtapeCall(node.callee, node)) return;
        const methodName = logMethodName(node.callee);
        if (!methodName || !LOG_METHODS.has(methodName)) return;

        const firstArg = node.arguments[0];
        if (!firstArg) return;

        // no-message-interpolation owns direct interpolated templates.  This
        // avoids duplicate diagnostics when both rules are enabled.
        const direct = classifyLogArgumentSyntax(firstArg);
        if (direct === "interpolated-message") return;

        const inferred = scope.classifyLogArgument(firstArg, node);
        if (isAllowedArgument(inferred, methodName)) return;

        const messageReceiver = ERROR_LOG_METHODS.has(methodName)
          ? messageAccessReceiver(firstArg)
          : null;
        const passError = messageReceiver != null &&
          scope.classifyLogArgument(messageReceiver, node) === "error";

        const parameterKind = scope.resolvedFirstParameterKind(node);
        if (isAllowedArgument(parameterKind, methodName)) return;

        // With neither a resolved overload nor a safe local classification,
        // the expression could be a dynamic string.  The opt-in rule reports
        // this conservative fallback.
        report(context, firstArg, passError);
      },
    };
  },
};

function isAllowedArgument(kind: LogArgumentKind, methodName: string): boolean {
  return kind === "static-message" || kind === "properties" ||
    kind === "callback" || kind === "non-message" ||
    (kind === "error" && ERROR_LOG_METHODS.has(methodName));
}

function report(
  context: Rule.RuleContext,
  node: AnyNode,
  passError: boolean,
): void {
  context.report({
    node,
    messageId: passError ? "passError" : "noDynamicMessage",
  });
}
