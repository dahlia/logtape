import { build, emptyDir } from "@deno/dnt";
import metadata from "./deno.json" with { type: "json" };

await emptyDir("./npm");

await build({
  package: {
    name: "@logtape/logtape",
    version: Deno.args[0] ?? metadata.version,
    description: "Simple logging library with zero dependencies for " +
      "Deno/Node.js/Bun/browsers",
    keywords: ["logging", "log", "logger"],
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
    },
    bugs: {
      url: "https://github.com/dahlia/logtape/issues",
    },
    funding: [
      "https://github.com/sponsors/dahlia",
    ],
  },
  outDir: "./npm",
  entryPoints: ["./logtape/mod.ts"],
  importMap: "./deno.json",
  mappings: {
    "./logtape/filesink.jsr.ts": "./logtape/filesink.node.ts",
    "./logtape/filesink.deno.ts": "./logtape/filesink.node.ts",
    "./logtape/fs.ts": "./logtape/fs.js",
  },
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
    await Deno.writeTextFile(
      "npm/esm/fs.js",
      'import fs from "./fs.cjs";\nexport default fs;\n',
    );
    await Deno.copyFile("logtape/fs.cjs", "npm/esm/fs.cjs");
    await Deno.copyFile("logtape/fs.cjs", "npm/script/fs.js");
    await Deno.writeTextFile(
      "npm/esm/nodeUtil.js",
      'import util from "./nodeUtil.cjs";\nexport default util;\n',
    );
    await Deno.copyFile("logtape/nodeUtil.cjs", "npm/esm/nodeUtil.cjs");
    await Deno.copyFile("logtape/nodeUtil.cjs", "npm/script/nodeUtil.js");
    await Deno.copyFile("LICENSE", "npm/LICENSE");
    await Deno.copyFile("README.md", "npm/README.md");
  },
});

// cSpell: ignore Minhee filesink
