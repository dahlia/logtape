<!-- deno-fmt-ignore-file -->

@logtape/lint: lint rules for LogTape
=====================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/lint* provides lint rules for [ESLint] (v8 and v9), [Oxlint], and
[Deno Lint] that detect common [LogTape] usage mistakes at development time.

[JSR badge]: https://jsr.io/badges/@logtape/lint
[JSR]: https://jsr.io/@logtape/lint
[npm badge]: https://img.shields.io/npm/v/@logtape/lint?logo=npm
[npm]: https://www.npmjs.com/package/@logtape/lint
[ESLint]: https://eslint.org/
[Oxlint]: https://oxc.rs/docs/guide/usage/linter.html
[Deno Lint]: https://docs.deno.com/runtime/reference/cli/linter/
[LogTape]: https://logtape.org/


Rules
-----

| Rule                       | Default severity | Fix               |
| -------------------------- | ---------------- | ----------------- |
| `no-message-interpolation` | error            | no                |
| `prefer-lazy-evaluation`   | warn             | yes               |
| `no-unawaited-log`         | error            | yes (conditional) |
| `require-meta-sink`        | warn             | no                |


Installation
------------

~~~~ sh
deno add --jsr      @logtape/lint   # for Deno
npm  add --save-dev @logtape/lint   # for npm
pnpm add --save-dev @logtape/lint   # for pnpm
yarn add --dev      @logtape/lint   # for Yarn
bun  add --dev      @logtape/lint   # for Bun
~~~~


Docs
----

The documentation for this package is available at
<https://logtape.org/lint/>.  For the API references, see
<https://jsr.io/@logtape/lint>.
