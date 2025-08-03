import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/mod.ts",
    "src/sink.node.ts",
    "src/sink.deno.ts",
    "src/sink.bun.ts",
  ],
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
