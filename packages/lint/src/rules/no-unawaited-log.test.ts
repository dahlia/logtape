import { Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import { noUnawaitedLog } from "./no-unawaited-log.ts";

const PLUGIN_NAME = "logtape";
const RULE_NAME = "no-unawaited-log";
const QUALIFIED_NAME = `${PLUGIN_NAME}/${RULE_NAME}`;

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, [
    {
      plugins: {
        [PLUGIN_NAME]: { rules: { [RULE_NAME]: noUnawaitedLog } },
      },
      rules: { [QUALIFIED_NAME]: "error" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
}

function applyFix(code: string): string | null {
  const linter = new Linter();
  const result = linter.verifyAndFix(code, [
    {
      plugins: {
        [PLUGIN_NAME]: { rules: { [RULE_NAME]: noUnawaitedLog } },
      },
      rules: { [QUALIFIED_NAME]: "error" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ]);
  return result.fixed ? result.output : null;
}

test("no-unawaited-log: skips files without @logtape/logtape import", () => {
  const messages = lint(
    "const logger = { debug: () => {} }; logger.debug('msg', async () => ({}));",
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags async arrow function without await", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("User data: {data}.", async () => ({ data: await fetchData() }));
}`,
  );
  assert.strictEqual(messages.length, 1);
  assert.ok(
    messages[0].message.includes("await") ||
      messages[0].message.includes("async"),
  );
});

test("no-unawaited-log: flags all log methods", () => {
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
async function handler() {
  logger.${method}("msg", async () => ({ x: await fn() }));
}`,
    );
    assert.strictEqual(
      messages.length,
      1,
      `Expected error for method ${method}`,
    );
  }
});

test("no-unawaited-log: allows awaited call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  await logger.debug("User data: {data}.", async () => ({ data: await fetchData() }));
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: allows .then() chaining", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", async () => ({ data: await fetchData() })).then(() => {});
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: allows sync arrow function (not flagged)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", () => ({ data: computeData() }));
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: fix inserts await when enclosing function is async", () => {
  const fixed = applyFix(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", async () => ({ data: await fetchData() }));
}`,
  );
  assert.notStrictEqual(fixed, null);
  assert.ok(fixed!.includes("await logger.debug"));
});

test("no-unawaited-log: no fix when enclosing function is not async", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  logger.debug("msg", async () => ({ data: await fetchData() }));
}`,
  );
  // Still flags, but the fix should not be applicable
  assert.strictEqual(messages.length, 1);
  // When the enclosing function is not async, fix is null
  assert.ok(!messages[0].fix);
});

test("no-unawaited-log: does not autofix when the call value is assigned", () => {
  const code = `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  const p = logger.debug("msg", async () => ({ data: await fetchData() }));
}`;
  const messages = lint(code);
  assert.strictEqual(messages.length, 1);
  // Inserting await would change p from Promise<void> to void, so no fix.
  assert.ok(!messages[0].fix);
  assert.strictEqual(applyFix(code), null);
});

test("no-unawaited-log: does not autofix when the call is an argument", () => {
  const code = `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  track(logger.debug("msg", async () => ({ data: await fetchData() })));
}`;
  const messages = lint(code);
  assert.strictEqual(messages.length, 1);
  assert.ok(!messages[0].fix);
});

test("no-unawaited-log: allows return statement (promise propagation)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  return logger.debug("msg", async () => ({ data: await fetchData() }));
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: allows .catch() chaining", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", async () => ({ data: await fetchData() })).catch(console.error);
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags bare .then property access without call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  const p = logger.debug("msg", async () => ({ data: await fetchData() }));
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags async function expression as callback", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", async function() { return { data: await fetchData() }; });
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a non-async callback returning a then() promise", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", () => fetchData().then((data) => ({ data })));
}`,
  );
  // LogTape awaits any promise the lazy callback returns, even without async.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a non-async block callback returning a promise", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger.debug("msg", () => {
    return Promise.resolve({ data: 1 });
  });
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: does not flag a sync callback returning a plain object", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  logger.debug("msg", () => ({ data: compute() }));
}`,
  );
  // A plain object return is synchronous; no promise is produced.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: allows concise arrow body (promise propagated)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const f = () => logger.debug("msg", async () => ({ data: await fetchData() }));`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags an async callback passed by reference", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  const props = async () => ({ data: await fetchData() });
  logger.info("msg", props);
}`,
  );
  // props resolves to an async function, so the log returns a Promise<void>.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: does not flag a sync callback passed by reference", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  const props = () => ({ data: 1 });
  logger.info("msg", props);
}`,
  );
  // props is a sync function, so no promise is returned.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags an async function declaration passed by reference", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  async function props() { return { data: await fetchData() }; }
  logger.info("msg", props);
}`,
  );
  // props is an async function declaration, so the log returns a Promise<void>.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a promise-returning callback passed by reference", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  const props = () => fetchData().then((data) => ({ data }));
  logger.info("msg", props);
}`,
  );
  // props is not async but returns a promise, so the log returns a
  // Promise<void> and still needs awaiting.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a promise-returning function declaration by reference", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  function props() { return fetchData().then((data) => ({ data })); }
  logger.info("msg", props);
}`,
  );
  // props is a non-async declaration that returns a promise.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: does not flag an async name shadowed by a parameter", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const props = async () => ({ data: 1 });
function handler(props) {
  logger.info("msg", props);
}`,
  );
  // Inside handler, props is the parameter, not the outer async function.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: does not flag log call nested inside awaited Promise.all", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  await Promise.all([logger.debug("msg", async () => ({ data: await fetchData() }))]);
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: does not flag log call nested inside awaited Promise.allSettled", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  await Promise.allSettled([logger.debug("msg", async () => ({ data: await fetchData() }))]);
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags log call inside Promise.race (settles early)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(timeout) {
  await Promise.race([logger.debug("msg", async () => ({ data: await fetchData() })), timeout]);
}`,
  );
  // Promise.race can settle on timeout before the log promise resolves, so the
  // log write is not guaranteed to flush.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags log call inside Promise.any (settles early)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(other) {
  await Promise.any([logger.debug("msg", async () => ({ data: await fetchData() })), other]);
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags concise arrow callback whose promise is discarded", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(items) {
  items.map(() => logger.debug("msg", async () => ({ data: await fetchData() })));
}`,
  );
  // The map() callback returns the promise, but the resulting array is
  // discarded, so the async log is never flushed.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: allows concise arrow callback inside awaited Promise.all", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await Promise.all(items.map(() => logger.debug("msg", async () => ({ data: await fetchData() }))));
}`,
  );
  // The map() result flows into an awaited Promise.all, so it is handled.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags a map() result nested in a Promise.all array", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await Promise.all([items.map(() => logger.debug("msg", async () => ({ data: await fetchData() })))]);
}`,
  );
  // Promise.all awaits the outer array's elements; that element is the map()
  // result array, whose per-item log promises are not awaited, so it is flagged.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags an awaited bare map() result", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await items.map(() => logger.debug("msg", async () => ({ data: await fetchData() })));
}`,
  );
  // await on a bare map() awaits the array, not the element promises, so the
  // async logs are still unflushed.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a map() result chained through array methods", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await items.map(() => logger.debug("msg", async () => ({ data: await fetchData() }))).filter(Boolean);
}`,
  );
  // The map() result is chained through filter(); awaiting that array still
  // does not await the element promises.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a log dropped by a comma operator", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(other) {
  await (logger.debug("msg", async () => ({ data: await fetchData() })), other);
}`,
  );
  // The comma operator yields only `other`; the log promise is dropped.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: does not flag a log that is the last comma operand", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(other) {
  await (other, logger.debug("msg", async () => ({ data: await fetchData() })));
}`,
  );
  // The log call is the last operand, so it is the awaited value.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags block-bodied callback whose returned promise is discarded", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(items) {
  items.forEach(() => {
    return logger.debug("msg", async () => ({ data: await fetchData() }));
  });
}`,
  );
  // The forEach() callback returns the promise, but forEach discards it, so
  // the async log is never flushed.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: allows block-bodied callback returned into awaited Promise.all", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await Promise.all(items.map(() => {
    return logger.debug("msg", async () => ({ data: await fetchData() }));
  }));
}`,
  );
  // The returned promise flows through map() into an awaited Promise.all.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags log promise wrapped in an awaited array literal", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  await [logger.debug("msg", async () => ({ data: await fetchData() }))];
}`,
  );
  // Awaiting a bare array does not await its element promises.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags log promise wrapped in a returned object literal", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  return { p: logger.debug("msg", async () => ({ data: await fetchData() })) };
}`,
  );
  // Returning an object that holds the promise does not propagate the promise.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags callback in an awaited forEach (a discarder)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await items.forEach(() => logger.debug("msg", async () => ({ data: await fetchData() })));
}`,
  );
  // forEach returns undefined, so awaiting it does not await the callback
  // promise; the log is still unflushed.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags callback returned from filter (a discarder)", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(items) {
  return items.filter(() => logger.debug("msg", async () => ({ data: await fetchData() })));
}`,
  );
  // filter coerces the callback result to a boolean, dropping the promise.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a callback in a computed discarder call", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler(items) {
  return items["forEach"](() => logger.debug("msg", async () => ({ data: await fetchData() })));
}`,
  );
  // items["forEach"](...) is the computed form of a discarder, so the returned
  // promise is still dropped.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a log returned from a reduce callback", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler(items) {
  await items.reduce(() => logger.debug("msg", async () => ({ data: await fetchData() })), undefined);
}`,
  );
  // reduce threads each callback result into the next accumulator rather than
  // awaiting it, so the per-item log promises are dropped.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: flags a log promise returned from a setTimeout callback", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  return setTimeout(() => logger.debug("msg", async () => ({ data: await fetchData() })), 0);
}`,
  );
  // setTimeout ignores its callback's return, so the log promise is never
  // awaited even though the callback "returns" it.
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: does not flag a log awaited inside a setTimeout callback", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
function handler() {
  setTimeout(async () => {
    await logger.debug("msg", async () => ({ data: await fetchData() }));
  }, 0);
}`,
  );
  // The log is awaited inside the callback, so it is handled.
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: does not flag non-logtape objects in logtape file", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  someOtherLogger.debug("msg", async () => ({ data: await fetchData() }));
}`,
  );
  assert.strictEqual(messages.length, 0);
});

test("no-unawaited-log: flags computed string method access", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
async function handler() {
  logger["debug"]("msg", async () => ({ x: await fetch() }));
}`,
  );
  assert.strictEqual(messages.length, 1);
});

test("no-unawaited-log: does not treat computed [then] access as .then()", () => {
  const messages = lint(
    `import { getLogger } from "@logtape/logtape";
const logger = getLogger(["test"]);
const then = "then";
async function handler() {
  logger.debug("msg", async () => ({ x: 1 }))[then](() => {});
}`,
  );
  assert.strictEqual(messages.length, 1);
});
