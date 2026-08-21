import * as tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import "typescript";
import { noMessageInterpolation } from "./no-message-interpolation.ts";
import { noDynamicMessage } from "./no-dynamic-message.ts";

const pluginName = "logtape";
const ruleName = "no-dynamic-message";
const qualifiedName = `${pluginName}/${ruleName}`;

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, [
    {
      plugins: {
        [pluginName]: { rules: { [ruleName]: noDynamicMessage } },
      },
      rules: { [qualifiedName]: "error" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
}

function lintTypeScript(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, [
    {
      plugins: {
        [pluginName]: { rules: { [ruleName]: noDynamicMessage } },
      },
      rules: { [qualifiedName]: "error" },
      languageOptions: {
        // deno-lint-ignore no-explicit-any
        parser: tsParser as any,
        parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    },
  ]);
}

function lintTypeScriptWithTypeInformation(
  code: string,
): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(
    code,
    [
      {
        files: ["**/*.ts"],
        plugins: {
          [pluginName]: { rules: { [ruleName]: noDynamicMessage } },
        },
        rules: { [qualifiedName]: "error" },
        languageOptions: {
          // deno-lint-ignore no-explicit-any
          parser: tsParser as any,
          parserOptions: {
            projectService: { allowDefaultProject: ["typed-rule-test.ts"] },
            tsconfigRootDir: import.meta.dirname,
          },
        },
      },
    ],
    { filename: "typed-rule-test.ts" },
  );
}

test("no-dynamic-message: skips files without a LogTape import", () => {
  const messages = lint(
    "const logger = { info: () => {} }; logger.info(message);",
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: flags dynamic message expressions", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(message);
logger.warn(getMessage());
logger.error(error.message);
logger.debug(prefix + suffix);`,
  );
  assert.strictEqual(messages.length, 4);
});

test("no-dynamic-message: flags dynamic expressions for every log method", () => {
  for (
    const method of [
      "trace",
      "debug",
      "info",
      "warn",
      "warning",
      "error",
      "fatal",
    ]
  ) {
    const messages = lint(
      `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.${method}(getMessage());`,
    );
    assert.strictEqual(messages.length, 1, `Expected error for ${method}`);
  }
});

test("no-dynamic-message: allows static and non-message overloads", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info("User {userId} logged in.", { userId });
logger.info(\`A static message.\`);
logger.info({ userId });
logger.info(() => ["A static message.", { userId }]);
logger.error(new Error("Failed."));
logger.warn(Error("Failed."));
logger.info(42);`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: allows immutable aliases with safe shapes", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const message = "A static message.";
const alias = message;
const properties = { userId };
const callback = () => ["A static message.", { userId }];
function declaredCallback() { return ["A static message."]; }
logger.info(alias);
logger.info(properties);
logger.info(callback);
logger.info(declaredCallback);`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: flags dynamic array templates", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info([message]);
logger.info(new Array(getMessage()));
logger.info(new Proxy([getMessage()], {}));
logger.info(["Fixed."]);
logger.info(["User ", " logged in."], userId);`,
  );
  assert.strictEqual(messages.length, 3);
  assert.strictEqual(messages[0].line, 3, JSON.stringify(messages[0]));
});

test("no-dynamic-message: does not infer mutable array aliases as static", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const template = ["Fixed."];
template[0] = getMessage();
logger.info(template);`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].line, 5, JSON.stringify(messages[0]));
});

test("no-dynamic-message: uses basic TypeScript annotations as a fallback", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const properties = value as Record<string, unknown>;
const callback = value as () => unknown[];
const error = value as Error;
const message = value as string;
logger.info(properties);
logger.info(callback);
logger.error(error);
logger.info(message);`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(
    messages[0].ruleId,
    qualifiedName,
    JSON.stringify(messages[0]),
  );
});

test("no-dynamic-message: resolves annotations in the declaration scope", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
declare const cause: Error;
declare const properties: Record<string, unknown>;
function emit<Error, Record>() {
  logger.error(cause);
  logger.info(properties);
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: does not assume catch bindings are errors", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
try { risky(); } catch ({ message }) { logger.error(message); }
try { risky(); } catch (error) { logger.error(error); }`,
  );
  assert.strictEqual(messages.length, 2);
  for (const message of messages) {
    assert.strictEqual(message.ruleId, qualifiedName, JSON.stringify(message));
  }
});

test("no-dynamic-message: respects narrowed catch value types", () => {
  const messages = lintTypeScriptWithTypeInformation(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
try { risky(); } catch (error) {
  if (typeof error === "string") logger.error(error);
  if (error instanceof Error) logger.error(error);
}`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].line, 4, JSON.stringify(messages[0]));
});

test("no-dynamic-message: allows Error intersection types", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
declare const error: Error & { code: string };
logger.error(error);`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: prefers syntax that proves a static message", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const annotated: string = "Ready.";
const fixed = "Ready.";
logger.info(annotated);
logger.info("Ready." as string);
logger.info("Ready." satisfies string);
logger.info(fixed as string);
logger.info(fixed satisfies string);
logger.info(fixed!);`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: flags distinct string literal unions", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
declare const message: "started" | "finished";
logger.info(message);`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(
    messages[0].ruleId,
    qualifiedName,
    JSON.stringify(messages[0]),
  );
});

test("no-dynamic-message: does not trust arbitrary type reference names", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
type PayloadError = string;
const namedMessage = value as PayloadError;
const readonlyMessage = value as Readonly<string>;
const readonlyProperties = value as Readonly<Record<string, unknown>>;
logger.error(namedMessage);
logger.error(readonlyMessage);
logger.info(readonlyProperties);`,
  );
  assert.strictEqual(messages.length, 2);
  for (const message of messages) {
    assert.strictEqual(message.ruleId, qualifiedName, JSON.stringify(message));
  }
});

test("no-dynamic-message: rejects shadowed built-in names", () => {
  const messages = lintTypeScript(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
type Error = string;
type Record<Key, Value> = string;
type Readonly<Value> = string;
type Object = string;
declare const errorMessage: Error;
declare const recordMessage: Record<string, unknown>;
declare const readonlyMessage: Readonly<Record<string, unknown>>;
declare const objectMessage: Object;
function TypeError(): string { return getMessage(); }
function generic<Error>(genericMessage: Error) {
  logger.error(genericMessage);
}
logger.error(errorMessage);
logger.info(recordMessage);
logger.info(readonlyMessage);
logger.info(objectMessage);
logger.error(TypeError());`,
  );
  assert.strictEqual(messages.length, 6);
  for (const message of messages) {
    assert.strictEqual(message.ruleId, qualifiedName, JSON.stringify(message));
  }
});

test("no-dynamic-message: treats mutable aliases as ambiguous", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
let message = "Initially static.";
logger.info(message);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-dynamic-message: does not duplicate direct interpolation reports", () => {
  const linter = new Linter();
  const messages = linter.verify(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
logger.info(\`User \${userId} logged in.\`);`,
    [
      {
        plugins: {
          [pluginName]: {
            rules: {
              [ruleName]: noDynamicMessage,
              "no-message-interpolation": noMessageInterpolation,
            },
          },
        },
        rules: {
          [qualifiedName]: "error",
          "logtape/no-message-interpolation": "error",
        },
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      },
    ],
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].ruleId, "logtape/no-message-interpolation");
});

test("no-dynamic-message: flags an interpolated template behind an alias", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const message = \`User \${userId} logged in.\`;
logger.info(message);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-dynamic-message: suggests passing an Error object directly", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const error = new Error("Failed.");
logger.error(error.message);
logger.error(response.message);`,
  );
  assert.strictEqual(messages.length, 2);
  assert.ok(messages[0].message.includes("Error object directly"));
  assert.ok(!messages[1].message.includes("Error object directly"));
});

test("no-dynamic-message: recognizes contextual and computed logger calls", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger("app").with({ requestId }).getChild("worker");
logger["info"](message);`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-dynamic-message: recognizes wrapped logger initializers", () => {
  const messages = lintTypeScript(
    `import { getLogger, type Logger } from "@logtape/logtape";
const asserted = getLogger("test") as Logger;
const satisfied = getLogger("test") satisfies Logger;
const nonNull = getLogger("test")!;
asserted.info(message);
satisfied.info(message);
nonNull.info(message);`,
  );
  assert.strictEqual(messages.length, 3);
});

test("no-dynamic-message: recognizes imports after logger calls", () => {
  const messages = lint(
    `const logger = getLogger("test");
logger.info(message);
import { getLogger } from "@logtape/logtape";`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-dynamic-message: respects logger and getter shadowing", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger("app");
function first(logger) { logger.info(message); }
function second(getLogger) {
  getLogger("other").info(message);
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-dynamic-message: uses a resolved TypeScript overload", () => {
  const messages = lintTypeScriptWithTypeInformation(
    `import { getLogger } from "@logtape/logtape";
interface TestLogger {
  info(data: Record<string, unknown>): void;
  info(text: string): void;
  info(factory: () => readonly unknown[]): void;
  error(cause: Error): void;
  error(text: string): void;
}
declare function makeMessage(): string;
declare function makeProperties(): Record<string, unknown>;
declare function makeCallback(): () => readonly unknown[];
declare function makeError(): Error;
declare function makeCodedError(): Error & { code: string };
declare const ambiguous: any;
const logger: TestLogger = getLogger("test");
logger.info(makeMessage());
logger.info(makeProperties());
logger.info(makeCallback());
logger.error(makeError());
logger.error(makeCodedError());
logger.info(ambiguous);
logger.error(ambiguous);`,
  );
  assert.strictEqual(messages.length, 3);
  for (const message of messages) {
    assert.strictEqual(message.ruleId, qualifiedName, JSON.stringify(message));
  }
});

test("no-dynamic-message: flags computed TemplateStringsArray values", () => {
  const messages = lintTypeScriptWithTypeInformation(
    `import { getLogger } from "@logtape/logtape";
declare function makeTemplate(): TemplateStringsArray;
const logger = getLogger("test");
logger.info(makeTemplate());`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].line, 4, JSON.stringify(messages[0]));
});

test("no-dynamic-message: uses argument types for union signatures", () => {
  const messages = lintTypeScriptWithTypeInformation(
    `import { getLogger } from "@logtape/logtape";
interface TestLogger {
  info(value: string | Record<string, unknown>): void;
}
declare function makeMessage(): string;
declare function makeProperties(): Record<string, unknown>;
const logger: TestLogger = getLogger("test");
logger.info(makeMessage());
logger.info(makeProperties());`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].line, 8, JSON.stringify(messages[0]));
  assert.strictEqual(
    messages[0].ruleId,
    qualifiedName,
    JSON.stringify(messages[0]),
  );
});

test("no-dynamic-message: preserves exact string literal types", () => {
  const messages = lintTypeScriptWithTypeInformation(
    `import { getLogger } from "@logtape/logtape";
interface TestLogger {
  info(text: string): void;
}
declare function fixed(): "Ready.";
declare function dynamic(): string;
const logger: TestLogger = getLogger("test");
logger.info(fixed());
logger.info(dynamic());`,
  );
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].line, 9, JSON.stringify(messages[0]));
  assert.strictEqual(
    messages[0].ruleId,
    qualifiedName,
    JSON.stringify(messages[0]),
  );
});

test("no-dynamic-message: respects narrowed string literal types", () => {
  const messages = lintTypeScriptWithTypeInformation(
    `import { getLogger } from "@logtape/logtape";
declare let message: string;
const logger = getLogger("test");
if (message === "Ready.") logger.info(message);`,
  );
  assert.strictEqual(messages.length, 0, JSON.stringify(messages));
});
