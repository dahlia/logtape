import { mkdir, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { run } from "./run.ts";
import { getPackages, root } from "./workspace.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--report")) {
  throw new Error("Usage: node scripts/run-node-tests.ts [--report]");
}
const report = args.includes("--report");
const reports = join(root, "coverage/junit");
if (report) {
  await rm(reports, { recursive: true, force: true });
  await mkdir(reports, { recursive: true });
}
const pathKey =
  Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
  "PATH";
let count = 0;
for (const pkg of await getPackages()) {
  const script = pkg.metadata.scripts?.test;
  if (script == null) continue;
  // Keep package.json as the single definition of Node test flags. Build all
  // packages before collecting coverage; standalone pnpm clears coverage env.
  const command = /^tsdown && node ((?:--[\w-]+(?:=[^\s]+)?\s*)+)$/.exec(
    script,
  );
  if (command == null) {
    throw new Error(
      `Unsupported test script for ${pkg.metadata.name}: ${script}`,
    );
  }
  const nodeArgs = command[1].trim().split(/\s+/);
  if (!nodeArgs.includes("--test")) {
    throw new Error(`Missing Node test runner: ${pkg.metadata.name}`);
  }
  if (report) {
    const name = pkg.metadata.name.replace(/^@/, "").replaceAll("/", "-");
    nodeArgs.push(
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=junit",
      `--test-reporter-destination=${join(reports, `${name}.xml`)}`,
    );
  }
  console.log(`\nTesting ${pkg.metadata.name}`);
  await run(process.execPath, nodeArgs, {
    cwd: pkg.directory,
    env: {
      ...process.env,
      [pathKey]: `${join(pkg.directory, "node_modules/.bin")}${delimiter}${process.env[pathKey] ?? ""}`,
      npm_lifecycle_event: "test",
      npm_lifecycle_script: script,
      npm_package_name: pkg.metadata.name,
      npm_package_json: join(pkg.directory, "package.json"),
      INIT_CWD: root,
    },
  });
  count++;
}
if (count === 0) throw new Error("No npm package test scripts were selected.");
console.log(`Tested ${count} npm packages.`);
