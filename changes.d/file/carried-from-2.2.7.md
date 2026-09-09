---
links:
  '#213': https://github.com/dahlia/logtape/issues/213
---
 -  Fixed an error where importing `@logtape/file` could prevent a bundled
    server from starting with `Top-level await promise never resolved`.
    This could occur when Vite or Rollup placed shared dependencies in a chunk
    waiting for the platform driver to load.  Existing imports and sink APIs
    continue to work without changes.
    [[#213]]
