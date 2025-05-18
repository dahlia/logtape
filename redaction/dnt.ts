import { build, emptyDir } from "@deno/dnt";
import { maxWith } from "@std/collections/max-with";
import { compare } from "@std/semver/compare";
import { format } from "@std/semver/format";
import { parse } from "@std/semver/parse";
import type { SemVer } from "@std/semver/types";
import workspace from "../deno.json" with { type: "json" };
import metadata from "./deno.json" with { type: "json" };

await emptyDir("./npm");

const version = parse(Deno.args[0] ?? metadata.version);
let minorVersion: SemVer = {
  ...version,
  patch: 0,
  prerelease: [],
  build: [],
};

const logtapeResp = await fetch("https://registry.npmjs.com/@logtape/logtape");
const logtapeData = await logtapeResp.json();
const logtapeVersions = Object.keys(logtapeData.versions);
if (!logtapeVersions.includes(format(minorVersion))) {
  minorVersion = maxWith(logtapeVersions.map(parse), compare) ?? Deno.exit(1);
}

const imports = {
  "@logtape/logtape": `npm:@logtape/logtape@^${format(minorVersion)}`,
  ...workspace.imports,
};

await Deno.writeTextFile(
  ".dnt-import-map.json",
  JSON.stringify({ imports }, undefined, 2),
);

await build({
  package: {
    name: metadata.name,
    version: format(version),
    description: "Redact sensitive data from log messages",
    keywords: [
      "logging",
      "log",
      "logger",
      "redaction",
      "mask",
      "masking",
      "sensitive",
    ],
    license: "MIT",
    author: {
      name: "Hong Minhee",
      email: "hong@minhee.org",
      url: "https://hongminhee.org/",
    },
    homepage: "https://logtape.org/",
    repository: {
      type: "git",
      url: "git+https://github.com/dahlia/logtape.git",
      directory: "file/",
    },
    bugs: {
      url: "https://github.com/dahlia/logtape/issues",
    },
    funding: [
      "https://github.com/sponsors/dahlia",
    ],
  },
  outDir: "./npm",
  entryPoints: ["./mod.ts"],
  importMap: "./.dnt-import-map.json",
  shims: {
    deno: "dev",
  },
  typeCheck: "both",
  declaration: "separate",
  declarationMap: true,
  compilerOptions: {
    lib: ["ES2021", "DOM"],
  },
  async postBuild() {
    await Deno.copyFile("../LICENSE", "npm/LICENSE");
    await Deno.copyFile("README.md", "npm/README.md");
  },
});

// cSpell: ignore Minhee filesink
