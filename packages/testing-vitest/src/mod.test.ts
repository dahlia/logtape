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
const canRunVitest = await canRunVitestSubprocess();

function test(
  name: string,
  fn: () => unknown | Promise<unknown>,
): void {
  nodeTest(name, { skip: !canRunVitest }, async () => {
    if (!canRunVitest) return;
    await fn();
  });
}

test("createTest(): reports logs from failed tests", async () => {
  const result = await runVitestTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import { expect } from "vitest";
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
  const result = await runVitestTest(`
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
  const result = await runVitestTest(`
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

test("createTest(): preserves Vitest options before callback", async () => {
  const result = await runVitestTest(`
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

    test("retrying test", { retry: { count: 1 }, timeout: 1000 }, () => {
      attempts++;
      if (attempts === 1) throw new Error("try again");
      getLogger(["app"]).info("Options-before diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Options-before diagnostic\./);
});

test("createTest(): reports asynchronous rejected failures", async () => {
  const result = await runVitestTest(`
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

    test("async failure", async () => {
      getLogger(["app"]).info("Async diagnostic.");
      await Promise.resolve();
      throw new Error("async failure");
    });
  `);

  assert.notStrictEqual(result.code, 0);
  assert.match(result.output, /reported:Async diagnostic\./);
});

test("createTest(): preserves skip and todo shorthand behavior", async () => {
  const result = await runVitestTest(`
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
  const result = await runVitestTest(`
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

    test.runIf(true)("conditional test", () => {
      getLogger(["app"]).info("Conditional diagnostic.");
    });
    test.skipIf(true)("skipped conditional", () => {
      throw new Error("skipIf callback ran");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Conditional diagnostic\./);
});

test("createTest(): preserves fails shorthand semantics", async () => {
  const result = await runVitestTest(`
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

    test.fails("expected failure", () => {
      getLogger(["app"]).info("Known failure diagnostic.");
      throw new Error("known bug");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Known failure diagnostic\./);
});

test("createTest(): preserves deep shorthand chains", async () => {
  const result = await runVitestTest(`
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

    test.concurrent.only.fails("deep expected failure", () => {
      getLogger(["app"]).info("Deep chained diagnostic.");
      throw new Error("known concurrent bug");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Deep chained diagnostic\./);
});

test("createTest(): preserves test.each() callback arguments", async () => {
  const result = await runVitestTest(`
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
      [3, 4],
    ])("case %#", (left, right) => {
      const args = [left, right];
      seen.push(args);
      getLogger(["app"]).info("Parameterized diagnostic.");
    });

    test("assert cases", () => {
      const expected = JSON.stringify([[1, 2], [3, 4]]);
      if (JSON.stringify(seen) !== expected) {
        throw new Error("wrong test.each arguments: " + JSON.stringify(seen));
      }
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Parameterized diagnostic\./);
});

test("createTest(): wraps test.each() options before callback", async () => {
  const result = await runVitestTest(`
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

    test.each([1])("case %#", { retry: { count: 1 } }, (value) => {
      attempts++;
      if (value !== 1) throw new Error("wrong value");
      if (attempts === 1) throw new Error("try again");
      getLogger(["app"]).info("Each options-before diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Each options-before diagnostic\./);
});

test("createTest(): preserves test.for() callback context", async () => {
  const result = await runVitestTest(`
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

    test.for([{ value: 3 }])("case $value", ({ value }, context) => {
      context.expect(value).toBe(3);
      getLogger(["app"]).info("For diagnostic.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:For diagnostic\./);
});

test("createTest(): preserves extended fixtures and hooks", async () => {
  const result = await runVitestTest(`
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

    const baseTest = createTest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });
    const test = baseTest.extend({
      user: async ({}, use) => {
        await use("Ada");
      },
    });

    test.beforeEach(({ user }) => {
      getLogger(["app"]).info("Hook user Ada.");
    });

    test("fixture test", ({ expect, user }) => {
      expect(user).toBe("Ada");
      getLogger(["app"]).info("Fixture user Ada.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Hook user Ada\./);
  assert.match(result.output, /reported:Fixture user Ada\./);
});

test("createIt(): wraps the it() alias", async () => {
  const result = await runVitestTest(`
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

test("createVitest(): returns wrapped test helpers and re-exports", async () => {
  const result = await runVitestTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import { createVitest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const { expect, test, vi } = createVitest({
      mode: "always",
      sink: (record) => report("reported:" + record.rawMessage),
    });

    test("namespace test", () => {
      getLogger(["app"]).info("Namespace diagnostic.");
      expect(typeof vi.fn).toBe("function");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Namespace diagnostic\./);
});

test("autoload: configures LogTape when it has not been configured", async () => {
  const result = await runVitestTest(`
    import { expect } from "vitest";
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
  const result = await runVitestTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import { expect } from "vitest";
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
  const result = await runVitestTest(`
    import { configureSync } from ${JSON.stringify(logtapeSpecifier)};
    import { expect, test } from "vitest";

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

test("createTest(): exposes Vitest test helpers", async () => {
  const result = await runVitestTest(`
    import { expect, test as vitestTest } from "vitest";
    import {
      assert,
      bench,
      chai,
      createTest,
      describe,
      expect as wrappedExpect,
      expectTypeOf,
      it,
      onTestFailed,
      onTestFinished,
      suite,
      test,
      vi,
      vitest,
    } from ${JSON.stringify(modUrl)};

    vitestTest("helpers", () => {
      const wrapped = createTest();
      for (
        const key of [
          "skip",
          "todo",
          "only",
          "fails",
          "each",
          "for",
          "concurrent",
          "sequential",
          "runIf",
          "skipIf",
          "extend",
        ]
      ) {
        expect(typeof wrapped[key]).toBe("function");
      }
      expect(typeof test).toBe("function");
      expect(typeof it).toBe("function");
      expect(typeof describe).toBe("function");
      expect(typeof suite).toBe("function");
      expect(typeof bench).toBe("function");
      expect(typeof wrappedExpect).toBe("function");
      expect(typeof expectTypeOf).toBe("function");
      expect(typeof vi.fn).toBe("function");
      expect(typeof vitest.fn).toBe("function");
      expect(typeof onTestFailed).toBe("function");
      expect(typeof onTestFinished).toBe("function");
      expect(typeof assert.equal).toBe("function");
      expect(typeof chai.expect).toBe("function");
    });
  `);

  assertSuccess(result);
});

// Helpers

async function runVitestTest(source: string): Promise<{
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

    const output = await runPnpm(
      ["exec", "vitest", "run", testFile],
      packageRoot,
    );
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

async function runPnpm(
  args: readonly string[],
  cwd: string,
): Promise<
  { readonly code: number; readonly stdout: string; readonly stderr: string }
> {
  try {
    const { stdout, stderr } = await execFileAsync("pnpm", [...args], {
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

async function canRunVitestSubprocess(): Promise<boolean> {
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
    command: "pnpm",
  });
  return status.state === "granted";
}
