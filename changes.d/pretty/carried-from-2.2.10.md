---
links:
  '#224': https://github.com/dahlia/logtape/issues/224
  '#225': https://github.com/dahlia/logtape/pull/225
---
 -  Fixed `getPrettyFormatter()` emitting control characters and ANSI escape
    sequences from a log record's message and category verbatim, with the same
    consequences and the same defaults as described above for
    *@logtape/logtape*.  The `sanitize` option is accepted here too.
    [[GHSA-hp6w-c2ch-g44w]]
 -  Fixed `getPrettyFormatter()` not applying the documented defaults for
    the `inspectOptions` option.  The `compact` option now defaults to `true`
    and the `depth` option to `Infinity` on every runtime.  Previously the
    underlying `inspect()` implementation's own defaults leaked through, so
    Node.js and Bun laid arrays of more than six elements out in columns and
    rendered anything nested more than two levels deep as `[Object]`, while
    Deno truncated at four levels.  On browsers, structured values are now
    rendered on a single line instead of being pretty-printed.
    [[#224], [#225]]

[GHSA-hp6w-c2ch-g44w]: https://github.com/dahlia/logtape/security/advisories/GHSA-hp6w-c2ch-g44w
