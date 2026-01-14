import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/mod.ts", "src/install.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  external: ["log4js", "@logtape/logtape"],
  dts: true,
  clean: true,
  outDir: "dist",
});
