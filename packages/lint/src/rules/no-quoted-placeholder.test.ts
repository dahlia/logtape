import parser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import plugin from "../eslint/plugin.ts";
import {
  quotedPlaceholderLines,
  quotedPlaceholderSource,
} from "../quoted-placeholder.fixture.ts";

const ruleId = "logging/no-quoted-placeholder";
const config = {
  plugins: { logging: plugin },
  languageOptions: { parser },
  rules: { [ruleId]: "warn" as const },
};

test("no-quoted-placeholder reports one diagnostic per message", () => {
  const linter = new Linter();
  const messages = linter.verify(quotedPlaceholderSource, config);
  assert.deepStrictEqual(
    messages.map((m) => m.line),
    quotedPlaceholderLines,
  );
  for (const message of messages) {
    assert.strictEqual(message.ruleId, ruleId);
    assert.strictEqual(message.messageId, "quotedPlaceholder");
    assert.strictEqual(
      message.message,
      "Avoid quoting a LogTape placeholder; some formatters already quote string values.",
    );
    assert.strictEqual(message.severity, 1);
    assert.strictEqual(message.fix, undefined);
    assert.strictEqual(message.suggestions, undefined);
  }
  const fixed = linter.verifyAndFix(quotedPlaceholderSource, config);
  assert.strictEqual(fixed.fixed, false);
  assert.strictEqual(fixed.output, quotedPlaceholderSource);
});

test("no-quoted-placeholder uses the template start for suppression", () => {
  const source = [
    'import { getLogger } from "@logtape/logtape";',
    'const logger = getLogger("app");',
    "// eslint-disable-next-line logging/no-quoted-placeholder",
    "logger.info`",
    "User '${name}'`;",
    "logger.info(",
    "  // eslint-disable-next-line logging/no-quoted-placeholder",
    `  '"{name}"'`,
    ");",
  ].join("\n");
  const linter = new Linter();
  assert.deepStrictEqual(linter.verify(source, config), []);
  assert.deepStrictEqual(
    linter
      .verify(source, config, { allowInlineConfig: false })
      .map((m) => m.line),
    [4, 8],
  );
});
