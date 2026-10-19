import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import ts from "typescript";
import metadata from "../deno.json" with { type: "json" };
import { canonicalPath, createCheckHost } from "./module-resolution.ts";
import { getPackages, root } from "./workspace.ts";

const configPath = join(root, "tsconfig.check.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) fail([config.error]);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (parsed.errors.length) fail(parsed.errors);
const checked = new Set<string>();
const extensions = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
check(parsed.fileNames, { ...parsed.options, erasableSyntaxOnly: true });

for (const pkg of await getPackages()) {
  const paths: Record<string, string[]> = {};
  for (const [name, conditions] of Object.entries(pkg.metadata.imports ?? {})) {
    const target = importType(conditions);
    if (target == null) continue;
    if (!target.startsWith("./dist/") || !target.endsWith(".d.ts")) {
      throw new Error(`Unsupported types target: ${pkg.metadata.name} ${name}`);
    }
    const source = target
      .replace(/^\.\/dist\//, "./src/")
      .replace(/\.d\.ts$/, ".ts");
    if (!existsSync(join(pkg.directory, source))) {
      throw new Error(
        `Missing source for ${pkg.metadata.name} ${name}: ${source}`,
      );
    }
    paths[name] = [source];
  }
  const files = ts.sys.readDirectory(
    pkg.directory,
    extensions,
    ["**/node_modules/**", "**/dist/**"],
    ["src/**/*", ...extensions.map((extension) => `*${extension}`)],
  );
  const options: ts.CompilerOptions = {
    ...parsed.options,
    baseUrl: pkg.directory,
    paths,
    types: [
      "node",
      "deno",
      ...([
        "@logtape/testing-bun",
        "@logtape/windows-eventlog",
        "@logtape/elysia",
      ].includes(pkg.metadata.name)
        ? ["bun"]
        : []),
    ],
  };
  check(files, options);
  if (pkg.metadata.name === "@logtape/logtape") {
    check([join(pkg.directory, "src/formatter.ts")], {
      ...options,
      types: ["node"],
      lib: ["lib.esnext.d.ts"],
    });
  }
}
check(
  ts.sys.readDirectory(
    join(root, "benchmarks"),
    extensions,
    ["**/node_modules/**"],
    ["*"],
  ),
  parsed.options,
);
await checkInventory();
console.log(`Checked ${checked.size} local source and test files.`);

function check(files: readonly string[], options: ts.CompilerOptions): void {
  const host = createCheckHost(options);
  const program = ts.createProgram([...files], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) fail(diagnostics);
  const included = new Set(
    program.getSourceFiles().map((file) => canonicalPath(file.fileName)),
  );
  for (const file of files) {
    if (!included.has(canonicalPath(file)))
      throw new Error(`Unchecked source file: ${file}`);
    checked.add(canonicalPath(file));
  }
}

async function checkInventory(): Promise<void> {
  const exclusions: string[] = [...metadata.exclude, "packages/testing-deno/"];
  for (const member of metadata.workspace) {
    const contents = await readFile(join(root, member, "deno.json"), "utf8");
    const memberConfig = JSON.parse(contents) as {
      exclude?: readonly string[];
    };
    for (const pattern of memberConfig.exclude ?? []) {
      exclusions.push(posix.join(member, pattern));
    }
  }
  // Include new source files while respecting Git's generated-output ignores.
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...extensions.map((extension) => `*${extension}`),
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  for (const file of files.split("\0").filter(Boolean)) {
    if (!existsSync(join(root, file))) continue;
    const parts = file.split("/");
    const ancestors = parts.map((_, index) =>
      parts.slice(0, index + 1).join("/"),
    );
    // Directory exclusions also cover hidden descendants such as .vitepress.
    if (
      exclusions.some((pattern) =>
        ancestors.some((ancestor) =>
          posix.matchesGlob(ancestor, pattern.replace(/\/$/, "")),
        ),
      )
    )
      continue;
    if (!checked.has(canonicalPath(join(root, file)))) {
      throw new Error(`Source file has no Node check project: ${file}`);
    }
  }
}

function importType(value: unknown): string | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const conditions = value as Record<string, unknown>;
  if (typeof conditions.types === "string") return conditions.types;
  if (conditions.types != null && typeof conditions.types === "object") {
    const target = (conditions.types as Record<string, unknown>).import;
    if (typeof target === "string") return target;
  }
  return undefined;
}

function fail(diagnostics: readonly ts.Diagnostic[]): never {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (path) => path,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
