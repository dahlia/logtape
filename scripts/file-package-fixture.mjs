import assert from "node:assert/strict";
import fs from "node:fs";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import process from "node:process";

export async function checkFileModes(getRotatingFileSink) {
  const directory = process.argv.at(-1);
  const isDeno = "Deno" in globalThis;
  const mode = (path) => fs.statSync(path).mode & 0o7777;
  const path = join(directory, "active");
  const newPath = join(directory, "new");
  const backup = `${path}.1`;
  const fileMode = 0o640;
  const formatter = () => "B\n";
  const record = {
    category: ["smoke"],
    level: "info",
    message: ["B"],
    rawMessage: "B",
    properties: {},
    timestamp: 0,
  };

  if (process.platform === "win32" || isDeno) {
    const rotatedFilePath = () =>
      assert.fail("called before platform validation");
    assert.throws(
      () =>
        getRotatingFileSink(path, {
          fileMode,
          fileModePolicy: "enforce",
          rotatedFilePath,
        }),
      /file mode policy|require POSIX/,
    );
    if (process.platform === "win32") {
      assert.throws(
        () => getRotatingFileSink(path, { fileMode, rotatedFilePath }),
        /require POSIX/,
      );
    }
    assert.strictEqual(fs.existsSync(path), false);
  }

  const fallback = getRotatingFileSink(path, { formatter });
  fallback(record);
  fallback[Symbol.dispose]();
  assert.strictEqual(fs.readFileSync(path, "utf8"), "B\n");

  if (process.platform !== "win32") {
    for (const policy of isDeno ? ["create"] : ["create", "enforce"]) {
      for (const nonBlocking of [false, true]) {
        // The runner supplies umask 027, which removes the other-read bit.
        const options = {
          fileMode: 0o644,
          fileModePolicy: policy,
          nonBlocking,
          formatter,
        };
        const expected = policy === "create" ? 0o640 : 0o644;
        const fresh = getRotatingFileSink(newPath, options);
        assert.strictEqual(mode(newPath), expected);
        if (nonBlocking) await fresh[Symbol.asyncDispose]();
        else fresh[Symbol.dispose]();
        fs.unlinkSync(newPath);

        for (const maxFiles of [0, 1]) {
          fs.writeFileSync(path, "A\n");
          fs.chmodSync(path, 0o664);
          const sink = getRotatingFileSink(path, {
            ...options,
            maxFiles,
            maxSize: 2,
            bufferSize: 0,
            flushInterval: 0,
          });
          const oldMode = policy === "create" ? 0o664 : 0o644;
          assert.strictEqual(mode(path), oldMode);
          sink(record);
          if (nonBlocking) await sink[Symbol.asyncDispose]();
          else sink[Symbol.dispose]();
          assert.strictEqual(fs.readFileSync(path, "utf8"), "B\n");
          assert.strictEqual(mode(path), expected);
          if (maxFiles === 0) assert.strictEqual(fs.existsSync(backup), false);
          else {
            assert.strictEqual(fs.readFileSync(backup, "utf8"), "A\n");
            assert.strictEqual(mode(backup), oldMode);
            fs.unlinkSync(backup);
          }
        }
      }
    }
  }

  if (process.platform !== "win32" && !isDeno) {
    const link = join(directory, "link");
    const dangling = join(directory, "dangling");
    fs.symlinkSync(path, link);
    fs.symlinkSync(newPath, dangling);
    fs.chmodSync(path, 0o664);
    const createThroughLink = getRotatingFileSink(link, { fileMode });
    createThroughLink[Symbol.dispose]();
    assert.strictEqual(mode(path), 0o664);

    const enforce = { fileMode, fileModePolicy: "enforce" };
    for (const alias of [link, dangling]) {
      assert.throws(() => getRotatingFileSink(alias, enforce), {
        code: "ELOOP",
      });
    }
    assert.strictEqual(mode(path), 0o664);
    assert.strictEqual(fs.existsSync(newPath), false);

    const fifo = join(directory, "fifo");
    fs.chmodSync(fifo, 0o660);
    assert.throws(() => getRotatingFileSink(fifo, enforce), { code: "ENXIO" });
    const reader = fs.openSync(
      fifo,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
    );
    try {
      assert.throws(() => getRotatingFileSink(fifo, enforce), /regular file/);
      assert.strictEqual(mode(fifo), 0o660);
      assert.strictEqual(fs.readSync(reader, Buffer.alloc(1)), 0);
    } finally {
      fs.closeSync(reader);
    }
  }
}
