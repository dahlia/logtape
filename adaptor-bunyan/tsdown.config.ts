import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "mod.ts",
  dts: {
    sourcemap: true,
  },
  format: ["esm", "cjs"],
  platform: "node",
  unbundle: true,
}); 
