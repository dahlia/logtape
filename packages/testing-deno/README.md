LogTape Deno test integration
=============================

This package provides Deno test runner integration for LogTape failure log
reporting.  It is intended for Deno's built-in `Deno.test()` runner and is
published to JSR as *@logtape/testing-deno*.

~~~~ bash
deno add jsr:@logtape/testing-deno
~~~~

For most test suites, import the autoload entry point:

~~~~ typescript
import { test } from "@logtape/testing-deno/autoload";
import { getLogger } from "@logtape/logtape";

test("case", () => {
  getLogger(["my-lib"]).debug("Fixture state: {state}.", {
    state: "ready",
  });

  // The debug log is reported only if this test fails.
});
~~~~

The autoload entry point configures the minimal LogTape context storage needed
by the reporter when LogTape has not already been configured.  If you prefer
explicit setup, configure LogTape once from a shared Deno `--preload` module
and import `test` from `@logtape/testing-deno`.

The adapter preserves Deno test options and helpers such as `test.ignore()`,
`test.only()`, `test.each()`, `beforeAll()`, and `beforeEach()`, and wraps
`TestContext.step()` callbacks so logs from failed steps are reported too.
