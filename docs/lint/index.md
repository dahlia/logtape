Lint rules
==========

*@logtape/lint* provides lint rules for [ESLint] (v8 and v9), [Oxlint], and
[Deno Lint] that detect common LogTape usage mistakes at development time.

[ESLint]: https://eslint.org/
[Oxlint]: https://oxc.rs/docs/guide/usage/linter.html
[Deno Lint]: https://docs.deno.com/runtime/reference/cli/linter/


Available rules
---------------

| Rule                         | Default severity | Fix               |
| ---------------------------- | ---------------- | ----------------- |
| [`no-dynamic-message`]       | off              | no                |
| [`no-message-interpolation`] | error            | no                |
| [`prefer-lazy-evaluation`]   | warn             | yes               |
| [`no-unawaited-log`]         | error            | yes (conditional) |
| [`require-meta-sink`]        | warn             | no                |

[`no-dynamic-message`]: /lint/no-dynamic-message
[`no-message-interpolation`]: /lint/no-message-interpolation
[`prefer-lazy-evaluation`]: /lint/prefer-lazy-evaluation
[`no-unawaited-log`]: /lint/no-unawaited-log
[`require-meta-sink`]: /lint/require-meta-sink


Installation
------------

::: code-group

~~~~ sh [Deno]
deno add jsr:@logtape/lint
~~~~

~~~~ sh [npm]
npm add --save-dev @logtape/lint
~~~~

~~~~ sh [pnpm]
pnpm add --save-dev @logtape/lint
~~~~

~~~~ sh [Yarn]
yarn add --dev @logtape/lint
~~~~

~~~~ sh [Bun]
bun add --dev @logtape/lint
~~~~

:::


ESLint configuration
--------------------

*@logtape/lint* ships with a ready-made `recommended` flat config preset for
[ESLint] v9.  Import the preset and spread it into your `eslint.config.js` (or
`eslint.config.mjs`):

~~~~ javascript
import logtape from "@logtape/lint/eslint";

export default [
  // ...other configs
  logtape.configs.recommended,
];
~~~~

The preset activates the four rules with a default severity of `error` or
`warn` (see the table above).  The `no-dynamic-message` rule remains off unless
you enable it explicitly.

For manual configuration, import the plugin and wire rules yourself:

~~~~ javascript
import logtape from "@logtape/lint/eslint";

export default [
  {
    plugins: { "@logtape": logtape },
    rules: {
      "@logtape/no-dynamic-message": "warn",
      "@logtape/no-message-interpolation": "error",
      "@logtape/prefer-lazy-evaluation": "warn",
      "@logtape/no-unawaited-log": "error",
      "@logtape/require-meta-sink": "warn",
    },
  },
];
~~~~


Oxlint configuration
--------------------

*@logtape/lint* rules follow the same plugin API as ESLint, so they work
with [Oxlint]'s ESLint-compatible plugin interface.  Add the plugin to your
`.oxlintrc.json`:

~~~~ json
{
  "jsPlugins": [
    { "name": "@logtape", "specifier": "@logtape/lint/eslint" }
  ],
  "rules": {
    "@logtape/no-dynamic-message": "warn",
    "@logtape/no-message-interpolation": "error",
    "@logtape/prefer-lazy-evaluation": "warn",
    "@logtape/no-unawaited-log": "error",
    "@logtape/require-meta-sink": "warn"
  }
}
~~~~


Deno Lint configuration
-----------------------

> [!WARNING]
> The Deno Lint plugin API is experimental (unstable).  This plugin requires
> Deno 2.2.0 or later with the `"unstable": ["lint"]` option in `deno.json`.

Add the plugin to your `deno.json` and list the rules you want to enable:

~~~~ json
{
  "unstable": ["lint"],
  "lint": {
    "plugins": ["jsr:@logtape/lint/deno/strict"],
    "rules": {
      "include": [
        "logtape/no-dynamic-message",
        "logtape/no-message-interpolation",
        "logtape/prefer-lazy-evaluation",
        "logtape/no-unawaited-log",
        "logtape/require-meta-sink"
      ]
    }
  }
}
~~~~

Use the `/deno/strict` entry point only when enabling opt-in rules such as
`no-dynamic-message`.  The default `/deno` entry point contains the four
recommended rules and leaves `no-dynamic-message` disabled.

Then run `deno lint` as usual.
