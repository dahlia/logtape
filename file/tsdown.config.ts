import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["mod.ts", "filesink.deno.ts", "filesink.node.ts"],
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
        ["node:fs", "#filesink"].includes(log.exporter ?? "")
      ) {
        return;
      }
      defaultHandler(level, log);
    },
  },
});
