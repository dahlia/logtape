import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["mod.ts", "util.ts", "util.deno.ts", "util.node.ts"],
  dts: {
    sourcemap: true,
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  unbundle: true,
  inputOptions: {
    onLog(level, log, defaultHandler) {
      if (
        level === "warn" && log.code === "UNRESOLVED_IMPORT" &&
        ["node:async_hooks", "node:util", "consolemock", "#util"].includes(
          log.exporter ?? "",
        )
      ) {
        return;
      }
      defaultHandler(level, log);
    },
  },
});
