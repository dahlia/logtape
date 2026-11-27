import assert from "node:assert/strict";
import test from "node:test";
import {
  getUnreferencedKeys,
  hasQuotedInterpolation,
  hasQuotedMessageSlot,
} from "./message-template.ts";

test("hasQuotedMessageSlot follows the runtime's brace boundaries", () => {
  for (const template of [
    '"{name}"',
    "'{ user?.name }'",
    "'{items[0].name}'",
    "'{*}'",
    "'{}'",
    `'{["name"]}'`,
    "'{a{b}'",
  ])
    assert.strictEqual(hasQuotedMessageSlot(template), true, template);
  for (const template of [
    '"{{name}}"',
    '"{{{name}}}"',
    "'{name}}'",
    "'{name",
    "'{name}\"",
    '"prefix {name}"',
    '"{first} {last}"',
    "‘{name}’",
  ])
    assert.strictEqual(hasQuotedMessageSlot(template), false, template);
});

test("hasQuotedInterpolation checks adjacent cooked chunks", () => {
  assert.ok(hasQuotedInterpolation(["Name: '", "'"]));
  assert.ok(hasQuotedInterpolation([null, ' and "', '"']));
  assert.ok(!hasQuotedInterpolation(["'", "", "'"]));
  assert.ok(!hasQuotedInterpolation(["'", null]));
  assert.ok(!hasQuotedInterpolation(['"', "'"]));
  assert.ok(!hasQuotedInterpolation(["' ", "'"]));
});

interface TemplateCase {
  readonly name: string;
  readonly template: string;
  readonly keys: readonly string[];
  readonly unused: readonly string[];
}

const cases: readonly TemplateCase[] = [
  { name: "plain message", template: "Started", keys: ["id"], unused: ["id"] },
  { name: "empty message", template: "", keys: ["id"], unused: ["id"] },
  { name: "empty bag", template: "{missing}", keys: [], unused: [] },
  {
    name: "multiple references",
    template: "{a} {b} {a}",
    keys: ["a", "b", "c"],
    unused: ["c"],
  },
  {
    name: "duplicate keys",
    template: "{a}",
    keys: ["c", "a", "b", "c"],
    unused: ["c", "b"],
  },
  { name: "escaped braces", template: "{{a}}", keys: ["a"], unused: ["a"] },
  { name: "unterminated brace", template: "{a", keys: ["a"], unused: ["a"] },
  {
    name: "unterminated braces after a complete slot",
    template: "{a} {b {c",
    keys: ["c", "a", "b"],
    unused: ["c", "b"],
  },
  {
    name: "opening brace in key",
    template: "{a{b}",
    keys: ["a{b", "b"],
    unused: ["b"],
  },
  {
    name: "first closing brace",
    template: "{ {name} }",
    keys: [" {name", "name"],
    unused: ["name"],
  },
  {
    name: "escaped then opening brace",
    template: "{{{name}",
    keys: ["name"],
    unused: [],
  },
  {
    name: "escaped closing braces",
    template: "}}{a}",
    keys: ["a"],
    unused: [],
  },
  {
    name: "padded key ambiguity",
    template: "{ a }",
    keys: [" a ", "a", "b"],
    unused: ["b"],
  },
  { name: "empty key", template: "{}", keys: ["", "a"], unused: ["a"] },
  { name: "whole bag", template: "{*}", keys: ["a", "b"], unused: [] },
  { name: "padded whole bag", template: "{ *\t}", keys: ["a"], unused: [] },
  { name: "literal star", template: "{*}", keys: ["*", "a"], unused: ["a"] },
  {
    name: "padded literal star",
    template: "{ * }",
    keys: [" * ", "*", "a"],
    unused: ["*", "a"],
  },
  {
    name: "trimmed literal star",
    template: "{ * }",
    keys: ["*", "a"],
    unused: ["a"],
  },
  {
    name: "independent wildcards",
    template: "{*} { * }",
    keys: ["*", " * ", "a"],
    unused: ["a"],
  },
  {
    name: "padded key does not shadow unpadded wildcard",
    template: "{*}",
    keys: [" * ", "a"],
    unused: [],
  },
  { name: "escaped wildcard", template: "{{*}}", keys: ["a"], unused: ["a"] },
  {
    name: "direct dotted and nested candidates",
    template: "{error.message}",
    keys: ["error.message", "error", "id"],
    unused: ["id"],
  },
  {
    name: "optional root",
    template: "{error?.cause}",
    keys: ["error"],
    unused: [],
  },
  {
    name: "initial optional access",
    template: "{?.error.message}",
    keys: ["error"],
    unused: [],
  },
  {
    name: "array below root",
    template: "{items[0].name}",
    keys: ["items"],
    unused: [],
  },
  {
    name: "quoted leading bracket",
    template: '{["full-name"].length}',
    keys: ["full-name"],
    unused: [],
  },
  {
    name: "single quoted leading bracket",
    template: "{['user'].name}",
    keys: ["user"],
    unused: [],
  },
  {
    name: "unquoted string bracket",
    template: "{[user].name}",
    keys: ["user"],
    unused: [],
  },
  {
    name: "untrimmed bracket root",
    template: "{[ foo ].x}",
    keys: [" foo ", "foo"],
    unused: ["foo"],
  },
  {
    name: "numeric-looking dot root",
    template: "{0.name}",
    keys: ["0"],
    unused: [],
  },
  {
    name: "numeric-looking quoted root",
    template: '{["0"].name}',
    keys: ["0"],
    unused: [],
  },
  {
    name: "numeric bracket root",
    template: "{[0].name}",
    keys: ["0"],
    unused: ["0"],
  },
  {
    name: "padded numeric bracket root",
    template: "{[ 1 ].name}",
    keys: ["1"],
    unused: ["1"],
  },
  {
    name: "question mark is not nested",
    template: "{a?b}",
    keys: ["a?b", "a"],
    unused: ["a"],
  },
  { name: "trailing dot", template: "{a.}", keys: ["a.", "a"], unused: ["a"] },
  {
    name: "invalid first segment",
    template: "{.a}",
    keys: [".a", "a"],
    unused: ["a"],
  },
  {
    name: "unterminated quoted root",
    template: '{["a}',
    keys: ['["a', "a"],
    unused: ["a"],
  },
  {
    name: "blocked nested root",
    template: "{constructor.name}",
    keys: ["constructor.name", "constructor"],
    unused: ["constructor"],
  },
  {
    name: "blocked quoted root",
    template: '{["__proto__"].x}',
    keys: ["__proto__"],
    unused: ["__proto__"],
  },
  {
    name: "direct prototype keys",
    template: "{__proto__} {prototype} {constructor}",
    keys: ["__proto__", "prototype", "constructor"],
    unused: [],
  },
  {
    name: "escaped leading quote",
    template: String.raw`{["quo\"te"].x}`,
    keys: ['quo"te'],
    unused: [],
  },
  {
    name: "escaped leading apostrophe",
    template: String.raw`{['quo\'te'].x}`,
    keys: ["quo'te"],
    unused: [],
  },
  {
    name: "escaped control characters",
    template: String.raw`{["\n\t\r\b\f\v\0\\"].x}`,
    keys: ["\n\t\r\b\f\v\0\\"],
    unused: [],
  },
  {
    name: "unicode escape",
    template: String.raw`{["\u0061"].x}`,
    keys: ["a"],
    unused: [],
  },
  {
    name: "permissive unicode escape",
    template: String.raw`{["\u006z"].x}`,
    keys: ["\x06"],
    unused: [],
  },
  {
    name: "invalid unicode escape",
    template: String.raw`{["\uzzzz"].x}`,
    keys: ["uzzzz"],
    unused: [],
  },
  {
    name: "unknown escape",
    template: String.raw`{["\q"].x}`,
    keys: ["q"],
    unused: [],
  },
];

for (const { name, template, keys, unused } of cases) {
  test(`getUnreferencedKeys(): ${name}`, () => {
    assert.deepStrictEqual(getUnreferencedKeys(template, keys), unused);
  });
}
