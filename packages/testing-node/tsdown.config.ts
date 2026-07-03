import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "src/mod.ts",
    dts: {
      sourcemap: true,
    },
    format: ["esm", "cjs"],
    platform: "node",
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
      "node:test",
    ],
    format: ["esm", "cjs"],
    platform: "node",
  },
]);
