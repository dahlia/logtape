Development checks
==================

`mise run check` (also available as `check:node`) builds fresh npm artifacts,
checks local source and tests with TypeScript, runs Oxlint, and checks
formatting and the changelog. `mise run check:deno` runs Deno's type checker
and its complete recommended lint rule set.


Formatting
----------

Oxfmt formats JavaScript, TypeScript, and JSON files using the existing
exclusions.  Hongdown and Sacho own Markdown; the built-in `mise fmt` command
formats mise configuration.  Import sorting,
package.json sorting, embedded-language formatting, and JSDoc rewriting are
turned off.  The JSON override uses a one-column print width to keep arrays
expanded as `deno fmt` prints them.  String values and property lines retain
their normal layout.

The migration compared these Oxfmt 0.73.0 configurations against commit
9a3cc8df in disposable copies.  All used 80 columns for code, two spaces,
double quotes, semicolons, trailing commas, and LF endings.

| Configuration                   | Changed files | Added lines | Removed lines |
| ------------------------------- | ------------: | ----------: | ------------: |
| Preserve objects, ordinary JSON |           179 |       8,516 |         7,989 |
| Preserve objects, expanded JSON |           148 |       8,404 |         7,544 |
| Collapse objects, expanded JSON |           174 |       8,645 |         9,602 |

The second configuration preserves every existing JSON file.  Remaining code
differences include array and call wrapping, union indentation, and redundant
parentheses.  The formatter commit isolates those differences.  A second
formatter run produces no further changes.  Suppression comments must remain
adjacent to the tokens they cover after wrapping; this also applies to
`@ts-expect-error`.


Type checking
-------------

*scripts/check-types.ts* reads *tsconfig.check.json* explicitly.  The
non-default file name keeps tsdown and Bun on their existing configuration
defaults.  Each npm package has its own compiler program.  Internal aliases map
to the source of that package's published `types` target; peer packages resolve
to freshly built declarations.  This keeps package-specific `#util` meanings
separate.

The checker includes npm source and test files, runtime variants, package build
configurations and samples, development scripts, and benchmarks.  It verifies
that every selected root file is included in the program.  A Git file inventory
also rejects unassigned source files, applies Deno's existing exclusions, and
assigns the JSR-only test package to Deno.  Relative ESM imports
with cache-busting queries resolve to the same source file for type checking.
Node keeps the query when it runs the tests.

The TypeScript version follows the pnpm catalog.  The migration baseline uses
TypeScript 5.8.3 for Node checks and Deno 2.9.7's TypeScript 6.0.3 for
compatibility checks.  `skipLibCheck` skips declaration internals, including
invalid declarations and declarations referencing optional dependencies in
fast-check and tsdown.  This also applies to built peer declarations; each peer
implementation is checked strictly in its own program.  Artifact tests check
representative ESM and CJS consumers.  A separate Node-only program checks the
core formatter without Deno globals, preserving its cross-runtime suppression
comments.

Node checks use the published `@types/deno` 2.7.0 declarations for shared
runtime branches.  Bun globals are enabled only for packages that require
them.  The JSR-only *packages/testing-deno/* remains under the Deno checker and
runner, including [newer test APIs][deno-sanitizer] missing from those npm
declarations. Deno compatibility checks validate the runtime's APIs and
import-map resolution.

[deno-sanitizer]: https://github.com/denoland/deno/blob/v2.9.7/cli/tsc/dts/lib.deno.ns.d.ts


Lint rules
----------

Oxlint enables counterparts for 72 of the 87 rules in Deno 2.9.7's recommended
set.
The table records every mapping.  Engine details can differ, so the separate
Deno compatibility check runs the complete recommended set, including every
rule without an Oxlint mapping.

`no-empty-interface` allows an empty interface that extends exactly one
interface, as Deno does.  The `ban-ts-comment` configuration accepts suppression
comments that include a description.  Unused bindings are allowed when their
names start with an underscore, matching Deno's convention.  Two test-only
assignments that record `this` have explicit Oxlint suppressions because
Oxlint's `no-this-alias` flags assignments as well as declarations; Deno checks
declarations.

When both linters need a next-line suppression, put the Oxlint block directive
and the Deno line directive on the same line.  Stacking next-line directives on
separate lines fails one of the linters.  Both linters pass after Oxfmt formats
the paired form. Oxlint reports unused disable directives, and Deno checks its
own directives.

| Deno recommended rule               | Oxlint rule or retained check             |
| ----------------------------------- | ----------------------------------------- |
| `adjacent-overload-signatures`      | `typescript/adjacent-overload-signatures` |
| `ban-ts-comment`                    | `typescript/ban-ts-comment`               |
| `ban-types`                         | `typescript/ban-types`                    |
| `ban-unknown-rule-code`             | Deno compatibility lint                   |
| `ban-untagged-ignore`               | Deno compatibility lint                   |
| `ban-unused-ignore`                 | Deno compatibility lint                   |
| `constructor-super`                 | `eslint/constructor-super`                |
| `for-direction`                     | `eslint/for-direction`                    |
| `getter-return`                     | `eslint/getter-return`                    |
| `jsx-boolean-value`                 | `react/jsx-boolean-value`                 |
| `jsx-button-has-type`               | `react/button-has-type`                   |
| `jsx-curly-braces`                  | `react/jsx-curly-brace-presence`          |
| `jsx-key`                           | `react/jsx-key`                           |
| `jsx-no-children-prop`              | `react/no-children-prop`                  |
| `jsx-no-comment-text-nodes`         | `react/jsx-no-comment-textnodes`          |
| `jsx-no-duplicate-props`            | `react/jsx-no-duplicate-props`            |
| `jsx-no-unescaped-entities`         | `react/no-unescaped-entities`             |
| `jsx-no-useless-fragment`           | `react/jsx-no-useless-fragment`           |
| `jsx-props-no-spread-multi`         | `react/jsx-props-no-spread-multi`         |
| `jsx-void-dom-elements-no-children` | `react/void-dom-elements-no-children`     |
| `no-array-constructor`              | `eslint/no-array-constructor`             |
| `no-async-promise-executor`         | `eslint/no-async-promise-executor`        |
| `no-await-in-sync-fn`               | Deno compatibility lint                   |
| `no-case-declarations`              | `eslint/no-case-declarations`             |
| `no-class-assign`                   | `eslint/no-class-assign`                  |
| `no-compare-neg-zero`               | `eslint/no-compare-neg-zero`              |
| `no-cond-assign`                    | `eslint/no-cond-assign`                   |
| `no-const-assign`                   | `eslint/no-const-assign`                  |
| `no-constant-condition`             | `eslint/no-constant-condition`            |
| `no-control-regex`                  | `eslint/no-control-regex`                 |
| `no-debugger`                       | `eslint/no-debugger`                      |
| `no-delete-var`                     | `eslint/no-delete-var`                    |
| `no-deprecated-deno-api`            | Deno compatibility lint                   |
| `no-dupe-args`                      | Deno compatibility lint                   |
| `no-dupe-class-members`             | `eslint/no-dupe-class-members`            |
| `no-dupe-else-if`                   | `eslint/no-dupe-else-if`                  |
| `no-dupe-keys`                      | `eslint/no-dupe-keys`                     |
| `no-duplicate-case`                 | `eslint/no-duplicate-case`                |
| `no-empty`                          | `eslint/no-empty`                         |
| `no-empty-character-class`          | `eslint/no-empty-character-class`         |
| `no-empty-enum`                     | Deno compatibility lint                   |
| `no-empty-interface`                | `typescript/no-empty-interface`           |
| `no-empty-pattern`                  | `eslint/no-empty-pattern`                 |
| `no-ex-assign`                      | `eslint/no-ex-assign`                     |
| `no-explicit-any`                   | `typescript/no-explicit-any`              |
| `no-extra-boolean-cast`             | `eslint/no-extra-boolean-cast`            |
| `no-extra-non-null-assertion`       | `typescript/no-extra-non-null-assertion`  |
| `no-fallthrough`                    | `eslint/no-fallthrough`                   |
| `no-func-assign`                    | `eslint/no-func-assign`                   |
| `no-global-assign`                  | `eslint/no-global-assign`                 |
| `no-import-assertions`              | Deno compatibility lint                   |
| `no-import-assign`                  | `eslint/no-import-assign`                 |
| `no-inner-declarations`             | `eslint/no-inner-declarations`            |
| `no-invalid-regexp`                 | `eslint/no-invalid-regexp`                |
| `no-invalid-triple-slash-reference` | Deno compatibility lint                   |
| `no-irregular-whitespace`           | `eslint/no-irregular-whitespace`          |
| `no-misused-new`                    | `typescript/no-misused-new`               |
| `no-namespace`                      | `typescript/no-namespace`                 |
| `no-new-symbol`                     | Deno compatibility lint                   |
| `no-obj-calls`                      | `eslint/no-obj-calls`                     |
| `no-octal`                          | Deno compatibility lint                   |
| `no-prototype-builtins`             | `eslint/no-prototype-builtins`            |
| `no-redeclare`                      | `eslint/no-redeclare`                     |
| `no-regex-spaces`                   | `eslint/no-regex-spaces`                  |
| `no-self-assign`                    | `eslint/no-self-assign`                   |
| `no-setter-return`                  | `eslint/no-setter-return`                 |
| `no-shadow-restricted-names`        | `eslint/no-shadow-restricted-names`       |
| `no-sloppy-imports`                 | Deno compatibility lint                   |
| `no-this-alias`                     | `typescript/no-this-alias`                |
| `no-this-before-super`              | `eslint/no-this-before-super`             |
| `no-unreachable`                    | `eslint/no-unreachable`                   |
| `no-unsafe-finally`                 | `eslint/no-unsafe-finally`                |
| `no-unsafe-negation`                | `eslint/no-unsafe-negation`               |
| `no-unused-labels`                  | `eslint/no-unused-labels`                 |
| `no-unused-vars`                    | `eslint/no-unused-vars`                   |
| `no-unversioned-import`             | Deno compatibility lint                   |
| `no-var`                            | `eslint/no-var`                           |
| `no-window`                         | Deno compatibility lint                   |
| `no-window-prefix`                  | Deno compatibility lint                   |
| `no-with`                           | `eslint/no-with`                          |
| `prefer-as-const`                   | `typescript/prefer-as-const`              |
| `prefer-const`                      | `eslint/prefer-const`                     |
| `prefer-namespace-keyword`          | `typescript/prefer-namespace-keyword`     |
| `require-await`                     | `eslint/require-await`                    |
| `require-yield`                     | `eslint/require-yield`                    |
| `use-isnan`                         | `eslint/use-isnan`                        |
| `valid-typeof`                      | `eslint/valid-typeof`                     |

The migration obtained the Deno rule list with `deno lint --rules --json` and
the Oxlint list with `oxlint --rules --format json`.


Tests and coverage
------------------

`mise run test` runs the default checks and Node.js tests.  Use
`mise run test:all` before submitting changes to include Deno type and lint
checks, Deno tests, and Bun tests.  Runtime suites run sequentially because
Node.js and Bun rebuild the same output directories.

`mise run coverage` builds all packages and collects Node.js coverage with c8.
HTML, LCOV, and JSON reports go to *coverage/node/*, and per-package JUnit
reports go to *coverage/junit/*.  The report checker rejects empty coverage.
`mise run test:node:report` produces JUnit reports without coverage.

The reporting runner reads Node flags from each package's existing test script
and invokes Node directly after the workspace build.  Wrapping the standalone
pnpm executable with c8 produced empty coverage in the migration probe: pnpm
cleared `NODE_V8_COVERAGE` before starting its children.

Source maps attribute built Node.js code to source files.  Node coverage omits
Deno-only and Bun-only branches, the JSR-only test package, and source files
not reached by the built Node test suites.  It is not a replacement for Deno
coverage and its percentages should be compared separately.  Use
`mise run coverage:deno` for the Deno report at *.cov/deno/html/index.html*.


Optional Deno tasks and editors
-------------------------------

`mise install`, dependency installation, formatting, checks, builds, default
tests, coverage, and Git hooks use Node.js tooling.  Deno is a task-local tool
for `check:deno`, `test:deno`, `coverage:deno`, Elysia compatibility, the
disabled-call benchmark, `check:jsr`, and JSR publishing.  The `test:all` task
calls the compatibility tasks.  Mise installs Deno when one of those tasks
requests it. CI keeps separate Deno checks and all three runtime suites on
Linux, macOS, and Windows.  Node.js and Deno coverage uploads use separate
flags and test-result names.

VS Code uses the workspace TypeScript and Oxc extensions for the default
workflow.  The optional Deno extension is scoped to *packages/testing-deno/*.
Zed uses its TypeScript support with the Oxc extension for linting and
formatting.  Both editors use the repository's Oxfmt settings and leave import
order unchanged.  Run `mise run check` for the authoritative package-aware
source check; the shared editor configuration does not reproduce its separate
compiler programs.

The formatter migration can be hidden from blame with
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.
