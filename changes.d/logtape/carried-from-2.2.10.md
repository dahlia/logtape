 -  Added `sanitize` option to the `TextFormatterOptions` interface.
    Pass an object to adjust the policy, or `false` to restore the previous
    behavior.  \[[GHSA-hp6w-c2ch-g44w]]

 -  Added `SanitizationOptions` interface.  \[[GHSA-hp6w-c2ch-g44w]]

 -  Added `sanitizeControlSequences()` function.  \[[GHSA-hp6w-c2ch-g44w]]

 -  Fixed the built-in text formatters emitting control characters and ANSI
    escape sequences from a log record's message and category verbatim.
    An attacker who influenced a string logged in the message position
    (e.g. `logger.info(untrustedString)`) could reposition the cursor or clear
    the screen on an operator's terminal, or overwrite previously printed log
    lines with forged entries.  `getTextFormatter()`,
    `getAnsiColorFormatter()`, and `defaultConsoleFormatter()` now escape
    ESC-introduced sequences other than SGR color codes, the remaining C0
    control characters, DEL, and the C1 controls (U+0080–U+009F).  Values
    interpolated into the message were already escaped by the value renderer
    and are unaffected.
    [[GHSA-hp6w-c2ch-g44w]]

     -  Newlines, carriage returns, and tabs are preserved by default so that
        multi-line messages such as stack traces stay readable.  Pass
        `sanitize: { newlines: "escape" }` to neutralize them as well, which
        also prevents an attacker-controlled newline from emitting a line that
        looks like a genuine log record to tools that split on newlines.

     -  SGR sequences are preserved by default in the message, so applications
        that log pre-colored strings or captured subprocess output keep
        working.  They are always escaped in the category, which is an
        identifier rather than display text.  A preserved sequence that is
        left open is closed with a reset, so that an attribute such as
        `` `\x1b[8m` `` (conceal) cannot hide the records that follow.  Each
        literal message part is closed on its own, so styling opened before an
        interpolated value no longer extends past it.

 -  Fixed `getJsonLinesFormatter()` emitting DEL and the C1 control characters
    (U+0080–U+009F) as raw code points.  `JSON.stringify()` escapes the C0
    controls on its own, so the line structure was never at risk, but U+009B
    and U+009D are 8-bit `CSI` and `OSC` introducers, which a terminal reading
    the output directly would interpret.  They are now written as JSON
    `\uXXXX` escapes, so the values still round-trip through `JSON.parse()`
    unchanged.  \[[GHSA-hp6w-c2ch-g44w]]

 -  Fixed `getLogfmtFormatter()` emitting DEL and the C1 control characters
    (U+0080–U+009F) as raw code points.  logfmt escapes the C0 controls on
    its own, so the line structure was never at risk, but U+009B and U+009D are
    8-bit `CSI` and `OSC` introducers, which a terminal reading the output
    directly would interpret.  They are now written as `\uXXXX` escapes in
    values and percent-encoded in property keys, the same spellings logfmt
    already uses for the characters it neutralizes.  \[[GHSA-hp6w-c2ch-g44w]]

[GHSA-hp6w-c2ch-g44w]: https://github.com/dahlia/logtape/security/advisories/GHSA-hp6w-c2ch-g44w
