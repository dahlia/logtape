// These integration tests run `deno lint` as a subprocess with the plugin
// configured.  They only run under Deno.
import assert from "node:assert/strict";
import test from "node:test";

const isDenoRuntime = typeof Deno !== "undefined";

interface Diagnostic {
  code: string;
  message: string;
  filename: string;
}

interface LintOutput {
  version: number;
  diagnostics: Diagnostic[];
  errors: string[];
}

async function lintWithPlugin(
  sourceCode: string,
  includeRules: string[],
): Promise<Diagnostic[]> {
  if (!isDenoRuntime) return [];
  // @ts-ignore: Deno-only API
  const tmpDir = await Deno.makeTempDir({ prefix: "logtape-lint-test-" });
  try {
    // Pass the plugin as a file:// URL specifier.  An OS path (e.g. from
    // fileURLToPath) is `D:\...` on Windows, which deno.json's `plugins` array
    // does not accept; a file:// URL resolves correctly on every platform.
    const pluginUrl = new URL("./plugin.ts", import.meta.url).href;
    const denoJson = {
      unstable: ["lint"],
      lint: {
        plugins: [pluginUrl],
        rules: { include: includeRules },
      },
    };
    // @ts-ignore: Deno-only API
    await Deno.writeTextFile(
      `${tmpDir}/deno.json`,
      JSON.stringify(denoJson),
    );
    // @ts-ignore: Deno-only API
    await Deno.writeTextFile(`${tmpDir}/test.ts`, sourceCode);

    // @ts-ignore: Deno-only API
    const cmd = new Deno.Command("deno", {
      args: ["lint", "--json", "test.ts"],
      cwd: tmpDir,
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout, stderr } = await cmd.output();
    const text = new TextDecoder().decode(stdout);
    // `deno lint --json` always prints a JSON document to stdout, even with
    // zero diagnostics.  Empty stdout therefore means the lint run itself
    // failed (e.g. the plugin could not be loaded); surface stderr so the
    // failure is visible instead of masquerading as "no diagnostics".
    if (!text.trim()) {
      const err = new TextDecoder().decode(stderr);
      throw new Error(`deno lint produced no output. stderr:\n${err}`);
    }
    const parsed = JSON.parse(text) as LintOutput;
    return parsed.diagnostics ?? [];
  } finally {
    // @ts-ignore: Deno-only API
    await Deno.remove(tmpDir, { recursive: true });
  }
}

// Run `deno lint --fix` with the plugin and return the fixed file contents, so
// autofix output (not just diagnostics) can be asserted.
async function lintAndFix(
  sourceCode: string,
  includeRules: string[],
): Promise<string> {
  if (!isDenoRuntime) return sourceCode;
  // @ts-ignore: Deno-only API
  const tmpDir = await Deno.makeTempDir({ prefix: "logtape-lint-fix-test-" });
  try {
    // Pass the plugin as a file:// URL specifier.  An OS path (e.g. from
    // fileURLToPath) is `D:\...` on Windows, which deno.json's `plugins` array
    // does not accept; a file:// URL resolves correctly on every platform.
    const pluginUrl = new URL("./plugin.ts", import.meta.url).href;
    const denoJson = {
      unstable: ["lint"],
      lint: {
        plugins: [pluginUrl],
        rules: { include: includeRules },
      },
    };
    // @ts-ignore: Deno-only API
    await Deno.writeTextFile(`${tmpDir}/deno.json`, JSON.stringify(denoJson));
    // @ts-ignore: Deno-only API
    await Deno.writeTextFile(`${tmpDir}/test.ts`, sourceCode);
    // @ts-ignore: Deno-only API
    const cmd = new Deno.Command("deno", {
      args: ["lint", "--fix", "test.ts"],
      cwd: tmpDir,
      stdout: "piped",
      stderr: "piped",
    });
    await cmd.output();
    // @ts-ignore: Deno-only API
    return await Deno.readTextFile(`${tmpDir}/test.ts`);
  } finally {
    // @ts-ignore: Deno-only API
    await Deno.remove(tmpDir, { recursive: true });
  }
}

const ALL_RULES = [
  "logtape/no-message-interpolation",
  "logtape/prefer-lazy-evaluation",
  "logtape/no-unawaited-log",
  "logtape/require-meta-sink",
];

const skipIfNotDeno = !isDenoRuntime;

test(
  "deno lint: no-message-interpolation flags template literal",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\`);`,
      ["logtape/no-message-interpolation"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-message-interpolation"),
      `Expected no-message-interpolation violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: recognizes a direct jsr: LogTape import",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "jsr:@logtape/logtape@^1.0.0";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\`);`,
      ["logtape/no-message-interpolation"],
    );
    // A direct JSR specifier is valid Deno usage and must be recognized.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-message-interpolation"),
      `Expected no-message-interpolation violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation does not flag correct usage",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info("User {userId} logged in.", { userId: "abc" });`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(violations.length, 0);
  },
);

test(
  "deno lint: prefer-lazy-evaluation flags eager object",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("Data: {data}.", { data: fetchData(id) });`,
      ["logtape/prefer-lazy-evaluation"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/prefer-lazy-evaluation"),
      `Expected prefer-lazy-evaluation violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation does not flag a lazy() property value",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("Data: {data}.", { data: lazy(() => fetchData(id)) });`,
      ["logtape/prefer-lazy-evaluation"],
    );
    // lazy(() => ...) is the documented per-property lazy API, already deferred.
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/prefer-lazy-evaluation",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations for a lazy() value, got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation flags eager object in properties-only overload",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug({ data: fetchData(id) });`,
      ["logtape/prefer-lazy-evaluation"],
    );
    // logger.debug({ ... }) is the properties-only overload; an eager call in
    // it should be flagged just like the message+properties form.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/prefer-lazy-evaluation"),
      `Expected prefer-lazy-evaluation violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation flags dynamic import in property",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("Data: {data}.", { mod: import("./mod.ts") });`,
      ["logtape/prefer-lazy-evaluation"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/prefer-lazy-evaluation"),
      `Expected a violation for the dynamic import, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation sees through a type assertion",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("Data: {data}.", { data: fetchData(id) } as const);`,
      ["logtape/prefer-lazy-evaluation"],
    );
    // `{ ... } as const` wraps the object in a TSAsExpression; it must still
    // be analyzed.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/prefer-lazy-evaluation"),
      `Expected a violation through the type assertion, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink sees through a type assertion on the config",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { main: getMainSink() },
  loggers: [{ category: [], sinks: ["main"] }],
} as const);`,
      ["logtape/require-meta-sink"],
    );
    // The config object is wrapped in `as const`; the rule must still inspect
    // it and warn about the missing meta logger.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected a violation through the type assertion, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink sees through a type assertion on loggers",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { main: getMainSink() },
  loggers: [{ category: [], sinks: ["main"] }] as const,
});`,
      ["logtape/require-meta-sink"],
    );
    // The loggers array is wrapped in `as const`; the rule must still inspect
    // its entries.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected a violation through the type assertion, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink accepts an asserted meta category array",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["logtape", "meta"] as const, sinks: ["console"] },
  ],
});`,
      ["logtape/require-meta-sink"],
    );
    // The category array is wrapped in `as const`; the rule must unwrap it and
    // recognize the configured meta logger rather than report a false positive.
    assert.ok(
      !diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected no require-meta-sink violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink sees through a non-null assertion",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["logtape", "meta"]!, sinks: ["console"] },
  ],
});`,
      ["logtape/require-meta-sink"],
    );
    // The category array is wrapped in a non-null assertion (`!`); the rule
    // must unwrap it the same as a type assertion and recognize the meta logger.
    assert.ok(
      !diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected no require-meta-sink violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags unawaited async callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("Data: {data}.", async () => ({ data: await fetchData() }));
}`,
      ["logtape/no-unawaited-log"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a non-async callback returning a promise",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("Data: {data}.", () => fetchData().then((data) => ({ data })));
}`,
      ["logtape/no-unawaited-log"],
    );
    // LogTape awaits any promise the lazy callback returns, even without async.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags an async callback passed by reference",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  const props = async () => ({ data: await fetchData() });
  logger.info("Data: {data}.", props);
}`,
      ["logtape/no-unawaited-log"],
    );
    // props resolves to an async function, so the log returns a Promise<void>.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags an async function declaration by reference",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  async function props() {
    return { data: await fetchData() };
  }
  logger.info("Data: {data}.", props);
}`,
      ["logtape/no-unawaited-log"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log does not let an async name leak into an inner scope",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const props = async () => ({ data: 1 });
function handler(props: unknown) {
  logger.info("Data: {data}.", props);
}`,
      ["logtape/no-unawaited-log"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-unawaited-log",
    );
    // Inside handler, props is the parameter, not the outer async function.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (param shadows outer async), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink flags configure without meta logger",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { main: getMainSink() },
  loggers: [{ category: [], sinks: ["main"] }],
});`,
      ["logtape/require-meta-sink"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected require-meta-sink violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink flags a bare backtick category",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: \`logtape\`, sinks: ["console"] }],
});`,
      ["logtape/require-meta-sink"],
    );
    // A bare backtick string is still a string category, which core does not
    // treat as configuring the meta logger; the rule must warn.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected require-meta-sink violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink accepts a backtick element inside the array category",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: [\`logtape\`, \`meta\`], sinks: ["console"] }],
});`,
      ["logtape/require-meta-sink"],
    );
    // The array resolves to ["logtape", "meta"] at runtime, which core
    // recognizes, so backtick elements within the array are fine.
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations for backtick array elements, got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a computed variable category key",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
const category = "logtape";
await configure({
  sinks: { main: getMainSink() },
  loggers: [{ [category]: "logtape", sinks: ["main"] }],
});`,
      ["logtape/require-meta-sink"],
    );
    // [category] is a dynamic key, not the literal "category" property, so no
    // meta logger entry exists and the rule must still warn.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected require-meta-sink violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a computed variable loggers key",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
const loggers = "dynamic";
await configure({
  sinks: { main: getMainSink() },
  [loggers]: [{ category: ["logtape", "meta"], sinks: ["main"] }],
});`,
      ["logtape/require-meta-sink"],
    );
    // [loggers] is a computed variable key, not the literal "loggers" property,
    // so no statically known loggers array exists and the rule must warn.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected require-meta-sink violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a local function configure",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
function setup() {
  function configure(_cfg: unknown) {}
  configure({ loggers: [] });
}`,
      ["logtape/require-meta-sink"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    // configure here is a local function declaration, not the import, so the
    // rule must not flag the call.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (configure is a local function), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a hoisted local function configure used before its declaration",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
function setup() {
  configure({ loggers: [] });
  function configure(_cfg: unknown) {}
}`,
      ["logtape/require-meta-sink"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    // The local function configure is hoisted, so the earlier call resolves to
    // it, not the import, and must not be flagged.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (hoisted local configure), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log does not flag awaited async callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  await logger.debug("Data: {data}.", async () => ({ data: await fetchData() }));
}`,
      ["logtape/no-unawaited-log"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-unawaited-log",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations for awaited call, got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a discarded map() callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(items: unknown[]) {
  items.map(() => logger.debug("Data: {data}.", async () => ({ data: await fetchData() })));
}`,
      ["logtape/no-unawaited-log"],
    );
    // The map() callback returns the promise, but the resulting array is
    // discarded, so the async log is never flushed.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a block-bodied callback that returns into forEach",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(items: unknown[]) {
  items.forEach(() => {
    return logger.debug("Data: {data}.", async () => ({ data: await fetchData() }));
  });
}`,
      ["logtape/no-unawaited-log"],
    );
    // The forEach() callback returns the promise, but forEach discards it.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a log promise wrapped in an awaited array",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  await [logger.debug("Data: {data}.", async () => ({ data: await fetchData() }))];
}`,
      ["logtape/no-unawaited-log"],
    );
    // Awaiting a bare array does not await its element promises.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a log call inside Promise.race",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(timeout: Promise<void>) {
  await Promise.race([logger.debug("Data: {data}.", async () => ({ data: await fetchData() })), timeout]);
}`,
      ["logtape/no-unawaited-log"],
    );
    // Promise.race can settle on timeout before the log promise resolves.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags an awaited bare map() result",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items: unknown[]) {
  await items.map(() => logger.debug("Data: {data}.", async () => ({ data: await fetchData() })));
}`,
      ["logtape/no-unawaited-log"],
    );
    // await on a bare map() awaits the array, not the element promises.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a callback in an awaited forEach",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items: unknown[]) {
  await items.forEach(() => logger.debug("Data: {data}.", async () => ({ data: await fetchData() })));
}`,
      ["logtape/no-unawaited-log"],
    );
    // forEach returns undefined, so awaiting it does not await the callback
    // promise.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: all rules - no false positives for correct code",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger, configure } from "@logtape/logtape";
const logger = getLogger(["app"]);
await configure({
  sinks: { console: getConsoleSink(), file: getFileSink() },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"] },
    { category: ["app"], sinks: ["file"] },
  ],
});
logger.info("User {userId} logged in.", { userId: "abc" });
await logger.info("Data: {data}.", async () => ({ data: await fetchData() }));`,
      ALL_RULES,
    );
    const ourViolations = diagnostics.filter((d) => ALL_RULES.includes(d.code));
    assert.strictEqual(
      ourViolations.length,
      0,
      `Expected no violations, got: ${JSON.stringify(ourViolations)}`,
    );
  },
);

test(
  "deno lint: no-message-interpolation skips files without logtape import",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      "const logger = { info: () => {} }; logger.info(`hello ${world}`);",
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(violations.length, 0);
  },
);

test(
  "deno lint: no-message-interpolation: a catch parameter shadows the outer logger",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(x: unknown) {
  try {
    risky();
  } catch (logger) {
    logger.info(\`failed: \${x}\`);
  }
}`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    // The catch parameter `logger` shadows the outer LogTape logger.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (catch param shadows logger), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink: a catch parameter shadows configure",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
function setup() {
  try {
    risky();
  } catch (configure) {
    configure({ loggers: [] });
  }
}`,
      ["logtape/require-meta-sink"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    // The catch parameter `configure` is not the imported configure().
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (catch param shadows configure), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation: logger from shadowed getLogger is not LogTape",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
function f(getLogger) {
  const logger = getLogger(["test"]);
  logger.info(\`User \${userId} logged in.\`);
}`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (logger comes from parameter, not import), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation: logger from locally declared getLogger is not LogTape",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
function f(userId: string) {
  const getLogger = (_c: string) => ({ info: (_m: string) => {} });
  getLogger("app").info(\`User \${userId} logged in.\`);
}`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (getLogger is a local binding, not the import), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation: logger from a local function getLogger is not LogTape",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
function f(userId: string) {
  function getLogger(_c: string) {
    return { info: (_m: string) => {} };
  }
  getLogger("app").info(\`User \${userId} logged in.\`);
}`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (getLogger is a local function, not the import), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation: logger from a hoisted local getLogger used before its declaration",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
function f(userId: string) {
  const logger = getLogger("app");
  function getLogger(_c: string) {
    return { info: (_m: string) => {} };
  }
  logger.info(\`User \${userId} logged in.\`);
}`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    // The local function getLogger is hoisted, so `logger` is initialized from
    // it, not the import, and the later call must not be flagged.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (hoisted local getLogger), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation: flags contextual logger from .with()",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const reqLogger = getLogger("app").with({ requestId: "abc" });
reqLogger.info(\`User \${userId} logged in.\`);`,
      ["logtape/no-message-interpolation"],
    );
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-message-interpolation"),
      `Expected a violation for the contextual logger, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a promise-returning callback by reference",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  const props = () => fetchData().then((data) => ({ data }));
  logger.info("msg", props);
}`,
      ["logtape/no-unawaited-log"],
    );
    // props is not async but returns a promise, so the log returns a
    // Promise<void> that must be awaited.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation ignores a getLogger shadowed by a named function expression",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const make = function getLogger() {
  getLogger("app").info(\`User \${userId} logged in.\`);
};`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    // Inside the named function expression, getLogger refers to the function
    // itself, not the import, so its call is not a LogTape logger.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (getLogger shadowed by the function expression), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a configure shadowed by a named function expression",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
const make = function configure(_cfg: unknown) {
  configure({ loggers: [] });
};`,
      ["logtape/require-meta-sink"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    // Inside the named function expression, configure refers to the function
    // itself, not the import, so the call must not be flagged.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (configure shadowed by the function expression), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation ignores a logger shadowed by a constructor parameter property",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["app"]);
class Service {
  constructor(private logger: { info(msg: string): void }) {
    logger.info(\`Value: \${this.x}\`);
  }
}`,
      ["logtape/no-message-interpolation"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    // Inside the constructor, logger is the parameter property, not the outer
    // LogTape logger, so the template literal must not be flagged.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (logger shadowed by a parameter property), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation autofix keeps a type assertion inside the callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const fixed = await lintAndFix(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("Data: {data}.", { data: fetchData() } as const);`,
      ["logtape/prefer-lazy-evaluation"],
    );
    // The `as const` must end up inside the lazy callback, not left dangling on
    // it (which would change the assertion target and break `as const`).
    assert.ok(
      fixed.includes("() => ({ data: fetchData() } as const)"),
      `Expected the assertion inside the callback, got: ${fixed}`,
    );
    assert.ok(
      !/\}\)\s*as const/.test(fixed),
      `Expected no dangling assertion on the callback, got: ${fixed}`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a map() result nested in a Promise.all array",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items: unknown[]) {
  await Promise.all([items.map(() => logger.debug("m", async () => ({ data: await fetchData() })))]);
}`,
      ["logtape/no-unawaited-log"],
    );
    // Promise.all awaits the outer array's elements; that element is the map()
    // result array, whose per-item log promises are not awaited.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a hoisted promise-returning function used before its declaration",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function use() {
  logger.info("m", props);
}
function props() {
  return fetchData().then((data) => ({ data }));
}`,
      ["logtape/no-unawaited-log"],
    );
    // props is a top-level, hoisted, non-async promise-returning function used
    // before its declaration; the Program-level pre-scan must recognize it.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation flags a call nested deep in a property object",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("m", { a: { b: { c: compute() } } });`,
      ["logtape/prefer-lazy-evaluation"],
    );
    // The eager call is three levels deep; the recursive scan must descend
    // through the nested objects (Deno exposes children as prototype getters).
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/prefer-lazy-evaluation"),
      `Expected prefer-lazy-evaluation violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a hoisted top-level function configure",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
run();
function run() {
  configure({ loggers: [] });
}
function configure(_cfg: unknown) {}`,
      ["logtape/require-meta-sink"],
    );
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    // The top-level function configure is hoisted and shadows the import, so
    // the call resolves to it and must not be flagged.
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (hoisted top-level configure), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: a logger declared in a switch case does not leak past the switch",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["app"]);
function f(x: number) {
  switch (x) {
    case 1:
      const logger = makeOther();
      void logger;
      break;
  }
  logger.info(\`Value: \${y}\`);
}`,
      ["logtape/no-message-interpolation"],
    );
    // The case-scoped `const logger` must not leak out of the switch; after it,
    // `logger` is the outer LogTape logger, so the template literal is flagged.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-message-interpolation"),
      `Expected a violation after the switch, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: a configure declared in a switch case does not leak past the switch",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
function setup(x: number) {
  switch (x) {
    case 1:
      const configure = (_cfg: unknown) => {};
      void configure;
      break;
  }
  configure({ loggers: [] });
}`,
      ["logtape/require-meta-sink"],
    );
    // The case-scoped `const configure` must not leak; after the switch the
    // call resolves to the imported configure and is flagged for a missing
    // meta sink.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected a violation after the switch, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a log promise returned from a setTimeout callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  return setTimeout(() => logger.debug("m", async () => ({ data: await fetchData() })), 0);
}`,
      ["logtape/no-unawaited-log"],
    );
    // setTimeout ignores its callback's return, so the log promise is dropped.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: prefer-lazy-evaluation flags a lazy() shadowed by a parameter",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["test"]);
function f(lazy: (cb: () => unknown) => unknown) {
  logger.debug("m", { x: lazy(() => expensive()) });
}`,
      ["logtape/prefer-lazy-evaluation"],
    );
    // lazy is imported but shadowed by the parameter, so this is a normal eager
    // call, not LogTape's deferred wrapper.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/prefer-lazy-evaluation"),
      `Expected prefer-lazy-evaluation violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a map() result chained through array methods",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items: unknown[]) {
  await items.map(() => logger.debug("m", async () => ({ data: await fetchData() }))).filter(Boolean);
}`,
      ["logtape/no-unawaited-log"],
    );
    // The map() result is chained through filter(); awaiting that array still
    // does not await the element promises.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a log dropped by a comma operator",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(other: Promise<void>) {
  await (logger.debug("m", async () => ({ data: await fetchData() })), other);
}`,
      ["logtape/no-unawaited-log"],
    );
    // The comma operator yields only `other`; the log promise is dropped.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink ignores a logger entry with an object spread",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
await configure({
  sinks: { console: getConsoleSink(), main: getMainSink() },
  loggers: [{ ...metaLogger, sinks: ["console"] }, { category: [], sinks: ["main"] }],
});`,
      ["logtape/require-meta-sink"],
    );
    // The spread entry might be the meta logger; the rule cannot see into it.
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (object spread entry), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a log returned from a reduce callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items: unknown[]) {
  await items.reduce(() => logger.debug("m", async () => ({ data: await fetchData() })), undefined);
}`,
      ["logtape/no-unawaited-log"],
    );
    // reduce threads the callback result into the next accumulator rather than
    // awaiting it, so the per-item log promises are dropped.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: a logger declared in a namespace does not leak to the outer scope",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["app"]);
namespace N {
  const logger = makeOther();
  void logger;
}
logger.info(\`v=\${x}\`);`,
      ["logtape/no-message-interpolation"],
    );
    // The namespace-local `logger` must not leak; after it, `logger` is the
    // outer LogTape logger, so the template literal is flagged.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-message-interpolation"),
      `Expected a violation after the namespace, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: a configure declared in a namespace does not leak to the outer scope",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { configure } from "@logtape/logtape";
namespace N {
  const configure = (_cfg: unknown) => {};
  void configure;
}
configure({ loggers: [] });`,
      ["logtape/require-meta-sink"],
    );
    // The namespace-local `configure` must not leak; the outer call resolves to
    // the import and is flagged for a missing meta sink.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/require-meta-sink"),
      `Expected a violation after the namespace, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: require-meta-sink reads a template-literal loggers key",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      'import { configure } from "@logtape/logtape";\n' +
        'await configure({ [`loggers`]: [{ category: ["logtape", "meta"], sinks: ["c"] }] });',
      ["logtape/require-meta-sink"],
    );
    // The loggers key is a no-interpolation template literal; it must resolve
    // to "loggers" so the meta entry inside is found and no warning is raised.
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/require-meta-sink",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (template-literal loggers key), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: no-message-interpolation sees through a type assertion on the message",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\` as string);`,
      ["logtape/no-message-interpolation"],
    );
    // The interpolated template is wrapped in \`as string\`; the rule must still
    // unwrap and flag it.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-message-interpolation"),
      `Expected a violation through the assertion, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log sees through a type assertion on the callback",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("m", (async () => ({ data: await fetchData() })) as unknown as () => unknown);
}`,
      ["logtape/no-unawaited-log"],
    );
    // The async callback is wrapped in a type assertion; the rule must still
    // unwrap and flag the unawaited log.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected a violation through the assertion, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: no-unawaited-log flags a log discarded by && as the left operand",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(other: unknown) {
  await (logger.debug("m", async () => ({ data: await fetchData() })) && other);
}`,
      ["logtape/no-unawaited-log"],
    );
    // A promise is truthy, so && yields `other`; the log promise is dropped.
    assert.ok(
      diagnostics.some((d) => d.code === "logtape/no-unawaited-log"),
      `Expected no-unawaited-log violation, got: ${
        JSON.stringify(diagnostics)
      }`,
    );
  },
);

test(
  "deno lint: a top-level function declaration shadows the imported getLogger",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
getLogger("x").info(\`v=\${y}\`);
function getLogger() {
  return console;
}`,
      ["logtape/no-message-interpolation"],
    );
    // The hoisted top-level `function getLogger` shadows the import, so the
    // call is not a LogTape logger and must not be flagged.
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (getLogger shadowed by a top-level function), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);

test(
  "deno lint: a function declaration shadows a logger name in its block",
  { skip: skipIfNotDeno },
  async () => {
    if (skipIfNotDeno) return;
    const diagnostics = await lintWithPlugin(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["app"]);
function scope() {
  logger.info(\`v=\${x}\`);
  function logger() {}
}`,
      ["logtape/no-message-interpolation"],
    );
    // The hoisted `function logger` shadows the outer logger for the whole
    // block, including the earlier call, so it must not be flagged.
    const violations = diagnostics.filter(
      (d) => d.code === "logtape/no-message-interpolation",
    );
    assert.strictEqual(
      violations.length,
      0,
      `Expected no violations (logger shadowed by a block function), got: ${
        JSON.stringify(violations)
      }`,
    );
  },
);
