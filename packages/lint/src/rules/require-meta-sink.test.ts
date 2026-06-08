import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import { requireMetaSink } from "./require-meta-sink.ts";

const PLUGIN_NAME = "logtape";
const RULE_NAME = "require-meta-sink";
const QUALIFIED_NAME = `${PLUGIN_NAME}/${RULE_NAME}`;

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, [
    {
      plugins: {
        [PLUGIN_NAME]: { rules: { [RULE_NAME]: requireMetaSink } },
      },
      rules: { [QUALIFIED_NAME]: "warn" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
}

const BASE_IMPORT =
  `import { configure, configureSync } from "@logtape/logtape";`;

test("require-meta-sink: skips files without @logtape/logtape import", () => {
  const messages = lint(
    `async function setup() {
  await configure({ sinks: { main: s }, loggers: [{ category: [], sinks: ["main"] }] });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: flags configure() without meta logger", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { main: getMainSink() },
    loggers: [{ category: [], sinks: ["main"] }],
  });
}`,
  );
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].message.includes("meta"));
});

test("require-meta-sink: recognizes a jsr: LogTape import", () => {
  const messages = lint(
    `import { configure } from "jsr:@logtape/logtape@^1.0.0";
async function setup() {
  await configure({
    sinks: { main: getMainSink() },
    loggers: [{ category: [], sinks: ["main"] }],
  });
}`,
  );
  // A direct JSR specifier is a valid LogTape import, so the rule applies.
  assert.strictEqual(messages.length, 1);
});

test("require-meta-sink: flags configureSync() without meta logger", () => {
  const messages = lint(
    `${BASE_IMPORT}
function setup() {
  configureSync({
    sinks: { main: getMainSink() },
    loggers: [{ category: [], sinks: ["main"] }],
  });
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test('require-meta-sink: flags a bare string "logtape" category', () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink(), main: getMainSink() },
    loggers: [
      { category: "logtape", sinks: ["console"] },
      { category: [], sinks: ["main"] },
    ],
  });
}`,
  );
  // core's meta check inspects category as an array, so a bare string does not
  // configure the meta logger; the rule must still warn.
  assert.strictEqual(messages.length, 1);
});

test('require-meta-sink: passes with ["logtape"] single-string array category', () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink(), main: getMainSink() },
    loggers: [
      { category: ["logtape"], sinks: ["console"] },
      { category: [], sinks: ["main"] },
    ],
  });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test('require-meta-sink: passes with ["logtape", "meta"] array category', () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink(), main: getMainSink() },
    loggers: [
      { category: ["logtape", "meta"], sinks: ["console"] },
      { category: [], sinks: ["main"] },
    ],
  });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: flags a bare backtick category (still a bare string)", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: \`logtape\`, sinks: ["console"] }],
  });
}`,
  );
  // A bare backtick string is still a string category, which core does not
  // treat as configuring the meta logger; the rule must warn.
  assert.strictEqual(messages.length, 1);
});

test("require-meta-sink: accepts a backtick element inside the array category", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: [\`logtape\`, \`meta\`], sinks: ["console"] }],
  });
}`,
  );
  // The array form resolves to ["logtape", "meta"] at runtime, which core does
  // recognize, so backtick elements within the array are fine.
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: computed variable key is not treated as category", () => {
  const messages = lint(
    `${BASE_IMPORT}
const category = "logtape";
async function setup() {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ [category]: "logtape", sinks: ["console"] }],
  });
}`,
  );
  // [category] is a dynamic key, not the literal "category" property, so there
  // is no meta logger entry and the rule must still warn.
  assert.strictEqual(messages.length, 1);
});

test("require-meta-sink: computed string-literal key is treated as category", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ ["category"]: ["logtape"], sinks: ["console"] }],
  });
}`,
  );
  // ["category"] is a literal computed key that genuinely names the property,
  // so this is a valid meta logger entry and the rule must not warn.
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: computed variable key is not treated as loggers", () => {
  const messages = lint(
    `${BASE_IMPORT}
const loggers = "dynamic";
async function setup() {
  await configure({
    sinks: { console: getConsoleSink() },
    [loggers]: [{ category: ["logtape", "meta"], sinks: ["console"] }],
  });
}`,
  );
  // [loggers] is a computed variable key, not the literal "loggers" property,
  // so no statically known loggers array exists and the rule must warn.
  assert.strictEqual(messages.length, 1);
});

test("require-meta-sink: flags meta entry with empty sinks array", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { main: getMainSink() },
    loggers: [
      { category: ["logtape"], sinks: [] },
      { category: [], sinks: ["main"] },
    ],
  });
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("require-meta-sink: handles renamed import (local alias)", () => {
  const messages = lint(
    `import { configure as cfg } from "@logtape/logtape";
async function setup() {
  await cfg({
    sinks: { main: getMainSink() },
    loggers: [{ category: [], sinks: ["main"] }],
  });
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("require-meta-sink: ignores non-configure calls", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await someOtherConfigure({ sinks: {}, loggers: [] });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test('require-meta-sink: accepts ["logtape"] single-element array category', () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { main: getSink() },
    loggers: [
      { category: ["my-app"], sinks: ["main"] },
      { category: ["logtape"], sinks: ["main"] },
    ],
  });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: flags configure() with no loggers property at all", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({ sinks: { main: getMainSink() } });
}`,
  );
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].message.includes("meta"));
});

test("require-meta-sink: no false positive when meta sinks is a variable reference", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  const mySinks = ["console"];
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [
      { category: ["logtape", "meta"], sinks: mySinks },
      { category: [], sinks: ["console"] },
    ],
  });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: no false positive when configure is shadowed by parameter", () => {
  const messages = lint(
    `import { configure } from "@logtape/logtape";
function setup(configure) {
  configure({ sinks: {}, loggers: [] });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: no false positive when loggers array has spread elements", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { main: getMainSink() },
    loggers: [...commonLoggers, { category: [], sinks: ["main"] }],
  });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: no false positive when a logger entry uses an object spread", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({
    sinks: { console: getConsoleSink(), main: getMainSink() },
    loggers: [{ ...metaLogger, sinks: ["console"] }, { category: [], sinks: ["main"] }],
  });
}`,
  );
  // The spread entry might be the meta logger; the rule cannot see into it, so
  // it must not warn.
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: no false positive when configure() has spread elements", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  await configure({ ...baseConfig, sinks: { main: getMainSink() } });
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("require-meta-sink: no error if loggers is not an array literal", () => {
  const messages = lint(
    `${BASE_IMPORT}
async function setup() {
  const loggers = getLoggers();
  await configure({ sinks: { main: s }, loggers });
}`,
  );
  // Can't statically analyze non-literal arrays, should not false positive
  assert.strictEqual(messages.length, 0);
});
