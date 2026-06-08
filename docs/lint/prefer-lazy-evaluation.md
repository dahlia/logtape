`prefer-lazy-evaluation`
========================

Prefer lazy evaluation callbacks over eager property objects in LogTape log
calls.

| Severity | Fixable        | Category                 |
| -------- | -------------- | ------------------------ |
| warn     | yes (auto-fix) | `prefer-lazy-evaluation` |


Rationale
---------

LogTape log methods accept a second argument that provides structured
properties for the message.  This argument can be either an object literal or
a function that returns an object:

~~~~ typescript
// Eager: properties object is always evaluated
logger.debug("User data: {userData}.", { userData: fetchUserData(userId) });

// Lazy: callback is only called when the log level is active
logger.debug("User data: {userData}.", () => ({
  userData: fetchUserData(userId),
}));
~~~~

With an eager object, `fetchUserData(userId)` runs regardless of whether the
`debug` level is enabled.  With a lazy callback, the expensive call is skipped
entirely when debug logging is inactive.  This rule flags any property value
that contains a function call (`CallExpression`) anywhere in its subtree.

The auto-fix wraps the object literal in an arrow function:
`{ key: fn() }` → `() => ({ key: fn() })`.


Examples
--------

### Incorrect

~~~~ typescript
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

// Any function call anywhere in a property value triggers the rule:
logger.debug("Fetched data: {data}.", { data: fetchData() });
logger.debug("Value: {x}.", { x: compute() });
logger.info("Result: {r}.", { r: a.method() });
~~~~

### Correct

~~~~ typescript
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

// Wrap the object in an arrow function:
logger.debug("Fetched data: {data}.", () => ({ data: fetchData() }));
logger.debug("Value: {x}.", () => ({ x: compute() }));

// Plain property values without calls are fine:
logger.info("Hello {name}.", { name: "world" });
logger.info("Count: {n}.", { n: items.length });
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
      "@logtape/prefer-lazy-evaluation": "warn",
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
      "include": ["logtape/prefer-lazy-evaluation"]
    }
  }
}
~~~~
