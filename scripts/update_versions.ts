import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import metadata from "../deno.json" with { type: "json" };

const root = dirname(import.meta.dirname!);

if (process.argv.length < 3) {
  console.error("error: no argument");
  console.error("usage: mise run update-versions VERSION");
  process.exit(1);
}

const version = process.argv[2];

for (const member of metadata.workspace) {
  const file = join(root, member, "deno.json");
  const json = await readFile(file, "utf8");
  const data = JSON.parse(json);
  if ("version" in data) {
    data.version = version;
    await writeFile(file, `${JSON.stringify(data, undefined, 2)}\n`);
  }

  const packageJson = join(root, member, "package.json");
  try {
    const json2 = await readFile(packageJson, "utf8");
    const data2 = JSON.parse(json2);
    if ("version" in data2) {
      data2.version = version;
      await writeFile(packageJson, `${JSON.stringify(data2, undefined, 2)}\n`);
    }
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }
}
