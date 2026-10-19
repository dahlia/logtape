import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./run.ts";
import { getPackages, root } from "./workspace.ts";

const packages = await getPackages();
// tsdown's default clean can leave obsolete or hidden files behind.
for (const pkg of packages) {
  await rm(join(pkg.directory, "dist"), { recursive: true, force: true });
}
await run(
  "pnpm",
  ["--filter", "./packages/*", "--fail-if-no-match", "run", "-r", "build"],
  { cwd: root },
);

// A shell/filter mismatch must not turn a skipped build into success.
for (const pkg of packages) {
  for (const target of exportPaths(pkg.metadata.exports)) {
    if (!target.startsWith("./dist/")) continue;
    if (!(await stat(join(pkg.directory, target))).isFile()) {
      throw new Error(`Missing build output: ${pkg.metadata.name} ${target}`);
    }
  }
}

function exportPaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value == null || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportPaths);
}
