import assert from "node:assert/strict";
import { dirname, fromFileUrl, join } from "@std/path";

const packageRoot = dirname(dirname(fromFileUrl(import.meta.url)));
const repositoryRoot = dirname(dirname(packageRoot));
const modUrl = new URL("./mod.ts", import.meta.url).href;
const autoloadUrl = new URL("./autoload.ts", import.meta.url).href;
const logtapeSpecifier = "@logtape/logtape";
const hasDenoTestEach =
  typeof (Deno.test as unknown as { readonly each?: unknown }).each ===
    "function";

Deno.test("createTest(): reports logs from failed tests", async () => {
  const result = await runDenoTest(`
    import assert from "node:assert/strict";
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      lowestLevel: "debug",
      sink: (record) => {
        report("reported:" + record.rawMessage);
      },
    });

    test("expected failure", () => {
      getLogger(["app"]).debug("Before failure.");
      assert.fail("boom");
    });
  `);

  assert.notStrictEqual(result.code, 0);
  assert.match(result.output, /reported:Before failure\./);
});

Deno.test("createTest(): discards logs from passing tests", async () => {
  const result = await runDenoTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      lowestLevel: "debug",
      sink: (record) => {
        report("reported:" + record.rawMessage);
      },
    });

    test("passing test", () => {
      getLogger(["app"]).debug("Should be discarded.");
    });
  `);

  assertSuccess(result);
  assert.doesNotMatch(result.output, /reported:Should be discarded\./);
});

Deno.test("createTest(): preserves Deno.test options", async () => {
  const result = await runDenoTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest();

    test("optioned test", {
      sanitizeOps: false,
      sanitizeResources: false,
      permissions: "none",
    }, (context) => {
      if (context.name !== "optioned test") {
        throw new Error("wrong test context");
      }
    });
  `);

  assertSuccess(result);
});

Deno.test("createTest(): reports passing tests in always mode", async () => {
  const result = await runDenoTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      mode: "always",
      sink: (record) => {
        report("reported:" + record.rawMessage);
      },
    });

    test("passing test", () => {
      getLogger(["app"]).info("Always reported.");
    });
  `);

  assertSuccess(result);
  assert.match(result.output, /reported:Always reported\./);
});

Deno.test("createTest(): preserves ignored tests", async () => {
  const result = await runDenoTest(`
    import { createTest } from ${JSON.stringify(modUrl)};

    const test = createTest({
      sink: () => {
        throw new Error("ignored test should not report");
      },
    });

    test({
      name: "ignored test",
      ignore: true,
      fn() {
        throw new Error("ignored test should not run");
      },
    });
  `);

  assertSuccess(result);
});

Deno.test("createTest(): supports named function overloads", async () => {
  const result = await runDenoTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import { configureSync } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest();

    test(function namedCase(context) {
      if (context.name !== "namedCase") {
        throw new Error("wrong test name: " + context.name);
      }
    });
  `);

  assertSuccess(result);
});

Deno.test("createTest(): preserves names with options before callback", async () => {
  const result = await runDenoTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import { configureSync } from ${JSON.stringify(logtapeSpecifier)};
    import { createTest } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest();

    test({ permissions: "none" }, function namedCase(context) {
      if (context.name !== "namedCase") {
        throw new Error("wrong test name: " + context.name);
      }
    });
  `);

  assertSuccess(result);
});

Deno.test("createTest(): reports logs from failed steps", async () => {
  const result = await runDenoTest(`
    import assert from "node:assert/strict";
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      sink: (record) => {
        report("reported:" + record.rawMessage);
      },
    });

    test("parent", async (context) => {
      await context.step("child", () => {
        getLogger(["app"]).info("Step diagnostic.");
        assert.fail("step failed");
      });
    });
  `);

  assert.notStrictEqual(result.code, 0);
  assert.match(result.output, /reported:Step diagnostic\./);
});

Deno.test({
  name: "createTest(): preserves test.each() callback arguments",
  ignore: !hasDenoTestEach,
  async fn() {
    if (!hasDenoTestEach) return;

    const result = await runDenoTest(`
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const seen: unknown[] = [];
    const test = createTest({
      mode: "always",
      sink: (record) => {
        report("reported:" + record.rawMessage);
      },
    });

    test.each([1, 2])("scalar case", (value) => {
      seen.push(value);
      getLogger(["app"]).info("Scalar " + value + ".");
    });

    test.each([
      [3, 4],
    ])("tuple case", (left, right) => {
      seen.push([left, right]);
      getLogger(["app"]).info("Tuple " + left + "/" + right + ".");
    });

    Deno.test("assert parameterized cases", () => {
      if (JSON.stringify(seen) !== JSON.stringify([1, 2, [3, 4]])) {
        throw new Error("wrong test.each() arguments: " + JSON.stringify(seen));
      }
    });
  `);

    assertSuccess(result);
    assert.match(result.output, /reported:Scalar 1\./);
    assert.match(result.output, /reported:Scalar 2\./);
    assert.match(result.output, /reported:Tuple 3\/4\./);
  },
});

Deno.test({
  name: "createTest(): reports logs from failed test.each() steps",
  ignore: !hasDenoTestEach,
  async fn() {
    if (!hasDenoTestEach) return;

    const result = await runDenoTest(`
    import assert from "node:assert/strict";
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getLogger,
    } from ${JSON.stringify(logtapeSpecifier)};
    import {
      createTest,
      type TestContext,
    } from ${JSON.stringify(modUrl)};

    configureSync({
      contextLocalStorage: new AsyncLocalStorage(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    const test = createTest({
      sink: (record) => {
        report("reported:" + record.rawMessage);
      },
    });

    test.each([1])("parameterized parent", async (
      _value: unknown,
      context: TestContext,
    ) => {
      await context.step("child", () => {
        getLogger(["app"]).info("Parameterized step diagnostic.");
        assert.fail("step failed");
      });
    });
  `);

    assert.notStrictEqual(result.code, 0);
    assert.match(result.output, /reported:Parameterized step diagnostic\./);
  },
});

Deno.test("autoload: configures LogTape when it has not been configured", async () => {
  const result = await runDenoTest(`
    import assert from "node:assert/strict";
    import { getConfig } from ${JSON.stringify(logtapeSpecifier)};
    import { test } from ${JSON.stringify(autoloadUrl)};

    test("autoload config", () => {
      const config = getConfig();
      assert.notStrictEqual(config, null);
      assert.notStrictEqual(config!.contextLocalStorage, undefined);
    });
  `);

  assertSuccess(result);
});

Deno.test("autoload: keeps an existing configuration with contextLocalStorage", async () => {
  const result = await runDenoTest(`
    import assert from "node:assert/strict";
    import { AsyncLocalStorage } from "node:async_hooks";
    import {
      configureSync,
      getConfig,
    } from ${JSON.stringify(logtapeSpecifier)};

    const existingConfig = {
      contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    };
    configureSync(existingConfig);
    const autoload = await import(${JSON.stringify(autoloadUrl)});

    autoload.test("existing config", () => {
      assert.strictEqual(getConfig(), existingConfig);
    });
  `);

  assertSuccess(result);
});

Deno.test("autoload: rejects existing configuration without contextLocalStorage", async () => {
  const result = await runDenoTest(`
    import assert from "node:assert/strict";
    import { configureSync } from ${JSON.stringify(logtapeSpecifier)};

    configureSync({
      sinks: {},
      loggers: [{ category: ["logtape", "meta"], sinks: [] }],
    });

    Deno.test("missing context", async () => {
      await assert.rejects(
        import(${JSON.stringify(autoloadUrl + "?missing-context")}),
        /autoload requires the existing LogTape configuration to provide contextLocalStorage/,
      );
    });
  `);

  assert.strictEqual(result.code, 0);
});

// Helpers

async function runDenoTest(source: string): Promise<{
  readonly code: number;
  readonly output: string;
}> {
  const directory = await Deno.makeTempDir({
    prefix: "logtape-testing-deno-",
  });
  try {
    const testFile = join(directory, "fixture.test.ts");
    const reportFile = join(directory, "reported.txt");
    await Deno.writeTextFile(
      testFile,
      `
        const reportFile = ${JSON.stringify(reportFile)};
        function report(message: string): void {
          Deno.writeTextFileSync(reportFile, message + "\\n", {
            append: true,
          });
        }
      ` + source,
    );
    const command = new Deno.Command("deno", {
      args: [
        "test",
        "--quiet",
        "--config",
        join(repositoryRoot, "deno.json"),
        "--allow-read",
        "--allow-write",
        testFile,
      ],
      cwd: packageRoot,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    let reportOutput = "";
    try {
      reportOutput = await Deno.readTextFile(reportFile);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return {
      code: output.code,
      output: reportOutput +
        new TextDecoder().decode(output.stdout) +
        new TextDecoder().decode(output.stderr),
    };
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

function assertSuccess(result: {
  readonly code: number;
  readonly output: string;
}): void {
  assert.strictEqual(result.code, 0, result.output);
}
