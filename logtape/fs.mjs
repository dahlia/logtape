let fs = null;
if (
  "process" in globalThis && "versions" in globalThis.process &&
    "node" in globalThis.process.versions &&
    typeof globalThis.caches === "undefined" &&
    typeof globalThis.addEventListener !== "function" ||
  "Bun" in globalThis
) {
  try {
    fs = await import("node" + ":fs");
  } catch (e) {
    if (e instanceof TypeError) {
      fs = null;
    } else {
      throw e;
    }
  }
}

export default fs;
