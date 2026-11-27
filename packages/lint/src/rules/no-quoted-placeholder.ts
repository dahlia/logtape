import type { Rule } from "eslint";
import {
  findQuotedMessage,
  LOG_METHODS,
  logMethodName,
  quotedPlaceholderMessage,
} from "../core/ast.ts";
import { createLogtapeScope } from "../utils.ts";

/**
 * Reports manually quoted placeholders in LogTape messages. Some formatters
 * already quote string values, so the rule is opt-in and has no fix.
 */
export const noQuotedPlaceholder: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Flag quotes around LogTape message placeholders",
      recommended: false,
      url: "https://logtape.org/lint/no-quoted-placeholder",
    },
    schema: [],
    messages: { quotedPlaceholder: quotedPlaceholderMessage },
  },

  create(context) {
    const scope = createLogtapeScope(context);
    function check(
      node: Rule.Node & {
        type: "CallExpression" | "TaggedTemplateExpression";
      },
    ): void {
      const callee = node.type === "CallExpression" ? node.callee : node.tag;
      const method = logMethodName(callee);
      if (!method || !LOG_METHODS.has(method)) return;
      if (!scope.isLogtapeCall(callee, node)) return;
      const message = findQuotedMessage(node);
      if (message) {
        context.report({ node: message, messageId: "quotedPlaceholder" });
      }
    }
    return {
      ImportDeclaration: scope.ImportDeclaration,
      CallExpression: check,
      TaggedTemplateExpression: check,
    };
  },
};
