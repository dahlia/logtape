---
links:
  '#218': https://github.com/dahlia/logtape/issues/218
  '#221': https://github.com/dahlia/logtape/pull/221
---
 -  Fixed the pretty formatter throwing
    `TypeError: Converting circular structure to JSON` when rendering a value
    which contains a circular reference on runtimes which provide neither
    `Deno.inspect()` nor Node.js' `util.inspect()`, such as browsers, React
    Native, and edge functions. Such a reference is now rendered as the string
    `"[Circular]"`.
    [[#218], [#221]]
