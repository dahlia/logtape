---
links:
  '#258': https://github.com/dahlia/logtape/issues/258
  '#261': https://github.com/dahlia/logtape/pull/261
---
 -  Fixed `jsonLinesFormatter` and `getJsonLinesFormatter()` throwing on
    `bigint` values in structured properties and interpolated messages.
    Bigints are now serialized as decimal strings without losing precision.
    [[#258], [#261]]
