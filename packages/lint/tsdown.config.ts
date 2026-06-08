import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/mod.ts", "src/eslint/plugin.ts", "src/deno/plugin.ts"],
  dts: { sourcemap: true },
  format: ["esm", "cjs"],
  platform: "neutral",
  unbundle: true,
});
