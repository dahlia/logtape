import * as tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import { noUnrenderedProperties } from "./no-unrendered-properties.ts";

const ruleName = "logtape/no-unrendered-properties";
const preamble =
  'import { getLogger } from "@logtape/logtape"; const logger = getLogger("test");\n';

function lint(source: string, typescript = false): Linter.LintMessage[] {
  return new Linter().verify(source, [
    {
      plugins: {
        logtape: {
          rules: { "no-unrendered-properties": noUnrenderedProperties },
        },
      },
      rules: { [ruleName]: "warn" },
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ...(typescript ? { parser: tsParser } : {}),
      },
    },
  ]);
}

test("no-unrendered-properties: reports each omitted key at warning severity", () => {
  const messages = lint(
    preamble + 'logger.error("{op}: {type}", { op, type, error, id });',
  );
  assert.deepStrictEqual(
    messages.map((m) => ({ id: m.messageId, severity: m.severity })),
    [
      { id: "unrenderedProperty", severity: 1 },
      { id: "unrenderedProperty", severity: 1 },
    ],
  );
  assert.match(messages[0].message, /Property 'error'/);
  assert.match(messages[1].message, /Property 'id'/);
  for (const message of messages) {
    assert.strictEqual(message.fix, undefined);
    assert.strictEqual(message.suggestions, undefined);
  }
});

const cases: readonly [string, string, readonly string[]][] = [
  ["matched fields", 'logger.info("{a} {b}", { a, b });', []],
  [
    "renamed value",
    'logger.info("{reason}", { reason: e.message, error: e });',
    ["error"],
  ],
  ["static backticks", "logger.info(`{a}`, { a, b });", ["b"]],
  ["sync arrow", 'logger.info("{a}", () => ({ a, b }));', ["b"]],
  ["async arrow", 'logger.info("{a}", async () => ({ a, b }));', ["b"]],
  ["no fields", 'logger.info("Ready", {});', []],
  [
    "literal asterisk",
    'logger.info("{*}", { "*": undefined, error });',
    ["error"],
  ],
  [
    "numeric keys",
    'logger.info("{1000} {16}", { 1e3: a, 0x10: b, 1.50: c });',
    ["1.5"],
  ],
  [
    "computed literal keys",
    'logger.info("{a}", { ["a"]: a, [`b`]: b, [2]: c });',
    ["b", "2"],
  ],
  ["duplicate field", 'logger.info("Ready", { a: 1, a: 2 });', ["a"]],
  [
    "accessors and methods",
    'logger.info("Ready", { get a() { throw 1; }, set b(value) {}, c() {} });',
    ["a", "b", "c"],
  ],
  ["prototype setter", 'logger.info("Ready", { __proto__: null, a });', ["a"]],
  [
    "quoted prototype setter",
    'logger.info("Ready", { "__proto__": null, a });',
    ["a"],
  ],
  [
    "computed proto property",
    'logger.info("Ready", { ["__proto__"]: null });',
    ["__proto__"],
  ],
  [
    "shorthand proto property",
    'logger.info("Ready", { __proto__ });',
    ["__proto__"],
  ],
  [
    "proto accessor",
    'logger.info("Ready", { get __proto__() { return null; } });',
    ["__proto__"],
  ],
  [
    "context fields ignored",
    'logger.with({ contextId }).info("{a}", { a });',
    [],
  ],
  [
    "new contextual fields",
    'logger.with({ contextId }).getChild("child").info("Ready", { a });',
    ["a"],
  ],
  ["inline getter", 'getLogger("child").info("Ready", { a });', ["a"]],
  ["spread bag", 'logger.info("Ready", { a, ...rest });', []],
  ["unknown computed key", 'logger.info("Ready", { a, [key]: b });', []],
  ["bigint key", 'logger.info("Ready", { 1n: a, b });', []],
  ["dynamic message", "logger.info(message, { a });", []],
  ["concatenated message", 'logger.info("Ready" + suffix, { a });', []],
  ["interpolated message", "logger.info(`Ready ${id}`, { a });", []],
  ["referenced bag", 'logger.info("Ready", properties);', []],
  ["block callback", 'logger.info("Ready", () => { return { a }; });', []],
  [
    "function callback",
    'logger.info("Ready", function () { return { a }; });',
    [],
  ],
  ["properties-only overload", "logger.info({ a });", []],
  ["error-first overload", 'logger.error(new Error("Oops"), { a });', []],
  ["error-second overload", 'logger.error("Oops", new Error("Oops"));', []],
  ["callback overload", "logger.info(l => l`Ready ${id}`, { a });", []],
  ["tagged template overload", "logger.info`Ready ${{ a }}`;", []],
  ["array template overload", 'logger.info(["Ready"], { a });', []],
  ["unrelated method", 'logger.getChild("child", { a });', []],
  ["unrelated object", 'console.info("Ready", { a });', []],
  [
    "shadowed logger",
    'function run(logger) { logger.info("Ready", { a }); }',
    [],
  ],
];
for (const [name, source, keys] of cases) {
  test(`no-unrendered-properties: ${name}`, () => {
    const messages = lint(preamble + source);
    assert.deepStrictEqual(
      messages.map((m) => m.ruleId),
      keys.map(() => ruleName),
    );
    assert.deepStrictEqual(
      messages.map((m) => m.message),
      keys.map(
        (key) =>
          `Property '${key}' is not referenced by the message template and may be omitted by sinks that output only the message.`,
      ),
    );
  });
}

test("no-unrendered-properties: reports the last duplicate key location", () => {
  const messages = lint(preamble + 'logger.info("Ready", { a: 1, a: 2 });');
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].line, 2);
  assert.strictEqual(messages[0].column, 30);
  assert.strictEqual(messages[0].endColumn, 31);
});

test("no-unrendered-properties: supports every log level and computed method", () => {
  for (const method of [
    "trace",
    "debug",
    "info",
    "warn",
    "warning",
    "error",
    "fatal",
  ]) {
    assert.strictEqual(
      lint(preamble + `logger.${method}("Ready", { a });`).length,
      1,
    );
    assert.strictEqual(
      lint(preamble + `logger["${method}"]("Ready", { a });`).length,
      1,
    );
  }
});

test("no-unrendered-properties: recognizes aliased and versioned imports", () => {
  for (const specifier of [
    "@logtape/logtape",
    "jsr:@logtape/logtape@^2.0.0",
    "npm:@logtape/logtape@^2.0.0",
  ]) {
    const messages = lint(
      `import { getLogger as get } from "${specifier}"; const log = get("x"); log.info("Ready", { a });`,
    );
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].ruleId, ruleName);
  }
});

test("no-unrendered-properties: ignores custom factories and shadowed imports", () => {
  assert.deepStrictEqual(
    lint('const log = getAppLogger("x"); log.info("Ready", { a });'),
    [],
  );
  assert.deepStrictEqual(
    lint(
      'import { getLogger } from "@logtape/logtape"; function run(getLogger) { const log = getLogger("x"); log.info("Ready", { a }); }',
    ),
    [],
  );
});

test("no-unrendered-properties: unwraps TypeScript message, bag and arrow assertions", () => {
  for (const properties of [
    "({ a } as const)",
    "(() => ({ a } satisfies Record<string, unknown>))!",
    "async () => (({ a }) as const)",
  ]) {
    const messages = lint(
      preamble + `logger.info(("Ready" as const)!, ${properties});`,
      true,
    );
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].ruleId, ruleName);
  }
  const messages = lint(
    preamble + 'logger.info("{a}", { ["a" as string]: 1, [2 as number]: 2 });',
    true,
  );
  assert.strictEqual(messages.length, 1);
  assert.match(messages[0].message, /Property '2'/);
});
