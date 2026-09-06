/** Test built npm artifacts and JSR-shaped source in isolated consumers. */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = join(root, "scripts/fixtures/elysia");
const versions = ["1.4.0", "1.4.30", "2.0.0-beta.12"];
const work = await mkdtemp(join(tmpdir(), "logtape-elysia-"));

async function run(command: string, args: string[], cwd = root): Promise<void> {
  console.log(`\n${command} ${args.join(" ")} (${cwd})`);
  const status = await new Deno.Command(command, {
    args,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: { npm_config_ignore_scripts: "true" },
  }).spawn().status;
  if (!status.success) throw new Error(`${command} exited ${status.code}`);
}

/**
 * Reuse every baseline assertion; port only native registration syntax in the
 * v2 fixture. Production compatibility helpers are never used by this port.
 */
function portV2(source: string): string {
  source = source.replaceAll(
    '.onBeforeHandle({ as: "local" },',
    '.beforeHandle("local",',
  )
    .replaceAll(".onBeforeHandle(", ".beforeHandle(")
    .replaceAll(".onParse(", ".parse(");
  const tree = ts.createSourceFile(
    "fixture.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const result = ts.transform(tree, [(context) => {
    const visit: ts.Visitor = (node) => {
      if (
        ts.isCallExpression(node) && node.expression.getText() === "test" &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text ===
          "elysiaLogger(): local scope fallback matches optional routes"
      ) {
        // This test deliberately pokes v1-only internals. Use an empty body
        // as well as skip for runtimes which ignore node:test skip options.
        return ts.factory.updateCallExpression(
          node,
          node.expression,
          node.typeArguments,
          [
            node.arguments[0],
            ts.factory.createObjectLiteralExpression([
              ts.factory.createPropertyAssignment(
                "skip",
                ts.factory.createTrue(),
              ),
            ]),
            ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              ts.factory.createBlock([]),
            ),
          ],
        );
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["get", "post", "all"].includes(node.expression.name.text) &&
        node.arguments.length === 3
      ) {
        return ts.factory.updateCallExpression(
          node,
          node.expression,
          node.typeArguments,
          [node.arguments[0], node.arguments[2], node.arguments[1]].map((arg) =>
            ts.visitNode(arg, visit) as ts.Expression
          ),
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  }]);
  const printed = ts.createPrinter().printFile(result.transformed[0]);
  result.dispose();
  return printed;
}

function javascript(source: string, commonjs: boolean): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: commonjs ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
      esModuleInterop: true,
    },
  }).outputText;
}

try {
  // Build declarations once against the default v1 dev dependency.
  await run("pnpm", [
    "--filter",
    "@logtape/logtape",
    "--filter",
    "@logtape/elysia",
    "build",
  ]);
  for (const name of ["logtape", "elysia"]) {
    await run(
      "pnpm",
      ["pack", "--out", join(work, `${name}.tgz`)],
      join(root, "packages", name),
    );
  }
  const baseline =
    (await readFile(join(root, "packages/elysia/src/mod.test.ts"), "utf8"))
      .replace('from "./mod.ts"', 'from "@logtape/elysia"');
  const types = await readFile(join(fixtures, "types.ts.txt"), "utf8");
  const v2Tests = await readFile(join(fixtures, "v2.ts.txt"), "utf8");
  for (const version of versions) {
    const v2 = version.startsWith("2.");
    const consumer = join(work, version);
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            "@logtape/logtape": `file:${join(work, "logtape.tgz")}`,
            "@logtape/elysia": `file:${join(work, "elysia.tgz")}`,
            elysia: version,
            typescript: "5.8.3",
            "@types/bun": v2 ? "1.4.1" : "1.2.16",
            "@types/node": "22.15.30",
            ...(v2
              ? {
                typebox: "1.3.27",
                "exact-mirror": "1.2.4",
                "openapi-types": "12.1.3",
              }
              : { memoirist: "0.4.0" }),
          },
        },
        null,
        2,
      ),
    );
    await run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      consumer,
    );
    const installed = join(consumer, "node_modules/@logtape/elysia");
    const metadata = JSON.parse(
      await readFile(join(installed, "package.json"), "utf8"),
    );
    assert.equal(metadata.peerDependencies.elysia, "^1.4.0 || ^2.0.0-beta.12");
    assert.equal(
      metadata.peerDependencies["@logtape/logtape"].includes("workspace:"),
      false,
    );
    for (const extension of ["js", "cjs"]) {
      const output = await readFile(
        join(installed, `dist/compat.${extension}`),
        "utf8",
      );
      assert.match(
        output,
        extension === "js"
          ? /from "elysia\/utils"/
          : /require\("elysia\/utils"\)/,
      );
      assert.doesNotMatch(
        output,
        /fnOrigin\s*=\s*(?:\/\*.*?\*\/\s*)?new WeakMap/,
      );
    }
    const suite = v2 ? portV2(baseline) : baseline;
    const typing = v2 ? portV2(types) : types;
    for (const commonjs of [false, true]) {
      const extension = commonjs ? "cjs" : "mjs";
      const files = [`baseline.test.${extension}`];
      await writeFile(join(consumer, files[0]), javascript(suite, commonjs));
      if (v2) {
        files.push(`v2.test.${extension}`);
        await writeFile(
          join(consumer, files[1]),
          javascript(v2Tests, commonjs),
        );
      }
      await writeFile(
        join(consumer, `types.${commonjs ? "cts" : "mts"}`),
        typing,
      );
      await run("node", ["--test", "--test-force-exit", ...files], consumer);
      const bunEntry = `load-${extension}.test.js`;
      await writeFile(
        join(consumer, bunEntry),
        files.map((file) => `import "./${file}";`).join("\n"),
      );
      await run("bun", ["test", `./${bunEntry}`], consumer);
    }
    await cp(
      join(fixtures, "check-types.cjs"),
      join(consumer, "check-types.cjs"),
    );
    await run("node", ["check-types.cjs"], consumer);

    // Simulate JSR's rewriting of dependency specifiers, not just bare aliases.
    const deno = join(work, `deno-${version}`);
    await mkdir(deno);
    await cp(join(root, "packages/logtape/src"), join(deno, "core"), {
      recursive: true,
    });
    for (const file of ["mod.ts", "compat.ts"]) {
      const source =
        (await readFile(join(root, "packages/elysia/src", file), "utf8"))
          .replaceAll('from "elysia"', 'from "npm:elysia@^1.4.0"')
          .replaceAll('from "elysia/utils"', 'from "npm:elysia@^1.4.0/utils"');
      await writeFile(join(deno, file), source);
    }
    await writeFile(
      join(deno, "deno.json"),
      JSON.stringify({
        imports: {
          "#util": "./core/util.deno.ts",
          "@logtape/logtape": "./core/mod.ts",
          "@logtape/elysia": "./mod.ts",
          elysia: `npm:elysia@${version}`,
          "elysia/websocket": `npm:elysia@${version}/websocket`,
          "npm:elysia@^1.4.0": `npm:elysia@${version}`,
          "npm:elysia@^1.4.0/utils": `npm:elysia@${version}/utils`,
        },
      }),
    );
    await writeFile(join(deno, "baseline.test.ts"), suite);
    await writeFile(join(deno, "types.ts"), typing);
    const tests = ["baseline.test.ts"];
    if (v2) {
      tests.push("v2.test.ts");
      await writeFile(join(deno, "v2.test.ts"), v2Tests);
    }
    await run("deno", ["check", "mod.ts", "types.ts", ...tests], deno);
    await run("deno", [
      "test",
      "--allow-env",
      "--allow-net",
      "--allow-sys",
      ...tests,
    ], deno);
  }
  console.log("Elysia compatibility matrix passed.");
  await rm(work, { recursive: true });
} catch (error) {
  console.error(`Compatibility fixtures retained at ${work}`);
  throw error;
}
