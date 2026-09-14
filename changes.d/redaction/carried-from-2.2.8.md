---
links:
  '#217': https://github.com/dahlia/logtape/issues/217
---
 -  Fixed `US_SSN_PATTERN` and `KR_RRN_PATTERN` incorrectly redacting parts of
    longer digit sequences.  Numbers immediately preceded or followed by another
    digit are now left unchanged.  [[#217]]
