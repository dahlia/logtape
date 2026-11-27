import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/mod.ts",
    "src/eslint/plugin.ts",
    "src/deno/plugin.ts",
    "src/deno/strict-plugin.ts",
    "src/deno/quoted-placeholder-plugin.ts",
    "src/deno/strict-quoted-placeholder-plugin.ts",
  ],
  dts: { sourcemap: true },
  format: ["esm", "cjs"],
  platform: "neutral",
  unbundle: true,
});
