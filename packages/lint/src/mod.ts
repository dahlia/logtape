/**
 * `@logtape/lint` provides lint rules for LogTape usage patterns.
 *
 * The rules are available for ESLint, Oxlint, and Deno Lint:
 *
 * - `@logtape/lint/eslint` — ESLint + Oxlint plugin
 * - `@logtape/lint/deno` — Deno Lint plugin (experimental)
 *
 * @module
 */

export {
  noMessageInterpolation,
  noUnawaitedLog,
  plugin,
  plugin as default,
  preferLazyEvaluation,
  recommended,
  requireMetaSink,
  rules,
} from "./eslint/plugin.ts";
