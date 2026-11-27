import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const runtime = process.argv[2];
assert.ok(runtime === "node" || runtime === "bun" || runtime === "deno");
const root = fileURLToPath(new URL("..", import.meta.url));
const work = fs.realpathSync.native(
  fs.mkdtempSync(join(tmpdir(), "logtape-file-packages-")),
);
const windows = process.platform === "win32";

function run(executable, args, cwd = work, { windowsVerbatimArguments } = {}) {
  return execFileSync(executable, args, {
    cwd,
    env: {
      ...process.env,
      LOGTAPE_FILE_PACK_DEST: work,
      // The caller builds once. Packing must not rebuild a live dist tree.
      PNPM_CONFIG_IGNORE_SCRIPTS: "true",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 30_000,
    windowsVerbatimArguments,
  });
}

function smoke(cwd, program, preamble) {
  const path = join(cwd, program);
  const logs = fs.mkdtempSync(join(work, "logs-"));
  if (!windows && runtime !== "deno") run("mkfifo", [join(logs, "fifo")]);
  fs.copyFileSync(
    join(root, "scripts/file-package-fixture.mjs"),
    join(cwd, "fixture.mjs"),
  );
  const body = program.endsWith(".cjs")
    ? `import("./fixture.mjs").then(({ checkFileModes }) =>
  checkFileModes(getRotatingFileSink)
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});\n`
    : 'import { checkFileModes } from "./fixture.mjs";\nawait checkFileModes(getRotatingFileSink);\n';
  fs.writeFileSync(path, preamble + "\n" + body);
  const previous = windows ? undefined : process.umask(0o027);
  try {
    const args =
      runtime === "deno"
        ? [
            "run",
            "--no-prompt",
            `--allow-read=${cwd},${logs}`,
            `--allow-write=${logs}`,
            path,
            logs,
          ]
        : [path, logs];
    run(runtime, args, cwd);
  } finally {
    if (previous !== undefined) process.umask(previous);
  }
}

try {
  const npm = join(work, "npm");
  const packages = ["logtape", "file"];
  fs.mkdirSync(npm);
  for (const name of packages) {
    const cwd = join(root, "packages", name);
    // Run pack in the workspace so pnpm resolves workspace peer versions.
    // The Windows shim may be a batch file. Let cmd.exe parse the fixed
    // command so Node does not escape the quotes around the destination.
    const pack = windows
      ? run(
          "cmd.exe",
          [
            "/d",
            "/c",
            'pnpm pack --pack-destination "%LOGTAPE_FILE_PACK_DEST%"',
          ],
          cwd,
          { windowsVerbatimArguments: true },
        )
      : run("pnpm", ["pack", "--pack-destination", work], cwd);
    const tarball = pack.trim().split(/\r?\n/).at(-1);
    assert.ok(tarball?.endsWith(".tgz"), pack);
    const installed = join(npm, "node_modules", "@logtape", name);
    fs.mkdirSync(installed, { recursive: true });
    run(
      "tar",
      ["-xf", tarball, "--strip-components", "1", "-C", installed],
      cwd,
    );
  }
  fs.writeFileSync(
    join(npm, "package.json"),
    JSON.stringify({ name: "file-package-smoke", private: true }),
  );
  if (runtime === "deno") {
    fs.writeFileSync(join(npm, "deno.json"), '{"nodeModulesDir":"manual"}');
  }
  smoke(
    npm,
    "import.mjs",
    'import { getRotatingFileSink } from "@logtape/file";',
  );
  if (runtime !== "bun") {
    smoke(
      npm,
      "require.cjs",
      'const { getRotatingFileSink } = require("@logtape/file");',
    );
  }
  if (runtime === "node") {
    const call =
      'getRotatingFileSink("app.log", { fileMode: 0o600, fileModePolicy: "enforce" });\n';
    fs.writeFileSync(
      join(npm, "types.mts"),
      'import { getRotatingFileSink } from "@logtape/file";\n' + call,
    );
    fs.writeFileSync(
      join(npm, "types.cts"),
      'import file = require("@logtape/file");\nconst { getRotatingFileSink } = file;\n' +
        call,
    );
    run(
      process.execPath,
      [
        join(root, "node_modules", "typescript", "bin", "tsc"),
        "--noEmit",
        "--strict",
        "--module",
        "nodenext",
        "--target",
        "esnext",
        "types.mts",
        "types.cts",
      ],
      npm,
    );
  }
  if (runtime === "deno") {
    const jsr = join(work, "jsr");
    const { imports } = JSON.parse(
      fs.readFileSync(join(root, "deno.json"), "utf8"),
    );
    for (const name of packages) {
      const source = join(root, "packages", name);
      const target = join(jsr, name);
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(join(source, "deno.json"), join(target, "deno.json"));
      fs.cpSync(join(source, "src"), join(target, "src"), { recursive: true });
    }
    fs.writeFileSync(
      join(jsr, "deno.json"),
      JSON.stringify({ workspace: ["./logtape", "./file"], imports }),
    );
    smoke(
      jsr,
      "import.mjs",
      'import { getRotatingFileSink } from "@logtape/file";',
    );
  }
  console.log(
    `File package smoke passed for ${runtime} on ${process.platform}.`,
  );
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
