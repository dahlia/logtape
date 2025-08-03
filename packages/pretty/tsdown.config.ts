import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/mod.ts", "src/util.ts", "src/util.deno.ts", "src/util.node.ts"],
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
        ["node:util", "#util"].includes(
          log.exporter ?? "",
        )
      ) {
        return;
      }
      defaultHandler(level, log);
    },
  },
});
