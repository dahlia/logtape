import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { info } from "../../logtape/src/fixtures.ts";

type FileSinks = Pick<
  typeof import("@logtape/file"),
  "getFileSink" | "getRotatingFileSink" | "getTimeRotatingFileSink"
>;

function checkFileSinks(sinks: FileSinks): void {
  const directory = fs.mkdtempSync(join(tmpdir(), "logtape-entrypoints-"));
  const options = { formatter: () => "entry point works\n", flushInterval: 0 };
  try {
    const factories = {
      "file.log": () => sinks.getFileSink(join(directory, "file.log"), options),
      "rotating.log": () =>
        sinks.getRotatingFileSink(join(directory, "rotating.log"), options),
      "time.log": () =>
        sinks.getTimeRotatingFileSink({
          ...options,
          directory,
          filename: () => "time.log",
        }),
    };
    for (const [filename, create] of Object.entries(factories)) {
      const sink = create();
      try {
        sink(info);
      } finally {
        sink[Symbol.dispose]();
      }
      assert.strictEqual(
        fs.readFileSync(join(directory, filename), "utf8"),
        "entry point works\n",
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("@logtape/file root exports working file sinks", async () => {
  checkFileSinks(await import("@logtape/file"));
});
