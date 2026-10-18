import type { SpawnOptions } from "node:child_process";
// @ts-types="npm:@types/cross-spawn@6.0.6"
import spawn from "cross-spawn";

/** Run a development command, rejecting spawn, exit, and signal failures. */
export async function run(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): Promise<void> {
  const child = spawn(command, [...args], { stdio: "inherit", ...options });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${signal ?? code}`));
    });
  });
}
