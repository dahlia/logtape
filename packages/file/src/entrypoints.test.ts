import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";
import test from "node:test";
import { isDeno } from "@david/which-runtime";
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

test("@logtape/file root exports support custom rotation paths", async () => {
  const { getRotatingFileSink } = await import("@logtape/file");
  const directory = fs.mkdtempSync(join(tmpdir(), "logtape-entrypoints-"));
  const path = join(directory, "app.log");
  let payload = "A\n";
  try {
    const sink = getRotatingFileSink(path, {
      maxSize: 2,
      maxFiles: 1,
      bufferSize: 0,
      flushInterval: 0,
      formatter: () => payload,
      rotatedFilePath: (path, index) =>
        path.replace(/(\.log)?$/, `.${index}$1`),
    });
    try {
      sink(info);
      payload = "B\n";
      sink(info);
    } finally {
      sink[Symbol.dispose]();
    }
    assert.strictEqual(fs.readFileSync(path, "utf8"), "B\n");
    assert.strictEqual(
      fs.readFileSync(join(directory, "app.1.log"), "utf8"),
      "A\n",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

for (const policy of ["create", "enforce"] as const) {
  for (const nonBlocking of [false, true]) {
    test(`rotating file mode ${policy} (nonBlocking: ${nonBlocking})`, async () => {
      const { getRotatingFileSink } = await import("@logtape/file");
      const directory = fs.mkdtempSync(join(tmpdir(), "logtape-file-mode-"));
      const path = join(directory, "app.log");
      const options = { fileMode: 0o600, fileModePolicy: policy, nonBlocking };
      try {
        if (
          platform === "win32" ||
          (policy === "enforce" &&
            (isDeno || (platform !== "darwin" && platform !== "linux")))
        ) {
          assert.throws(
            () =>
              getRotatingFileSink(path, {
                ...options,
                rotatedFilePath() {
                  assert.fail("must reject before computing backup paths");
                },
              }),
            /POSIX|file mode policy/,
          );
          assert.strictEqual(fs.existsSync(path), false);
          return;
        }

        fs.writeFileSync(path, "A\n");
        fs.chmodSync(path, 0o644);
        const rotating = {
          ...options,
          maxFiles: 1,
          maxSize: 2,
          bufferSize: 0,
          flushInterval: 0,
          formatter: () => "B\n",
        };
        const expectedMode = policy === "enforce" ? 0o600 : 0o644;
        if (nonBlocking) {
          await using sink = getRotatingFileSink(path, {
            ...rotating,
            nonBlocking,
          });
          assert.strictEqual(fs.statSync(path).mode & 0o777, expectedMode);
          sink(info);
        } else {
          using sink = getRotatingFileSink(path, rotating);
          assert.strictEqual(fs.statSync(path).mode & 0o777, expectedMode);
          sink(info);
        }
        assert.strictEqual(fs.readFileSync(path, "utf8"), "B\n");
        assert.strictEqual(fs.readFileSync(`${path}.1`, "utf8"), "A\n");
        assert.strictEqual(fs.statSync(`${path}.1`).mode & 0o777, expectedMode);
        const newMode = fs.statSync(path).mode & 0o777;
        if (policy === "enforce") assert.strictEqual(newMode, 0o600);
        else assert.strictEqual(newMode & ~0o600, 0);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
