import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import { preferLazyEvaluation } from "./prefer-lazy-evaluation.ts";

const PLUGIN_NAME = "logtape";
const RULE_NAME = "prefer-lazy-evaluation";
const QUALIFIED_NAME = `${PLUGIN_NAME}/${RULE_NAME}`;

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, [
    {
      plugins: {
        [PLUGIN_NAME]: { rules: { [RULE_NAME]: preferLazyEvaluation } },
      },
      rules: { [QUALIFIED_NAME]: "warn" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
}

function applyFix(code: string): string | null {
  const linter = new Linter();
  const result = linter.verifyAndFix(code, [
    {
      plugins: {
        [PLUGIN_NAME]: { rules: { [RULE_NAME]: preferLazyEvaluation } },
      },
      rules: { [QUALIFIED_NAME]: "warn" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
  return result.fixed ? result.output : null;
}

test("prefer-lazy-evaluation: skips files without @logtape/logtape import", () => {
  const messages = lint(
    "const logger = { debug: () => {} }; logger.debug('msg', { x: fn() });",
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: flags ObjectExpression with call in property value", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("User data: {userData}.", { userData: fetchUserData(userId) });`,
  );
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].message.includes("lazy"));
});

test("prefer-lazy-evaluation: flags all log methods", () => {
  const methods = [
    "trace",
    "debug",
    "info",
    "warn",
    "warning",
    "error",
    "fatal",
  ];
  for (const method of methods) {
    const messages = lint(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.${method}("msg", { x: compute() });`,
    );
    assert.strictEqual(
      messages.length,
      1,
      `Expected warn for method ${method}`,
    );
  }
});

test("prefer-lazy-evaluation: allows arrow function callback (already lazy)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("User data: {userData}.", () => ({ userData: fetchUserData(userId) }));`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: allows plain object without call expressions", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { userId: userId, count: count });`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: flags nested call expression in property value", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { result: obj.method().value });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags call in array property value", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { items: getItems() });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: fix wraps object in arrow function", () => {
  const fixed = applyFix(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { userData: fetchData(id) });`,
  );
  assert.notStrictEqual(fixed, null);
  assert.ok(fixed!.includes("() => ({"));
});

test("prefer-lazy-evaluation: no error when no second arg", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info("Just a message.");`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: flags eager object in properties-only overload", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug({ data: fetchData(id) });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: allows plain properties-only object", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug({ method: "GET", url: "/api" });`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: fix inserts {*} message for properties-only overload", () => {
  const fixed = applyFix(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug({ data: fetchData(id) });`,
  );
  assert.notStrictEqual(fixed, null);
  assert.ok(
    fixed!.includes('logger.debug("{*}", () => ({ data: fetchData(id) }))'),
  );
});

test("prefer-lazy-evaluation: does not flag function value in property (already lazy)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { fn: () => expensive() });`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: does not flag a lazy() property value", () => {
  const messages = lint(
    `import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { value: lazy(() => expensive()) });`,
  );
  // lazy(() => ...) is the documented per-property lazy API, already deferred.
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: does not flag a lazy() value in the properties-only overload", () => {
  const messages = lint(
    `import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug({ value: lazy(() => expensive()) });`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: still flags an eager argument to lazy()", () => {
  const messages = lint(
    `import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { value: lazy(expensive()) });`,
  );
  // lazy(expensive()) evaluates expensive() eagerly, defeating the point.
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags a non-LogTape lazy() lookalike", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function lazy(fn) { return fn; }
logger.debug("msg", { value: lazy(() => expensive()) });`,
  );
  // Here lazy is a local function, not LogTape's lazy(), so the call is eager.
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags a lazy() shadowed by a parameter", () => {
  const messages = lint(
    `import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["test"]);
function f(lazy) {
  logger.debug("msg", { value: lazy(() => expensive()) });
}`,
  );
  // lazy is imported but shadowed by the parameter, so this lazy() is a normal
  // eager call, not LogTape's deferred wrapper.
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags new expression in property value", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { err: new Error("oops") });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags computed property key with call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { [computeKey()]: value });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags dynamic import in property value", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { mod: import("./mod.ts") });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags tagged template expression in property value", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { query: sql\`SELECT * FROM users\` });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags spread of function call in properties", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { ...fetchData() });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: flags computed string method access", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger["debug"]("msg", { x: compute() });`,
  );
  assert.strictEqual(messages.length, 1);
});

test("prefer-lazy-evaluation: does not flag arrow function value wrapping a call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.debug("msg", { getData: async () => fetchData() });`,
  );
  assert.strictEqual(messages.length, 0);
});

test("prefer-lazy-evaluation: flags but does not autofix when object has await", () => {
  const code = `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function f() {
  logger.debug("msg", { x: await fetchData() });
}`;
  const messages = lint(code);
  assert.strictEqual(messages.length, 1);
  // No autofix — wrapping would leave await in a non-async arrow function.
  assert.strictEqual(applyFix(code), null);
});
