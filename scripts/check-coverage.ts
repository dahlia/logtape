import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { root } from "./workspace.ts";

const report = join(root, "coverage/node");
const coverage: unknown = JSON.parse(
  await readFile(join(report, "coverage-final.json"), "utf8"),
);
assert.ok(
  coverage != null && typeof coverage === "object" && !Array.isArray(coverage),
);
const files = Object.keys(coverage);
assert.ok(files.length > 0, "Node coverage report contains no source files.");
for (const file of files) {
  assert.ok((await stat(file)).isFile(), file);
  const parts = relative(root, file).split(sep);
  assert.ok(parts[0] === "packages" && parts[2] === "src", file);
  assert.ok(!file.endsWith(".test.ts") && !file.endsWith(".d.ts"), file);
}
assert.match(await readFile(join(report, "lcov.info"), "utf8"), /^SF:/m);
assert.ok((await stat(join(report, "index.html"))).isFile());
console.log(
  `Node coverage contains ${files.length} source files (HTML, LCOV, JSON).`,
);
