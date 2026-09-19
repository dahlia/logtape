---
links:
  '#218': https://github.com/dahlia/logtape/issues/218
  '#220': https://github.com/dahlia/logtape/issues/220
  '#221': https://github.com/dahlia/logtape/pull/221
  '#222': https://github.com/dahlia/logtape/pull/222
---
 -  Fixed logging a value which contains a circular reference throwing
    `TypeError: Converting circular structure to JSON`.  Such a reference is
    now rendered as the string `"[Circular]"` wherever LogTape falls back to
    JSON serialization: in `jsonLinesFormatter` on every runtime, and in
    `defaultTextFormatter`, `ansiColorFormatter`, and `logfmtFormatter` on
    runtimes which provide neither `Deno.inspect()` nor Node.js'
    `util.inspect()`, such as browsers, React Native, and edge functions.
    A value which merely occurs more than once, as opposed to containing
    itself, is still serialized in full.
    [[#218], [#221]]
 -  Fixed `fingersCrossed()` throwing
    `TypeError: Converting circular structure to JSON` when a context value
    selected by `isolateByContext.keys` contains a circular reference.  Buffers
    are still isolated by the context values themselves, so two contexts which
    differ only in where their circular references point are not merged into
    one buffer.
    [[#220], [#222]]
