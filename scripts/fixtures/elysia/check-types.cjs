// Compare dependency diagnostics with a native Elysia-only consumer. Do not
// skip declaration checking: adapter/fixture diagnostics always fail, as do
// dependency errors which only appear when the adapter is imported.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const options = {
  noEmit: true,
  strict: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  types: ["bun"],
};
function diagnostics(files) {
  return ts.getPreEmitDiagnostics(ts.createProgram(files, options));
}
function key(diagnostic) {
  return JSON.stringify([
    diagnostic.file?.fileName,
    diagnostic.start,
    diagnostic.code,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  ]);
}
fs.writeFileSync(
  "native.mts",
  'import { Elysia } from "elysia"; new Elysia();\n',
);
fs.writeFileSync(
  "native.cts",
  'import { Elysia } from "elysia"; new Elysia();\n',
);
const native = new Set(diagnostics(["native.mts", "native.cts"]).map(key));
const actual = diagnostics(["types.mts", "types.cts"]);
const unexpected = actual.filter((diagnostic) => {
  const file = diagnostic.file?.fileName ?? "";
  const dependency = file.includes(`${path.sep}node_modules${path.sep}`) &&
    !file.includes(`${path.sep}@logtape${path.sep}`);
  return !dependency || !native.has(key(diagnostic));
});
if (unexpected.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(unexpected, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }));
}
assert.equal(unexpected.length, 0, "New consumer/declaration type errors");
console.log(
  `Consumer types passed; ${actual.length} unchanged upstream diagnostics.`,
);
