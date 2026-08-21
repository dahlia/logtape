/**
 * Deno Lint plugin providing all LogTape lint rules, including opt-in rules.
 *
 * Use this entry point instead of `@logtape/lint/deno` when enabling
 * `logtape/no-dynamic-message`.
 *
 * @module
 */

export { strictPlugin as default } from "./plugin.ts";
