let fs = null;
if (
  "process" in globalThis && "versions" in globalThis.process &&
    "node" in globalThis.process.versions &&
    typeof globalThis.caches === "undefined" &&
    typeof globalThis.addEventListener !== "function" ||
  "Bun" in globalThis
) {
  try {
    // Intentionally confuse static analysis of bundlers:
    fs = require(`${["node", "fs"].join(":")}`);
  } catch (_) {
    fs = null;
  }
}

module.exports = fs;
