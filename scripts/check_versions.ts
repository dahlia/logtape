import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import metadata from "../deno.json" with { type: "json" };

const root = dirname(import.meta.dirname!);
const versions: Record<string, string> = {};

for (const member of metadata.workspace) {
  const file = join(root, member, "deno.json");
  const json = await readFile(file, "utf8");
  const data = JSON.parse(json);
  if ("version" in data) {
    versions[join(member, "deno.json")] = data.version;
  }

  const packageJson = join(root, member, "package.json");
  try {
    const json2 = await readFile(packageJson, "utf8");
    const data2 = JSON.parse(json2);
    if ("version" in data2) {
      versions[join(member, "package.json")] = data2.version;
    }
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }
}
let version: string | undefined;

for (const file in versions) {
  if (version != null && versions[file] !== version) {
    console.error("Versions are inconsistent:");
    for (const file in versions) {
      console.error(`  ${file}: ${versions[file]}`);
    }
    process.exit(1);
  }
  version = versions[file];
}
