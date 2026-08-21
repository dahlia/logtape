`no-dynamic-message`
====================

Disallow dynamic expressions in LogTape log message arguments.

| Severity | Fixable | Category             |
| -------- | ------- | -------------------- |
| off      | no      | `no-dynamic-message` |

This rule is opt-in.  It is not part of the `recommended` preset.


Rationale
---------

LogTape treats message strings as templates.  Passing text produced at runtime
as the message can accidentally interpret braces in that text as placeholders.
It also makes the event shape change with each value:

~~~~ typescript
// Bad: the runtime string becomes the message template
logger.info(message);

// Good: the template stays static and the value remains structured
logger.info("{message}", { message });
~~~~

The rule reports variables, property access, function calls, string
concatenation, and other expressions that may produce a dynamic message.  It
does not offer a fix because choosing a property name and deciding between
eager and lazy evaluation requires application context.


Examples
--------

### Incorrect

~~~~ typescript
logger.info(message);
logger.warn(getMessage());
logger.error(error.message);
logger.debug(prefix + suffix);
~~~~

For error-capable methods, pass the `Error` object directly when possible:

~~~~ typescript
logger.error(error);
~~~~

### Correct

~~~~ typescript
logger.info("User {userId} logged in.", { userId });
logger.info(`A static message.`);
logger.info({ userId });
logger.info((l) => l`User ${userId} logged in.`);
logger.error(error);

// LogTape's tagged template syntax is also allowed
logger.info`User ${userId} logged in.`;
~~~~

Direct template literals with `${}` interpolation are handled by the
[`no-message-interpolation`] rule.  Enabling both rules produces one diagnostic
for that syntax.  Enable both rules if you want to reject every dynamic message
form, including direct interpolation.

[`no-message-interpolation`]: /lint/no-message-interpolation


Type information and fallback inference
---------------------------------------

When an ESLint parser supplies TypeScript parser services, the rule checks the
resolved LogTape overload.  This lets it distinguish a string-returning
function call from calls that return structured properties, a callback, or an
`Error`.

Without parser services, the rule uses local syntax and scope information.  It
recognizes direct overload shapes, immutable `const` aliases, basic TypeScript
annotations, and function declarations.  Catch bindings remain ambiguous
because JavaScript can throw any value.  Mutable bindings, imports, property
access, and opaque function calls are also reported.  Oxlint and Deno Lint
currently use this fallback.


Configuration
-------------

ESLint v9 flat config:

~~~~ javascript
import logtape from "@logtape/lint/eslint";

export default [
  logtape.configs.recommended,
  {
    rules: {
      "logtape/no-dynamic-message": "warn",
    },
  },
];
~~~~

Deno Lint (`deno.json`):

~~~~ json
{
  "unstable": ["lint"],
  "lint": {
    "plugins": ["jsr:@logtape/lint/deno/strict"],
    "rules": {
      "include": [
        "logtape/no-dynamic-message",
        "logtape/no-message-interpolation"
      ]
    }
  }
}
~~~~

The default `@logtape/lint/deno` entry point excludes this opt-in rule.  Use
the `/deno/strict` entry point in its place when enabling the rule.
