`no-unawaited-log`
==================

Require `await` on LogTape log calls that use async lazy callbacks.

| Severity | Fixable                                  | Category           |
| -------- | ---------------------------------------- | ------------------ |
| error    | yes (when enclosing function is `async`) | `no-unawaited-log` |


Rationale
---------

LogTape log methods accept a lazy callback as the second argument.  When that
callback is `async`, the log method returns a `Promise<void>`.  If the promise
is not awaited, LogTape cannot guarantee that the log record is fully processed
before execution moves on.

~~~~ typescript
// Incorrect — the async callback's result is silently dropped
logger.debug("Data: {d}.", async () => ({ d: await fetchData() }));

// Correct — awaiting ensures the log is flushed before continuing
await logger.debug("Data: {d}.", async () => ({ d: await fetchData() }));
~~~~

The rule is silent for:

 -  Synchronous callbacks (not `async`)
 -  Calls directly preceded by `await`
 -  Calls used as the return value of a function (promise is propagated)
 -  Calls chained with `.then()`, `.catch()`, or `.finally()`
 -  Calls that form the concise body of an arrow function (promise is
    propagated to the caller)

The auto-fix inserts `await ` before the log call.  It is only applied when the
enclosing function is itself `async`; otherwise the fix would introduce a
syntax error.


Examples
--------

### Incorrect

~~~~ typescript
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

async function handler() {
  logger.debug("Data: {d}.", async () => ({  // ← error
    d: await fetchData(),
  }));
}
~~~~

### Correct

~~~~ typescript
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

async function handler() {
  // Awaited:
  await logger.debug("Data: {d}.", async () => ({ d: await fetchData() }));

  // Returned (caller is responsible for awaiting):
  return logger.debug("Data: {d}.", async () => ({ d: await fetchData() }));
}

// Concise arrow body propagates the promise:
const logData = async () =>
  logger.debug("Data: {d}.", async () => ({ d: await fetchData() }));
~~~~


Configuration
-------------

ESLint v9 flat config:

~~~~ javascript
import logtape from "@logtape/lint/eslint";

export default [
  {
    plugins: { "@logtape": logtape },
    rules: {
      "@logtape/no-unawaited-log": "error",
    },
  },
];
~~~~

Deno Lint (`deno.json`):

~~~~ json
{
  "unstable": ["lint"],
  "lint": {
    "plugins": ["jsr:@logtape/lint/deno"],
    "rules": {
      "include": ["logtape/no-unawaited-log"]
    }
  }
}
~~~~
