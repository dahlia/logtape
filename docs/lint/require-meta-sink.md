`require-meta-sink`
===================

Require a dedicated sink for the meta logger in `configure()` and
`configureSync()` calls.

| Severity | Fixable | Category            |
| -------- | ------- | ------------------- |
| warn     | no      | `require-meta-sink` |


Rationale
---------

LogTape uses its own logging infrastructure to emit diagnostic messages about
its internal operations (e.g., missing sinks, configuration errors).  These
messages are emitted under the `["logtape", "meta"]` category.

Without a dedicated meta logger entry, LogTape's diagnostics may:

 -  flow through a catch-all root logger, mixed with application logs,
 -  be swallowed if a covering logger entry has no sinks, or
 -  fall back to a built-in console sink (when no logger covers the meta
    category at all), accompanied by an informational diagnostic.

An explicit meta logger entry with at least one sink gives full control over
where LogTape's own diagnostics go, independent of the rest of the logging
configuration.

This rule warns whenever `configure()` or `configureSync()` is called without
a logger entry whose `category` is `["logtape"]` or `["logtape", "meta"]` and
whose `sinks` array is non-empty.  The category must be written in array form:
LogTape's own meta check inspects it as an array, so a bare string
`"logtape"` does not configure the meta logger.


Examples
--------

### Incorrect

~~~~ typescript
import { configure } from "@logtape/logtape";

await configure({
  sinks: { console: consoleSink },
  loggers: [
    // No meta logger entry → diagnostics fall back to the built-in console sink
    { category: ["my-app"], sinks: ["console"] },
  ],
});
~~~~

### Correct

~~~~ typescript
import { configure } from "@logtape/logtape";

await configure({
  sinks: { console: consoleSink },
  loggers: [
    { category: ["my-app"], sinks: ["console"] },
    // Either array form is accepted:
    { category: ["logtape"], sinks: ["console"] },
    // or:
    { category: ["logtape", "meta"], sinks: ["console"] },
  ],
});
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
      "@logtape/require-meta-sink": "warn",
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
      "include": ["logtape/require-meta-sink"]
    }
  }
}
~~~~
