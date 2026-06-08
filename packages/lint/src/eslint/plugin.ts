/**
 * ESLint + Oxlint plugin for LogTape lint rules.
 *
 * Works with ESLint v8 and v9+ flat config, as well as Oxlint which provides
 * an ESLint-compatible plugin API.
 *
 * **ESLint v9 flat config** (`eslint.config.js`):
 * ```js
 * import logtapePlugin from "@logtape/lint/eslint";
 * export default [
 *   {
 *     plugins: { logtape: logtapePlugin },
 *     rules: {
 *       "logtape/no-message-interpolation": "error",
 *       "logtape/prefer-lazy-evaluation": "warn",
 *       "logtape/no-unawaited-log": "error",
 *       "logtape/require-meta-sink": "warn",
 *     },
 *   },
 * ];
 * ```
 *
 * **Using the recommended preset**:
 * ```js
 * import { recommended } from "@logtape/lint/eslint";
 * export default [recommended];
 * ```
 *
 * @module
 */

import type { Linter, Rule } from "eslint";
import { noMessageInterpolation } from "../rules/no-message-interpolation.ts";
import { noUnawaitedLog } from "../rules/no-unawaited-log.ts";
import { preferLazyEvaluation } from "../rules/prefer-lazy-evaluation.ts";
import { requireMetaSink } from "../rules/require-meta-sink.ts";

export { noMessageInterpolation } from "../rules/no-message-interpolation.ts";
export { noUnawaitedLog } from "../rules/no-unawaited-log.ts";
export { preferLazyEvaluation } from "../rules/prefer-lazy-evaluation.ts";
export { requireMetaSink } from "../rules/require-meta-sink.ts";

/**
 * All LogTape lint rules.
 */
export const rules: Record<string, Rule.RuleModule> = {
  "no-message-interpolation": noMessageInterpolation,
  "prefer-lazy-evaluation": preferLazyEvaluation,
  "no-unawaited-log": noUnawaitedLog,
  "require-meta-sink": requireMetaSink,
};

// Declare plugin before recommended to allow the circular reference.
// deno-lint-ignore no-explicit-any
export const plugin: any = {
  meta: { name: "@logtape/lint" },
  rules,
  configs: {},
};

/**
 * Recommended ESLint v9 flat config preset.
 *
 * Enables all LogTape rules with their recommended severity levels:
 * - `no-message-interpolation`: error
 * - `prefer-lazy-evaluation`: warn
 * - `no-unawaited-log`: error
 * - `require-meta-sink`: warn
 */
export const recommended: Linter.Config = {
  plugins: { logtape: plugin },
  rules: {
    "logtape/no-message-interpolation": "error",
    "logtape/prefer-lazy-evaluation": "warn",
    "logtape/no-unawaited-log": "error",
    "logtape/require-meta-sink": "warn",
  },
};

plugin.configs.recommended = recommended;

export default plugin;
