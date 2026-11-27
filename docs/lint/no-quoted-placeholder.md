`no-quoted-placeholder`
=======================

Some LogTape formatters already quote string values. With the default text
formatter, adding quotes around a placeholder can make a string appear with two
pairs of quotes. This opt-in rule flags a placeholder immediately surrounded by
matching single or double quotes in a LogTape tagged template or static message
template.

~~~~ typescript
// Reported
logger.info`User '${name}'`;
logger.info('User "{name}"', { name });

// Not reported
logger.info`User ${name}`;
logger.info("User {name}", { name });
logger.info('User "{{name}}"');
logger.info('User "{first} {last}"', { first, last });
~~~~

The rule skips escaped braces (`{{name}}`) and quotes that surround more than a
single placeholder. It reports each message at most once and uses the same
logger detection as the other LogTape lint rules, so it may miss loggers passed
through objects such as `ctx.logger`. It does not check ordinary JavaScript
interpolation in a log call; see [`no-message-interpolation`] for that form.

The rule cannot tell how a value will be formatted. If you use `value: "bare"`
or a custom formatter, you may want to keep the quotes. The rule does not offer
an automatic fix.

[`no-message-interpolation`]: /lint/no-message-interpolation


Enabling the rule
-----------------

In ESLint or Oxlint, add `"logtape/no-quoted-placeholder": "warn"` to your
rules. If you registered the plugin under a different alias, use that alias
instead of `logtape`.

In Deno Lint, replace `jsr:@logtape/lint/deno` with
`jsr:@logtape/lint/deno/quoted-placeholder`. If you use `/deno/strict`, replace
it with `jsr:@logtape/lint/deno/strict/quoted-placeholder`. Do not load both
the original entry point and its replacement. To turn the rule off, switch back
to the original entry point or add `logtape/no-quoted-placeholder` to
`lint.rules.exclude`.
