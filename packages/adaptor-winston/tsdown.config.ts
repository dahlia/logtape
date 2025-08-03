import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/mod.ts", "src/install.ts"],
  dts: {
    sourcemap: true,
  },
  format: ["esm", "cjs"],
  platform: "node",
  unbundle: true,
});
