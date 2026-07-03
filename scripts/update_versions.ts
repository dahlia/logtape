import { dirname, join } from "@std/path";
import metadata from "../deno.json" with { type: "json" };

const root = dirname(import.meta.dirname!);

if (Deno.args.length < 1) {
  console.error("error: no argument");
  console.error("usage: deno task update-versions VERSION");
  Deno.exit(1);
}

const version = Deno.args[0];

for (const member of metadata.workspace) {
  const file = join(root, member, "deno.json");
  const json = await Deno.readTextFile(file);
  const data = JSON.parse(json);
  if ("version" in data) {
    data.version = version;
    await Deno.writeTextFile(file, `${JSON.stringify(data, undefined, 2)}\n`);
  }

  const packageJson = join(root, member, "package.json");
  try {
    const json2 = await Deno.readTextFile(packageJson);
    const data2 = JSON.parse(json2);
    if ("version" in data2) {
      data2.version = version;
      await Deno.writeTextFile(
        packageJson,
        `${JSON.stringify(data2, undefined, 2)}\n`,
      );
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}
