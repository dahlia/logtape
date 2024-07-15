let fs = null;
if (
  "process" in globalThis && "versions" in globalThis.process &&
    "node" in globalThis.process.versions &&
    typeof globalThis.caches === "undefined" &&
    typeof globalThis.addEventListener !== "function" ||
  "Bun" in globalThis
) {
  try {
    fs = require("node" + ":fs");
  } catch (_) {
    fs = null;
  }
}

module.exports = fs;
