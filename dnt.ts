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
    homepage: "https://github.com/dahlia/logtape",
    repository: {
      type: "git",
      url: "git+https://github.com/dahlia/logtape.git",
    },
    bugs: {
      url: "https://github.com/dahlia/logtape/issues",
    },
  },
  outDir: "./npm",
  entryPoints: ["./logtape/mod.ts"],
  importMap: "./deno.json",
  mappings: {
    "./logtape/filesink.jsr.ts": "./logtape/filesink.node.ts",
    "./logtape/filesink.deno.ts": "./logtape/filesink.node.ts",
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
    await Deno.copyFile("LICENSE", "npm/LICENSE");
    await Deno.copyFile("README.md", "npm/README.md");
  },
});

// cSpell: ignore Minhee filesink
