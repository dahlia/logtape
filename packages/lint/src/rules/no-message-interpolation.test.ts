import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import { noMessageInterpolation } from "./no-message-interpolation.ts";

const PLUGIN_NAME = "logtape";
const RULE_NAME = "no-message-interpolation";
const QUALIFIED_NAME = `${PLUGIN_NAME}/${RULE_NAME}`;

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, [
    {
      plugins: {
        [PLUGIN_NAME]: { rules: { [RULE_NAME]: noMessageInterpolation } },
      },
      rules: { [QUALIFIED_NAME]: "error" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
}

test("no-message-interpolation: skips files without @logtape/logtape import", () => {
  const messages = lint(
    "const logger = { info: () => {} }; logger.info(`hello ${world}`);",
  );
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: flags template literal with interpolation as message", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].message.includes("template literal"));
});

test("no-message-interpolation: recognizes a jsr: LogTape import", () => {
  const messages = lint(
    `import { getLogger } from "jsr:@logtape/logtape@^1.0.0";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\`);`,
  );
  // A direct JSR specifier is a valid LogTape import, so the rule applies.
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: flags all log methods", () => {
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
logger.${method}(\`hello \${world}\`);`,
    );
    assert.strictEqual(
      messages.length,
      1,
      `Expected error for method ${method}`,
    );
  }
});

test("no-message-interpolation: allows plain string literals", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info("User {userId} logged in.", { userId });`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: allows tagged template literals (LogTape template syntax)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info\`User \${userId} logged in.\`;`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: allows backtick string with no interpolation", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(\`User logged in.\`);`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: flags multiple violations in one file", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\`);
logger.error(\`Request \${reqId} failed.\`);`,
  );
  assert.strictEqual(messages.length, 2);
});

test("no-message-interpolation: allows lazy evaluation callback as first arg", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info("msg", () => ({ x: 1 }));`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: does not flag non-logtape objects in logtape file", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
console.info(\`template \${value}\`);`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: flags inline getLogger(...).method() call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
getLogger(["test"]).info(\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: flags computed string method access", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger["info"](\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: does not flag when getLogger is shadowed by parameter", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
function f(getLogger) {
  const logger = getLogger(["test"]);
  logger.info(\`User \${userId} logged in.\`);
}`,
  );
  // logger inside f is initialized from the parameter, not the import
  assert.strictEqual(messages.length, 0);
});

test("no-message-interpolation: does not flag parameter-shadowed logger name", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function f(logger) {
  logger.info(\`template \${value}\`);
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test(
  "no-message-interpolation: still flags outer logger used inside function that shadows getLogger",
  () => {
    const messages = lint(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(getLogger) {
  logger.info(\`User \${userId} logged in.\`);
}`,
    );
    // logger was initialized from the real import in the outer scope; the
    // parameter shadow of getLogger inside handler must not hide that.
    assert.strictEqual(messages.length, 1);
  },
);

test("no-message-interpolation: flags contextual logger from .with()", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const reqLogger = getLogger("app").with({ requestId });
reqLogger.info(\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: flags child logger from getChild()", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const child = getLogger("app").getChild("sub");
child.info(\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: flags inline .with() chain call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
getLogger("app").with({ requestId }).info(\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: flags chained .getChild().with()", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const base = getLogger("app");
const ctx = base.getChild("sub").with({ requestId });
ctx.info(\`User \${userId} logged in.\`);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-message-interpolation: does not flag .with() on shadowed getLogger", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
function f(getLogger) {
  const reqLogger = getLogger("app").with({ requestId });
  reqLogger.info(\`User \${userId} logged in.\`);
}`,
  );
  // getLogger is the parameter here, not the import, so reqLogger is not a
  // LogTape logger.
  assert.strictEqual(messages.length, 0);
});
