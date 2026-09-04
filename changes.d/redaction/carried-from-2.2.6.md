---
links:
  '#210': https://github.com/dahlia/logtape/issues/210
  '#211': https://github.com/dahlia/logtape/pull/211
---
 -  Fixed `CREDIT_CARD_NUMBER_PATTERN` to redact Luhn-valid credit card numbers
    with 13–19 digits, including unseparated numbers and common space- and
    hyphen-separated formats.  Numbers that fit these formats but fail the
    Luhn check are no longer redacted.
    [[#210], [#211]]
