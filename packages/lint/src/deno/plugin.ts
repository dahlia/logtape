/**
 * Deno Lint plugin that enables the recommended LogTape rules.
 *
 * Put `"jsr:@logtape/lint/deno"` in `lint.plugins` in your Deno config.
 * Use `/deno/strict` to also enable `no-dynamic-message` and
 * `no-unrendered-properties`. To enable `no-quoted-placeholder`, replace
 * the chosen entry point with its `/quoted-placeholder` variant.
 *
 * @module
 */
export { logtapePlugin as default, strictPlugin } from "./plugin-impl.ts";
