---
links:
  '#180': https://github.com/dahlia/logtape/issues/180
  '#218': https://github.com/dahlia/logtape/issues/218
  '#221': https://github.com/dahlia/logtape/pull/221
---
 -  Fixed the Sentry sink throwing
    `TypeError: Converting circular structure to JSON` when rendering an
    interpolated message value which contains a circular reference on runtimes
    which provide neither `Deno.inspect()` nor Node.js' `util.inspect()`, such
    as browsers, React Native, and edge functions.  The 2.2.1 fix for
    \[#180] covered only Deno, Node.js, and
    Bun.
    [[#218], [#221]]
