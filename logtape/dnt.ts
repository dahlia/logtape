import { build, emptyDir } from "@deno/dnt";
import metadata from "./deno.json" with { type: "json" };

await emptyDir("./npm");

await build({
  package: {
    name: metadata.name,
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
      directory: "logtape/",
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
  importMap: "../deno.json",
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
      "npm/esm/nodeUtil.js",
      'import util from "./nodeUtil.cjs";\nexport default util;\n',
    );
    await Deno.copyFile("nodeUtil.cjs", "npm/esm/nodeUtil.cjs");
    await Deno.copyFile("nodeUtil.cjs", "npm/script/nodeUtil.js");
    await Deno.copyFile("../LICENSE", "npm/LICENSE");
    await Deno.copyFile("README.md", "npm/README.md");
  },
});

// cSpell: ignore Minhee filesink
