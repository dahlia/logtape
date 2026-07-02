import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/mod.ts", "src/recorder.ts", "src/reporter.ts"],
  dts: {
    sourcemap: true,
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  unbundle: true,
});
