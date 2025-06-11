import { dirname, join } from "@std/path";
import metadata from "../deno.json" with { type: "json" };

const root = dirname(import.meta.dirname!);

if (Deno.args.length < 1) {
  console.error("error: no argument");
  Deno.exit(1);
}

const version = Deno.args[0];

for (const member of metadata.workspace) {
  const file = join(root, member, "deno.json");
  const json = await Deno.readTextFile(file);
  const data = JSON.parse(json);
  data.version = version;
  await Deno.writeTextFile(file, `${JSON.stringify(data, undefined, 2)}\n`);

  const file2 = join(root, member, "package.json");
  const json2 = await Deno.readTextFile(file2);
  const data2 = JSON.parse(json2);
  data2.version = version;
  await Deno.writeTextFile(file2, `${JSON.stringify(data2, undefined, 2)}\n`);
}
