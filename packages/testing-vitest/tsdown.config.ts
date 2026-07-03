import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "src/mod.ts",
    dts: {
      sourcemap: true,
    },
    external: ["vitest"],
    format: ["esm"],
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
      "node:async_hooks",
      "vitest",
    ],
    format: ["esm"],
    platform: "neutral",
  },
]);
