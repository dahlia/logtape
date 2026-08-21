 -  Added an opt-in `no-dynamic-message` rule to *@logtape/lint* for finding
    dynamic expressions passed as log messages.  The rule uses available
    TypeScript type information to distinguish properties, callbacks, and
    `Error` overloads, with local inference as a fallback.  Deno Lint users can
    enable it through the `@logtape/lint/deno/strict` entry point.  [[#199]]
