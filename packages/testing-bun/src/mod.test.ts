import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const modUrl = pathToFileURL(join(packageRoot, "src", "mod.ts")).href;
const autoloadUrl = pathToFileURL(join(packageRoot, "src", "autoload.ts"))
  .href;
const logtapeSpecifier = "@logtape/logtape";
const canRunBun = await canRunBunSubprocess();

function test(
  name: string,
  fn: () => unknown | Promise<unknown>,
): void {
  nodeTest(name, { skip: !canRunBun }, async () => {
    if (!canRunBun) return;
    await fn();
  });
}

test("createTest(): reports logs from failed tests", async () => {
  const result = await runBunTest(`
    import { expect } from "bun:test";
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      lowestLevel: "debug",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("expected failure", () => {
      getLogger(["app"]).debug("Before failure.");
      expect(true).toBe(false);
    });
  `);

  assert.notStrictEqual(result.code, 0);
  assert.match(result.output, /reported:Before failure\./);
});

test("createTest(): discards logs from passing tests", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      lowestLevel: "debug",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("passing test", () => {
      getLogger(["app"]).debug("Discarded diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.doesNotMatch(result.output, /reported:Discarded diagnostic\./);
});

test("createTest(): reports passing tests in always mode", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("passing test", () => {
      getLogger(["app"]).info("Always reported.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Always reported\./);
});

test("createTest(): preserves timeout and retry options", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    let attempts = 0;
    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("retrying test", () => {
      attempts++;
      if (attempts === 1) throw new Error("try again");
      getLogger(["app"]).info("Retried diagnostic.");
    }, { retry: 1, timeout: 1000 });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Retried diagnostic\./);
});

test("createTest(): preserves options before callback", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    let attempts = 0;
    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("retrying test", { retry: 1, timeout: 1000 }, () => {
      attempts++;
      if (attempts === 1) throw new Error("try again");
      getLogger(["app"]).info("Options-before diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Options-before diagnostic\./);
});

test("createTest(): reports asynchronous done callback failures", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("done callback failure", (done) => {
      getLogger(["app"]).info("Callback diagnostic.");
      setTimeout(() => done(new Error("async failure")), 0);
    });
  `);

  assert.notStrictEqual(result.code, 0);
  assert.match(result.output, /reported:Callback diagnostic\./);
});

test("createTest(): preserves skip and todo shorthand behavior", async () => {
  const result = await runBunTest(`
    import { createTest } from ${JSON.stringify(modUrl)};

    const test = createTest({
      sink: () => {
        throw new Error("skipped callbacks must not report");
      },
    });

    test.skip("skipped test", () => {
      throw new Error("skip callback ran");
    });
    test.todo("todo test", () => {
      throw new Error("todo callback ran");
    });
  `);

  assertSuccess(result);
});

test("createTest(): preserves conditional shorthand helpers", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test.if(true)("conditional test", () => {
      getLogger(["app"]).info("Conditional diagnostic.");
    });
    test.skipIf(true)("skipped conditional", () => {
      throw new Error("skipIf callback ran");
    });
    test.todoIf(true)("todo conditional", () => {
      throw new Error("todoIf callback ran");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Conditional diagnostic\./);
});

test("createTest(): preserves failing shorthand semantics", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test.failing("expected failure", () => {
      getLogger(["app"]).info("Known failure diagnostic.");
      throw new Error("known bug");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Known failure diagnostic\./);
});

test("createTest(): preserves test.each() callback arguments", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const seen = [];
    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test.each([
      [1, 2],
      { value: 3 },
    ])("case %#", (...args) => {
      seen.push(args);
      getLogger(["app"]).info("Parameterized diagnostic.");
    });

    test("assert cases", () => {
      const expected = JSON.stringify([[1, 2], [{ value: 3 }]]);
      if (JSON.stringify(seen) !== expected) {
        throw new Error("wrong test.each arguments: " + JSON.stringify(seen));
      }
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Parameterized diagnostic\./);
});

test("createTest(): wraps test.each() options before callback", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    let attempts = 0;
    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test.each([1])("case %#", { retry: 1 }, (value) => {
      attempts++;
      if (value !== 1) throw new Error("wrong value");
      if (attempts === 1) throw new Error("try again");
      getLogger(["app"]).info("Each options-before diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Each options-before diagnostic\./);
});

test("createTest(): supports done callbacks in test.each()", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test.each([1])("case %#", (value, done) => {
      if (value !== 1) done(new Error("wrong value"));
      setTimeout(() => {
        getLogger(["app"]).info("Each done diagnostic.");
        done();
      }, 0);
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Each done diagnostic\./);
});

test("createTest(): wraps the it() alias", async () => {
  const result = await runBunTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createIt } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const it = createIt({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    it("aliased test", () => {
      getLogger(["app"]).info("Alias diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Alias diagnostic\./);
});

test("autoload: configures LogTape when it has not been configured", async () => {
  const result = await runBunTest(`
    import { expect } from "bun:test";
    import { getConfig } from ${JSON.stringify(logtapeSpecifier)};
    import { test } from ${JSON.stringify(autoloadUrl)};

    test("autoload config", () => {
      const config = getConfig();
      expect(config).not.toBeNull();
      expect(config.contextLocalStorage).toBeDefined();
    });
  `);

  assertSuccess(result);
});

test("autoload: keeps an existing configuration with contextLocalStorage", async () => {
  const result = await runBunTest(`
    import { expect } from "bun:test";
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getConfig,
    } from ${JSON.stringify(logtapeSpecifier)};

    const existingConfig = {
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    };
    configureSync(existingConfig);
    const autoload = await import(${JSON.stringify(autoloadUrl)});

    autoload.test("existing config", () => {
      expect(getConfig()).toBe(existingConfig);
    });
  `);

  assertSuccess(result);
});

test("autoload: rejects existing configuration without contextLocalStorage", async () => {
  const result = await runBunTest(`
    import { expect, test } from "bun:test";
    import { configureSync } from ${JSON.stringify(logtapeSpecifier)};

    configureSync({
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    test("missing context", async () => {
      await expect(
        import(${JSON.stringify(autoloadUrl + "?missing-context")})
      ).rejects.toThrow(/autoload requires the existing LogTape configuration to provide contextLocalStorage/);
    });
  `);

  assertSuccess(result);
});

test("createTest(): exposes Bun test helpers", async () => {
  const result = await runBunTest(`
    import { expect, test as bunTest } from "bun:test";
    import {
      createTest,
      expectTypeOf,
      onTestFinished,
      test,
      vi,
      xdescribe,
      xit,
      xtest,
    } from ${JSON.stringify(modUrl)};

    bunTest("helpers", () => {
      const wrapped = createTest();
      for (
        const key of [
          "skip",
          "todo",
          "only",
          "if",
          "skipIf",
          "todoIf",
          "failing",
          "each",
          "concurrent",
          "serial",
        ]
      ) {
        expect(hasFunctionProperty(wrapped, key)).toBe(
          hasFunctionProperty(bunTest, key),
        );
      }
      expect(typeof test).toBe("function");
      expect(typeof expectTypeOf).toBe("function");
      expect(typeof onTestFinished).toBe("function");
      expect(typeof vi).toBe("object");
      expect(typeof xdescribe).toBe("function");
      expect(typeof xit).toBe("function");
      expect(typeof xtest).toBe("function");
    });

    function hasFunctionProperty(value, property) {
      try {
        return typeof value[property] === "function";
      } catch {
        return false;
      }
    }
  `);

  assertSuccess(result);
});

// Helpers

async function runBunTest(source: string): Promise<{
  readonly code: number;
  readonly output: string;
}> {
  const directory = await mkdtemp(join(packageRoot, ".tmp-test-"));
  try {
    const testFile = join(directory, "fixture.test.ts");
    const reportFile = join(directory, "reported.txt");
    await writeFile(
      testFile,
      `
        import { appendFileSync } from "node:fs";

        const reportFile = ${JSON.stringify(reportFile)};
        function report(message: string): void {
          appendFileSync(reportFile, message + "\\n");
        }
      ` + source,
    );

    const output = await runBun(["test", testFile], packageRoot);
    let reportOutput = "";
    try {
      reportOutput = await readFile(reportFile, "utf8");
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    return {
      code: output.code,
      output: reportOutput + output.stdout + output.stderr,
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function runBun(
  args: readonly string[],
  cwd: string,
): Promise<
  { readonly code: number; readonly stdout: string; readonly stderr: string }
> {
  try {
    const { stdout, stderr } = await execFileAsync("bun", [...args], {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (isExecError(error)) {
      return {
        code: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
      };
    }
    throw error;
  }
}

function assertSuccess(result: {
  readonly code: number;
  readonly output: string;
}): void {
  assert.strictEqual(result.code, 0, result.output);
}

function isExecError(
  error: unknown,
): error is {
  readonly code?: unknown;
  readonly stdout?: string;
  readonly stderr?: string;
} {
  return typeof error === "object" && error != null &&
    ("stdout" in error || "stderr" in error);
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error != null &&
    "code" in error && error.code === "ENOENT";
}

async function canRunBunSubprocess(): Promise<boolean> {
  if (!("Deno" in globalThis)) return true;
  const deno = globalThis.Deno;
  if (
    typeof deno !== "object" || deno == null ||
    !("permissions" in deno) ||
    typeof deno.permissions !== "object" || deno.permissions == null ||
    !("query" in deno.permissions) ||
    typeof deno.permissions.query !== "function"
  ) {
    return true;
  }

  const status = await deno.permissions.query({
    name: "run",
    command: "bun",
  });
  return status.state === "granted";
}
