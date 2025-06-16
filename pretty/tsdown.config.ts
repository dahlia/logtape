import type { TsDownConfig } from "@alcalzone/tsdown";

const config: TsDownConfig = {
  entryPoints: ["./mod.ts"],
  outDir: "./dist",
  formats: ["esm", "cjs"],
  platform: "node",
  target: "es2022",
  declaration: true,
};

export default config;
