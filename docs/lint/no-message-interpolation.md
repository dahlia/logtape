`no-message-interpolation`
==========================

Disallow template literal interpolation (`${}`) in LogTape log message
arguments.

| Severity | Fixable | Category                   |
| -------- | ------- | -------------------------- |
| error    | no      | `no-message-interpolation` |


Rationale
---------

LogTape supports structured logging through message templates with named
placeholders:

~~~~ typescript
logger.info("User {userId} logged in.", { userId });
~~~~

Template literal interpolation bypasses this structured logging system.
Interpolated values are embedded directly into the string and cannot be
filtered, indexed, or forwarded as structured properties by log sinks.

For example, with template literal interpolation the log record would be:

~~~~ typescript
// Bad — userId is baked into the string; sinks cannot see it as a field
logger.info(`User ${userId} logged in.`);
// → { message: "User 42 logged in." }
~~~~

With a structured template, the value is available as a separate property:

~~~~ typescript
// Good — userId is available as a structured field
logger.info("User {userId} logged in.", { userId });
// → { message: "User {userId} logged in.", userId: 42 }
~~~~


Examples
--------

### Incorrect

~~~~ typescript
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

logger.info(`User ${userId} logged in.`);       // ← error
logger.error(`Request ${reqId} failed.`);       // ← error
logger.debug(`Processing ${items.length} items.`); // ← error
~~~~

### Correct

~~~~ typescript
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

logger.info("User {userId} logged in.", { userId });
logger.error("Request {reqId} failed.", { reqId });
logger.debug("Processing {count} items.", { count: items.length });

// Plain backtick strings without ${} are allowed
logger.info(`User logged in.`);

// Tagged template literals (LogTape template syntax) are allowed
logger.info`User ${userId} logged in.`;
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
      "@logtape/no-message-interpolation": "error",
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
      "include": ["logtape/no-message-interpolation"]
    }
  }
}
~~~~
