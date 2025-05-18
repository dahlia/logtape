Data redaction
==============

*The *@logtape/redaction* package is available since LogTape 0.10.0.*

Sensitive data in logs can pose security and privacy risks. LogTape provides
robust redaction capabilities through the *@logtape/redaction* package to help
protect sensitive information from being exposed in your logs.

LogTape has two distinct approaches to redact sensitive data:

 -  [Pattern-based redaction](#pattern-based-redaction): Uses regular
    expressions to identify and redact sensitive data in formatted log output
 -  [Field-based redaction](#field-based-redaction): Identifies and redacts
    sensitive fields by their names in structured log data

[Both approaches have their strengths and use cases.](#comparing-redaction-approaches)
This guide will help you understand when and how to use each.


Installation
------------

LogTape provides data redaction capabilities through a separate package
*@logtape/redaction*:

::: code-group

~~~~ bash [Deno]
deno add jsr:@logtape/redaction
~~~~

~~~~ bash [npm]
npm add @logtape/redaction
~~~~

~~~~ bash [pnpm]
pnpm add @logtape/redaction
~~~~

~~~~ bash [Yarn]
yarn add @logtape/redaction
~~~~

~~~~ bash [Bun]
bun add @logtape/redaction
~~~~

:::


Pattern-based redaction
-----------------------

Pattern-based redaction uses regular expressions to identify and redact
sensitive data patterns like credit card numbers, email addresses,
and tokens in the formatted output of logs.

### How it works

The `redactByPattern()` function wraps a formatter (either a `TextFormatter` or
`ConsoleFormatter`) and scans its output for matching patterns:

~~~~ typescript {8-11} twoslash
import { defaultConsoleFormatter, getConsoleSink } from "@logtape/logtape";
import {
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  redactByPattern,
} from "@logtape/redaction";

const formatter = redactByPattern(defaultConsoleFormatter, [
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
]);

const sink = getConsoleSink({ formatter });
~~~~

When a log is formatted, any text matching the provided patterns is replaced
with a redacted value.

### Built-in patterns

The `@logtape/redaction` package includes several built-in patterns:

~~~~ typescript twoslash
import {
  CREDIT_CARD_NUMBER_PATTERN,
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  KR_RRN_PATTERN,
  US_SSN_PATTERN,
} from "@logtape/redaction";
~~~~

 -  `EMAIL_ADDRESS_PATTERN`: Redacts email addresses
 -  `CREDIT_CARD_NUMBER_PATTERN`: Redacts credit card numbers
 -  `JWT_PATTERN`: Redacts JSON Web Tokens
 -  `US_SSN_PATTERN`: Redacts U.S. Social Security numbers
 -  `KR_RRN_PATTERN`: Redacts South Korean resident registration numbers

### Creating custom patterns

You can create custom patterns to match your specific needs:

~~~~ typescript {4-7} twoslash
import { type RedactionPattern, redactByPattern } from "@logtape/redaction";
import { defaultConsoleFormatter, getConsoleSink } from "@logtape/logtape";

const API_KEY_PATTERN: RedactionPattern = {
  pattern: /xz([a-zA-Z0-9_-]{32})/g,
  replacement: "REDACTED_API_KEY",
};

const formatter = redactByPattern(defaultConsoleFormatter, [
  API_KEY_PATTERN,
]);

const sink = getConsoleSink({ formatter });
~~~~

> [!IMPORTANT]
> Regular expressions must have the global (`g`) flag set, otherwise a
> `TypeError` will be thrown.


Field-based redaction
---------------------

Field-based redaction identifies and redacts sensitive data by field names in
structured log data. It works by examining the property names in the log record
and redacting those that match specified patterns.

### How it works

The `redactByField()` function wraps a sink and redacts properties in the log
record before passing it to the sink:

~~~~ typescript twoslash
import { getConsoleSink } from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";

const sink = redactByField(getConsoleSink());  // [!code highlight]
~~~~

By default, it uses `DEFAULT_REDACT_FIELDS`, which includes common sensitive
field patterns like `password`, `secret`, `token`, etc.

### Customizing field patterns

You can provide your own field patterns:

~~~~ typescript {4-9} twoslash
import { getConsoleSink } from "@logtape/logtape";
import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";

const customSink = redactByField(getConsoleSink(), [
  /pass(?:code|phrase|word)/i,
  /api[-_]?key/i,
  "secret",
  ...DEFAULT_REDACT_FIELDS
]);
~~~~

Field patterns can be strings (exact matches) or regular expressions.

### Customizing redaction behavior

By default, field-based redaction removes matching fields. You can customize
this behavior to replace them instead:

~~~~ typescript {6} twoslash
import { getConsoleSink } from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";

const customSink = redactByField(getConsoleSink(), {
  fieldPatterns: [/password/i, /secret/i],
  action: () => "[REDACTED]" // Replace with "[REDACTED]" instead of removing
});
~~~~

Field redaction is recursive and will redact sensitive fields in nested objects
as well.


Comparing redaction approaches
------------------------------

Each redaction approach has its strengths and weaknesses depending on your
specific use case.

### Pattern-based redaction

Pros:

 -  More accurate at detecting structured patterns (credit cards, SSNs, etc.)
 -  Works with any formatter regardless of data structure
 -  Can redact data within message strings
 -  Catches sensitive data even if it appears in unexpected places

Cons:

 -  Performance impact can be higher, especially with many patterns
 -  Regex matching is applied to all output text
 -  May produce false positives (redacting text that resembles sensitive data)
 -  Operates after formatting, so sensitive data might exist in memory
    temporarily

### Field-based redaction

Pros:

 -  More efficient as it only checks field names, not values
 -  Redacts data before it reaches the sink or formatter
 -  Less likely to cause false positives
 -  Works with any sink, regardless of formatter

Cons:

 -  Cannot detect sensitive data in free-form text or message templates
 -  Only works for structured data fields
 -  Requires knowledge of field names that contain sensitive data
 -  May miss sensitive data with unexpected field names


Usage examples
-------------

### Basic pattern-based redaction

~~~~ typescript {12-18} twoslash
import {
  configure,
  defaultConsoleFormatter,
  getConsoleSink,
} from "@logtape/logtape";
import {
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  redactByPattern,
} from "@logtape/redaction";

const consoleSink = getConsoleSink({
  formatter: redactByPattern(
    // Wrap the default formatter with pattern-based redaction
    defaultConsoleFormatter,
    [EMAIL_ADDRESS_PATTERN, JWT_PATTERN]
  ),
});

await configure({
  sinks: {
    console: consoleSink,
  },
  loggers: [
    { category: "my-app", sinks: ["console"] },
  ],
});

// Later in your code:
import { getLogger } from "@logtape/logtape";

const logger = getLogger("my-app");
logger.info(
  "User email: user@example.com, token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
);
// Output will show: "User email: REDACTED@EMAIL.ADDRESS, token: [JWT REDACTED]"
~~~~

### Basic field-based redaction

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";

await configure({
  sinks: {
    console: redactByField(getConsoleSink()),  // [!code highlight]
  },
  loggers: [
    { category: "my-app", sinks: ["console"] },
  ],
});

// Later in your code:
import { getLogger } from "@logtape/logtape";

const logger = getLogger("my-app");
logger.info("User authenticated", {
  username: "johndoe",
  password: "supersecret", // This field will be removed from the logged output
  email: "johndoe@example.com", // This field will be removed too
});
~~~~

### Combining both approaches

For maximum security, you can combine both approaches:

~~~~ typescript {13-22} twoslash
import {
  configure,
  defaultConsoleFormatter,
  getConsoleSink,
} from "@logtape/logtape";
import {
  EMAIL_ADDRESS_PATTERN,
  JWT_PATTERN,
  redactByField,
  redactByPattern,
} from "@logtape/redaction";

// First apply field-based redaction to the sink
const sink = redactByField(
  getConsoleSink({
    // Then apply pattern-based redaction to the formatter
    formatter: redactByPattern(
      defaultConsoleFormatter,
      [EMAIL_ADDRESS_PATTERN, JWT_PATTERN]
    )
  })
);

await configure({
  sinks: {
    console: sink,
  },
  loggers: [
    { category: "my-app", sinks: ["console"] },
  ],
});
~~~~

### File sink with redaction

~~~~ typescript {9-14} twoslash
import { getFileSink } from "@logtape/file";
import { configure, getTextFormatter } from "@logtape/logtape";
import {
  CREDIT_CARD_NUMBER_PATTERN,
  EMAIL_ADDRESS_PATTERN,
  redactByPattern,
} from "@logtape/redaction";

const fileSink = getFileSink("app.log", {
  formatter: redactByPattern(
    getTextFormatter(),
    [CREDIT_CARD_NUMBER_PATTERN, EMAIL_ADDRESS_PATTERN]
  ),
});

await configure({
  sinks: {
    file: fileSink,
  },
  loggers: [
    { category: "my-app", sinks: ["file"] },
  ],
});
~~~~


Best practices
--------------

 1. *Choose the right approach*:

     -  Use pattern-based redaction when you need to catch sensitive data in
        message strings and have well-defined patterns
     -  Use field-based redaction for structured data with known field names
     -  Combine both approaches for maximum security

 2. *Be comprehensive*:

     -  Define patterns for all types of sensitive data your application handles
     -  Regularly review and update your redaction patterns as new types of
        sensitive data are introduced

 3. *Test your redaction*:

     - Verify that sensitive data is properly redacted by examining your logs
     - Include edge cases in your testing (partial matches, data spanning
       multiple lines, etc.)

 4. *Balance performance and security*:

     - For high-volume logs, consider using field-based redaction which is
       generally more efficient
     - For security-critical applications, use both approaches even if it means
       some performance overhead

 5. *Document your approach*:

     - Make sure your team understands which data is being redacted and how
     - Include redaction strategies in your security documentation

> [!WARNING]
> No redaction system is perfect. Even with redaction in place, be cautious about
> what information you log. It's better to avoid logging sensitive data in the
> first place when possible.

<!-- cSpell: ignore johndoe -->
