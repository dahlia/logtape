import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/mod.ts", "src/filesink.deno.ts", "src/filesink.node.ts"],
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
        log.exporter === "#filesink"
      ) {
        return;
      }
      defaultHandler(level, log);
    },
  },
});
