import { dirname, join } from "@std/path";
import metadata from "../deno.json" with { type: "json" };

const root = dirname(import.meta.dirname!);
const versions: Record<string, string> = {};

for (const member of metadata.workspace) {
  const file = join(root, member, "deno.json");
  const json = await Deno.readTextFile(file);
  const data = JSON.parse(json);
  if ("version" in data) {
    versions[join(member, "deno.json")] = data.version;
  }

  const file2 = join(root, member, "package.json");
  const json2 = await Deno.readTextFile(file2);
  const data2 = JSON.parse(json2);
  if ("version" in data2) {
    versions[join(member, "package.json")] = data2.version;
  }
}
let version: string | undefined;

for (const file in versions) {
  if (version != null && versions[file] !== version) {
    console.error("Versions are inconsistent:");
    for (const file in versions) {
      console.error(`  ${file}: ${versions[file]}`);
    }
    Deno.exit(1);
  }
  version = versions[file];
}
