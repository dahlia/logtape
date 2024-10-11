let fs = null;
if (
  typeof window === "undefined" && (
    "process" in globalThis && "versions" in globalThis.process &&
      "node" in globalThis.process.versions &&
      typeof globalThis.caches === "undefined" &&
      typeof globalThis.addEventListener !== "function" ||
    "Bun" in globalThis
  )
) {
  try {
    // Intentionally confuse static analysis of bundlers:
    const $require = [require];
    fs = $require[0](`${["node", "fs"].join(":")}`);
  } catch {
    fs = null;
  }
}

module.exports = fs;
