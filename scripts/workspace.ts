import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import metadata from "../deno.json" with { type: "json" };

export const root = dirname(import.meta.dirname!);

/** npm members of the dual workspace, excluding JSR-only members. */
export interface Package {
  readonly directory: string;
  readonly metadata: {
    readonly name: string;
    readonly scripts?: Readonly<Record<string, string>>;
    readonly imports?: Readonly<Record<string, unknown>>;
    readonly exports?: unknown;
  };
}

/** Read the package manifests without requiring a Deno executable. */
export async function getPackages(): Promise<readonly Package[]> {
  const packages: Package[] = [];
  for (const member of metadata.workspace) {
    const directory = join(root, member);
    if (dirname(directory) !== join(root, "packages")) continue;
    try {
      const contents = await readFile(join(directory, "package.json"), "utf8");
      packages.push({ directory, metadata: JSON.parse(contents) });
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
      // @logtape/testing-deno is deliberately JSR-only.
    }
  }
  return packages;
}
