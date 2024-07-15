let fs = null;
if (
  // @ts-ignore: process is a global variable
  "process" in globalThis && "versions" in globalThis.process &&
    // @ts-ignore: process is a global variable
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
