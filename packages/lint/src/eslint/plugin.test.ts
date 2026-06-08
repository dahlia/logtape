import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import plugin, { recommended, rules } from "./plugin.ts";

test("plugin: exports meta.name", () => {
  assert.strictEqual(plugin.meta.name, "@logtape/lint");
});

test("plugin: exports all four rules", () => {
  assert.ok("no-message-interpolation" in rules);
  assert.ok("prefer-lazy-evaluation" in rules);
  assert.ok("no-unawaited-log" in rules);
  assert.ok("require-meta-sink" in rules);
});

test("plugin: recommended config includes plugin reference", () => {
  // deno-lint-ignore no-explicit-any
  assert.ok((recommended as any).plugins?.logtape === plugin);
});

test("plugin: recommended config specifies all rules", () => {
  const r = recommended.rules ?? {};
  assert.strictEqual(r["logtape/no-message-interpolation"], "error");
  assert.strictEqual(r["logtape/prefer-lazy-evaluation"], "warn");
  assert.strictEqual(r["logtape/no-unawaited-log"], "error");
  assert.strictEqual(r["logtape/require-meta-sink"], "warn");
});

test("plugin: configs.recommended matches exported recommended", () => {
  assert.strictEqual(plugin.configs["recommended"], recommended);
});

// Integration tests using ESLint Linter API

test("plugin integration: all rules active via recommended preset", () => {
  const linter = new Linter();
  const code = `import { getLogger, configure } from "@logtape/logtape";
const logger = getLogger(["test"]);
// Triggers no-message-interpolation
logger.info(\`User \${userId} logged in.\`);
`;
  const messages = linter.verify(code, [recommended]);
  const byRule = messages.filter(
    (m) => m.ruleId === "logtape/no-message-interpolation",
  );
  assert.ok(byRule.length >= 1, "Should have no-message-interpolation error");
});

test("plugin integration: no-message-interpolation fires on template literal", () => {
  const linter = new Linter();
  const messages = linter.verify(
    `import { getLogger } from "@logtape/logtape";
const l = getLogger(["x"]);
l.warn(\`Request \${id} failed.\`);`,
    [
      {
        plugins: { logtape: plugin },
        rules: { "logtape/no-message-interpolation": "error" },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ],
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].ruleId, "logtape/no-message-interpolation");
});

test("plugin integration: prefer-lazy-evaluation fires on eager object", () => {
  const linter = new Linter();
  const messages = linter.verify(
    `import { getLogger } from "@logtape/logtape";
const l = getLogger(["x"]);
l.debug("msg", { data: compute() });`,
    [
      {
        plugins: { logtape: plugin },
        rules: { "logtape/prefer-lazy-evaluation": "warn" },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ],
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].ruleId, "logtape/prefer-lazy-evaluation");
});

test("plugin integration: no-unawaited-log fires on unawaited async callback", () => {
  const linter = new Linter();
  const messages = linter.verify(
    `import { getLogger } from "@logtape/logtape";
const l = getLogger(["x"]);
async function h() {
  l.debug("msg", async () => ({ data: await fetch() }));
}`,
    [
      {
        plugins: { logtape: plugin },
        rules: { "logtape/no-unawaited-log": "error" },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ],
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].ruleId, "logtape/no-unawaited-log");
});

test("plugin integration: require-meta-sink fires on configure without meta", () => {
  const linter = new Linter();
  const messages = linter.verify(
    `import { configure } from "@logtape/logtape";
async function setup() {
  await configure({
    sinks: { main: s },
    loggers: [{ category: [], sinks: ["main"] }],
  });
}`,
    [
      {
        plugins: { logtape: plugin },
        rules: { "logtape/require-meta-sink": "warn" },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ],
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].ruleId, "logtape/require-meta-sink");
});

test("plugin integration: no false positives for correct code", () => {
  const linter = new Linter();
  const messages = linter.verify(
    `import { getLogger, configure } from "@logtape/logtape";
const logger = getLogger(["app"]);
async function setup() {
  await configure({
    sinks: { console: getConsoleSink(), file: getFileSink() },
    loggers: [
      { category: ["logtape", "meta"], sinks: ["console"] },
      { category: ["app"], sinks: ["file"] },
    ],
  });
}
logger.info("User {userId} logged in.", { userId: "abc" });
await logger.info("Data: {data}.", async () => ({ data: await fetchData() }));`,
    [recommended],
  );
  assert.strictEqual(messages.length, 0);
});
