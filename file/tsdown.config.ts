import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "mod.ts",
    "filesink.deno.ts",
    "filesink.node.ts",
    "workersink.deno.ts",
    "workersink.node.ts",
    "workersink.bun.ts",
    "worker.deno.ts",
    "worker.node.ts",
    "worker.bun.ts",
    "worker_spawn.deno.ts",
    "worker_spawn.node.ts",
    "worker_spawn.bun.ts",
    "worker_factory.deno.ts",
    "worker_factory.bun.ts",
    "worker_factory.node.ts",
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
        ["#filesink", "#workersink", "#worker_spawn", "#worker_factory"]
          .includes(
            log.exporter ?? "",
          )
      ) {
        return;
      }
      defaultHandler(level, log);
    },
  },
});
