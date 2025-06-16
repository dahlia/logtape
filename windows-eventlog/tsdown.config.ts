import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["mod.ts", "sink.node.ts", "sink.deno.ts", "sink.bun.ts"],
  dts: {
    sourcemap: true,
  },
  format: ["esm", "cjs"],
  platform: "node",
  unbundle: true,
  inputOptions: {
    onLog(level, log, defaultHandler) {
      if (
        level === "warn" && log.code === "UNRESOLVED_IMPORT" &&
        ["bun:ffi", "#wineventlog"].includes(log.exporter ?? "")
      ) {
        return;
      }
      defaultHandler(level, log);
    },
  },
});
