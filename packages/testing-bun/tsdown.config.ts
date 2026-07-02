import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "src/mod.ts",
    dts: {
      sourcemap: true,
    },
    external: ["bun:test"],
    format: ["esm", "cjs"],
    platform: "neutral",
    unbundle: true,
  },
  {
    entry: "src/autoload.ts",
    clean: false,
    dts: {
      sourcemap: true,
    },
    external: [
      "@logtape/logtape",
      "@logtape/testing",
      "@logtape/testing/reporter",
      "bun:test",
      "node:async_hooks",
    ],
    format: ["esm", "cjs"],
    platform: "neutral",
  },
]);
