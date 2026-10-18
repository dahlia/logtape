import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { canonicalPath, createCheckHost } from "./module-resolution.ts";

test("createCheckHost() resolves cache-busting queries and fragments", async () => {
  for (const suffix of ["?fresh=1", "#fresh"]) {
    await withFixture(async (root) => {
      await put(root, "app/src/value.ts", "export const value = 1;");
      await put(
        root,
        "app/src/main.ts",
        `
        import { value } from "./value.ts${suffix}";
        export const result: number = value;
      `,
      );
      assert.deepStrictEqual(diagnostics(root), []);
    });
  }
});

test("createCheckHost() preserves the types of query imports", async () => {
  await withFixture(async (root) => {
    await put(root, "app/src/value.ts", "export const value = 1;");
    await put(
      root,
      "app/src/main.ts",
      `
      import { value } from "./value.ts?fresh=1";
      export const result: string = value;
    `,
    );
    assert.deepStrictEqual(
      diagnostics(root).map((item) => item.code),
      [2322],
    );
  });
});

test("createCheckHost() keeps own source and peer declaration aliases separate", async () => {
  await withFixture(async (root) => {
    await put(
      root,
      "core/package.json",
      JSON.stringify({
        type: "module",
        imports: { "#util": { types: "./dist/util.d.ts" } },
      }),
    );
    await put(
      root,
      "core/dist/util.d.ts",
      'export declare const label: "core";',
    );
    await put(root, "core/dist/probe.d.ts", 'export { label } from "#util";');
    await put(root, "app/src/util.ts", 'export const label = "app";');
    await put(
      root,
      "app/src/main.ts",
      `
      import { label as own } from "#util";
      import { label as peer } from "../../core/dist/probe.js";
      export const ownResult: "app" = own;
      export const peerResult: "core" = peer;
    `,
    );
    assert.deepStrictEqual(diagnostics(root), []);
  });
});

async function withFixture(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "logtape typecheck "));
  try {
    await put(root, "app/package.json", '{"type":"module"}');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function put(root: string, path: string, text: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

function diagnostics(root: string): readonly ts.Diagnostic[] {
  const main = join(root, "app/src/main.ts");
  const options: ts.CompilerOptions = {
    allowImportingTsExtensions: true,
    baseUrl: join(root, "app"),
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    noLib: true,
    paths: { "#util": ["./src/util.ts"] },
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
  };
  const program = ts.createProgram([main], options, createCheckHost(options));
  const source = program
    .getSourceFiles()
    .find((file) => canonicalPath(file.fileName) === canonicalPath(main));
  assert.ok(source);
  return program.getSemanticDiagnostics(source);
}
