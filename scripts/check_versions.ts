import { dirname, join } from "@std/path";
import metadata from "../deno.json" with { type: "json" };

const root = dirname(import.meta.dirname!);
const versions: Record<string, string> = {};

for (const member of metadata.workspace) {
  const file = join(root, member, "deno.json");
  const json = await Deno.readTextFile(file);
  const data = JSON.parse(json);
  versions[join(member, "deno.json")] = data.version;
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
