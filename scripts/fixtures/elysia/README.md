Elysia compatibility fixtures
=============================

Run `mise run test:elysia-compatibility` after `pnpm install`.
The runner builds the core and adapter once, packs them with pnpm, and installs
those tarballs into temporary consumers for each pinned Elysia version.  It
checks Node.js and Bun with both ESM and CommonJS exports, and Deno with the
npm specifiers used by JSR source publication.

The *.ts.txt* files are TypeScript templates checked inside those consumers.
They are outside the workspace dependency graph so that the default Elysia 1
development dependency cannot hide Elysia 2 typing failures.  The existing
adapter test suite supplies the shared assertions.  For Elysia 2, the runner
ports native hook names and route argument order, and skips only the test
which deliberately replaces Elysia 1's private router lookup.

*check-types.cjs* checks declarations without `skipLibCheck`.  Some Elysia
versions have declaration errors even in a consumer that imports only Elysia.
The checker compares against that native consumer and permits only identical
diagnostics in external dependencies.  Any adapter or fixture diagnostic, or
new dependency diagnostic, fails the check.  It prints the unchanged upstream
diagnostic count so that a baseline with errors is visible.

When changing the pinned beta, update the peer range and Deno documentation
examples together.  Keep the main Elysia and `elysia/utils` resolution on the
same package copy and module format: local hook deduplication depends on their
shared function-origin map.  The native identity probe and packed-artifact
checks detect accidental bundling of that map.
