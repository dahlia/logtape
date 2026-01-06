Comparison with other logging libraries
=======================================

When choosing a logging library for your JavaScript or TypeScript project,
you might wonder how LogTape compares to established alternatives like winston,
Pino, or bunyan.  This guide provides a comprehensive comparison to help you
make an informed decision.


The library-first advantage
---------------------------

LogTape's most distinctive feature is its [library-first
design](./manual/library.md).  Unlike other logging libraries that are primarily
designed for applications, LogTape is specifically built to be used in libraries
without imposing any burden on library users.

### The problem with traditional loggers

Consider this scenario: you're using a third-party library that uses winston
for logging.  Even if you're not using winston in your application, you now
have winston configured because the library does it without your consent:

~~~~ typescript
// In some-library/index.js
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

export function processData(data) {
  logger.info("Processing data", { size: data.length });
  // ... process data
}
~~~~

### LogTape's solution

With LogTape, libraries can log without any configuration:

~~~~ typescript
// In some-library/index.js
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["some-library"]);

export function processData(data) {
  logger.info("Processing data with {size} items.", { size: data.length });
  // ... process data
}
~~~~

**Before configuration:** If the application doesn't configure LogTape,
`logger.info()` does nothing.  No output, no errors, no side effects.

**After configuration:** The application has full control:

~~~~ typescript
// In your application
import { configure, getConsoleSink } from "@logtape/logtape";
import { processData } from "some-library";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    { category: ["some-library"], lowestLevel: "debug", sinks: ["console"] },
  ],
});

processData([1, 2, 3]); // Now you'll see the library's logs
~~~~

This design means:

 -  *Zero impact* if logging isn't configured
 -  *Full control* for the application
 -  *No configuration conflicts*


Bundle size comparison
----------------------

Bundle size matters, especially for frontend applications and libraries.
Here's how LogTape compares to other popular logging libraries:[^1]

| Library     | Version    | Minified + gzipped | Dependencies | Tree-shakable |
|-------------|------------|-------------------:|-------------:|:-------------:|
| **LogTape** | **0.12.1** | **5.3 KB**         |        **0** |      ✅       |
| Pino        | 9.7.0      | 3.1 KB             |            1 |      ❌       |
| bunyan      | 1.8.15     | 5.7 KB             |            0 |      ❌       |
| log4js      | 6.9.1      | 12.9 KB            |            5 |      ❌       |
| Signale     | 1.4.0      | 16.4 KB            |           23 |      ❌       |
| winston     | 3.17.0     | 38.3 KB            |           17 |      ❌       |

[^1]: Sizes measured using [Bundlephobia].

[Bundlephobia]: https://bundlephobia.com/

### Why zero dependencies matter

LogTape's zero dependencies provide several advantages:

 -  *Security*: No supply chain vulnerabilities from dependencies
 -  *Maintenance*: No dependency updates or compatibility issues
 -  *Bundle size*: What you see is what you get
 -  *Installation speed*: Faster `npm install` times
 -  *Reliability*: No risk of dependencies breaking your build

Consider winston's dependency tree:

~~~~ text
winston@3.17.0
├── @colors/colors@1.6.0
├── @dabh/diagnostics@2.0.3
├── async@3.2.6
├── is-stream@2.0.1
├── logform@2.7.0
│   ├── @colors/colors@1.6.0
│   ├── fecha@4.2.3
│   ├── ms@2.1.3
│   ├── safe-stable-stringify@2.5.0
│   └── triple-beam@1.4.1
├── one-time@1.0.0
├── readable-stream@3.6.2
├── safe-stable-stringify@2.5.0
├── stack-trace@0.0.10
├── triple-beam@1.4.1
└── winston-transport@4.9.0
~~~~

That's 17 dependencies that could potentially break, have security issues,
or conflict with your application's dependencies.


Runtime support comparison
--------------------------

Modern JavaScript applications run in diverse environments.  LogTape is
designed to work seamlessly across all major JavaScript runtimes, while
other libraries have varying degrees of compatibility:[^2]

| Runtime            | LogTape | winston | Pino | bunyan | log4js | Signale |
| ------------------ | :-----: | :-----: | :--: | :----: | :----: | :-----: |
| **Node.js**        |   ✅    |   ✅    |  ✅  |   ✅   |   ✅   |   ✅    |
| **Deno**           |   ✅    |   ⚠️    |  ⚠️  |   ⚠️   |   ⚠️   |   ⚠️    |
| **Bun**            |   ✅    |   ⚠️    |  ⚠️  |   ⚠️   |   ⚠️   |   ⚠️    |
| **Web browsers**   |   ✅    |   ⚠️    |  ⚠️  |   ❌   |   ❌   |   ❌    |
| **Edge functions** |   ✅    |   ❌    |  ❌  |   ❌   |   ❌   |   ❌    |

While some Node.js libraries can work in Deno through the `npm:` specifier
and Node.js compatibility layer, they often have limitations:

 -  *Deno/Bun compatibility*: Many Node.js libraries rely on Node.js built-ins
    (`node:fs`, `node:path`, `node:util`) which may work through compatibility
    layers but aren't guaranteed to work correctly in all scenarios
 -  *Web browser compatibility*: Libraries like winston require complex
    polyfills and lose most functionality in web browsers
 -  *Edge function limitations*: Serverless environments often restrict
    file system access and other Node.js APIs that these libraries depend on

LogTape, being designed from the ground up for multi-runtime compatibility,
works identically across all these environments without requiring any
polyfills or compatibility layers.

[^2]: Legend: ✅ — official support, ⚠️ — unofficial/limited support,
      ❌ — not supported.

### Example: Universal library

With LogTape, you can write a library that works everywhere:

~~~~ typescript twoslash
// Works in Node.js, Deno, Bun, browsers, and edge functions
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["my-universal-lib"]);

export function apiCall(url: string) {
  logger.debug("Making API call to {url}", { url });

  // Use appropriate fetch implementation for the runtime
  return fetch(url).then(response => {
    logger.info("API call completed with status {status}", {
      status: response.status
    });
    return response;
  });
}
~~~~


Performance comparison
----------------------

Performance matters, especially for high-throughput applications.  Based on
comprehensive benchmarks across different runtimes:

### Console logging (nanoseconds per iteration)

| Library     | Node.js | Deno    | Bun     | Average |
|-------------|--------:|--------:|--------:|--------:|
| **LogTape** | **214** | **236** | **225** | **225** |
| Pino        | 326     | 302     | 874     | 501     |
| winston     | 2,050   | 3,370   | 1,770   | 2,397   |
| bunyan      | 2,390   | 3,260   | 2,020   | 2,557   |
| log4js      | 3,600   | 4,430   | 3,540   | 3,857   |
| Signale     | 4,110   | 3,020   | 2,110   | 3,080   |

LogTape consistently delivers the best console logging performance across
all runtimes, often by a significant margin.

### Null benchmark (no output)

This measures the overhead when logs are disabled:

| Library     | Node.js | Deno    | Bun     |
|-------------|--------:|--------:|--------:|
| Hive Logger | 158     | 2,390   | 157     |
| **LogTape** | **163** | **178** | **187** |
| log4js      | 279     | 274     | 261     |
| Pino        | 570     | 1,060   | 715     |
| winston     | 701     | 757     | 569     |

When logging is disabled, LogTape has minimal overhead, making it ideal for
performance-critical applications.


Feature comparison
------------------

### Core logging features

| Feature                     | LogTape  | winston  |  Pino   | bunyan  |  log4js | Signale |
|-----------------------------|:--------:|:--------:|:-------:|:-------:|:-------:|:-------:|
| **Log levels**              |    6     |    6     |    6    |    6    |    6    |  Custom |
| **Child loggers**           |    ✅    |    ✅    |    ✅   |    ✅   |    ✅   |    ❌   |
| **Structured logging**      |    ✅    |    ✅    |    ✅   |    ✅   |    ✅   |    ❌   |
| **Multiple sinks**          |    ✅    |    ✅    |    ✅   |    ✅   |    ✅   |    ❌   |
| **Filtering**               |    ✅    |    ✅    |    ✅   |    ✅   |    ✅   |    ❌   |
| **Custom sinks/transports** |    ✅    |    ✅    |    ✅   |    ✅   |    ✅   |    ❌   |
| **Custom filters**          |    ✅    |    ✅    |  ⚠️[^3] | ⚠️[^4]  |    ✅   |    ❌   |
| **Custom formatters**       |    ✅    |    ✅    |    ✅   | ⚠️[^5]  |    ✅   |    ✅   |
| **Explicit context**        |    ✅    |    ⚠️    |    ✅   |    ✅   |    ❌   |    ❌   |
| **Implicit context**        |    ✅    |    ⚠️    |    ⚠️   |    ⚠️   |    ❌   |    ❌   |
| **Middleware support**      |  ✅[^18] |  ✅[^6]  | ✅[^7]  |    ❌   |    ❌   |    ❌   |
| **Pretty console output**   |  ✅[^8]  |  ✅[^9]  | ✅[^10] | ✅[^11] | ✅[^12] | ✅[^13] |
| **JSON Lines formatter**    |  ✅[^14] |  ⚠️[^15] |    ❌   |    ❌   |    ❌   |    ❌   |
| **Data redaction**          |  ✅[^16] |    ❌    | ✅[^17] |    ❌   |    ❌   |    ❌   |

[^3]: Basic filtering through transform streams.
[^4]: Limited filtering capabilities through custom streams.
[^5]: Limited to serializers, not full formatting control.
[^6]: *express-winston* for Express.js integration.
[^7]: *pino-http* for HTTP request/response logging. And *fastify* has its own built-in integration for Pino.
[^8]: `ansiColorFormatter` built-in + *@logtape/pretty* package.
[^9]: Color formatting with `winston.format.colorize()`.
[^10]: *pino-pretty* package for development.
[^11]: CLI tool with `bunyan -o short` command.
[^12]: Built-in colored console output.
[^13]: Beautiful colored output by design.
[^14]: Built-in `jsonLinesFormatter` for JSON Lines output.
[^15]: Requires custom formatting setup.
[^16]: *@logtape/redaction* package (pattern + field-based).
[^17]: Built-in `redact` option for field redaction.
[^18]: *@logtape/fastify* for Fastify integration.

### LogTape-specific features

These features are unique to LogTape or significantly better implemented:

#### Template literal support

LogTape uniquely supports JavaScript template literal syntax for logging,
providing a more natural and readable approach compared to printf-style
formatting or object-based approaches used by other libraries:

~~~~ typescript
// Only LogTape supports this intuitive syntax
logger.info`User ${userId} logged in at ${timestamp}`;
~~~~

~~~~ typescript
// Other libraries require:
logger.info("User %s logged in at %s", userId, timestamp); // winston
logger.info({ userId, timestamp }, "User logged in");      // Pino
~~~~

#### Hierarchical categories with inheritance

LogTape's [category system](./manual/categories.md) supports automatic
inheritance where child categories inherit sinks from their parents, enabling
flexible configuration with minimal duplication:

~~~~ typescript
await configure({
  loggers: [
    { category: ["myapp"], lowestLevel: "info", sinks: ["console"] },
    { category: ["myapp", "auth"], lowestLevel: "debug", sinks: ["file"] },
    // ["myapp", "auth"] inherits console sink AND adds file sink
    // ["myapp", "auth", "oauth"] would inherit both sinks
  ],
});
~~~~

#### Library support (unique to LogTape)

LogTape is the only logging library [designed specifically for
libraries](./manual/library.md), allowing library authors to add logging without
forcing dependencies or configuration requirements on their users:

~~~~ typescript
// Library code — no configuration needed
export function libraryFunction() {
  const logger = getLogger(["my-lib", "feature"]);
  logger.debug("Feature called");  // Safe even without configuration
}
~~~~

~~~~ typescript
// Application controls all logging
await configure({
  loggers: [
    { category: ["my-lib"], lowestLevel: "info", sinks: ["console"] }
  ]
});
~~~~

#### Advanced context support

LogTape provides comprehensive [context management](./manual/contexts.md) with
both explicit contexts (binding data to logger instances) and implicit contexts
(automatic propagation through the call stack using async local storage):

~~~~ typescript
// Explicit context — bind data to specific logger instances
const logger = getLogger("app").with({ requestId: "abc123" });
logger.info("Processing request"); // Includes requestId automatically
~~~~

~~~~ typescript
// Implicit context — automatic propagation through call stack
withContext({ userId: 42 }, () => {
  someFunction(); // All logs in this call stack include userId
});
~~~~


Use case recommendations
------------------------

### Choose LogTape when…

 -  *Building libraries* — LogTape is the only logging library designed
    for this use case
 -  *Multi-runtime support needed* — Works identically across Node.js,
    Deno, Bun, browsers, and edge functions
 -  *Zero dependencies required* — Security, maintenance, or bundle size
    constraints
 -  *TypeScript-first development* — Native TypeScript support without
    *@types/* packages
 -  *Modern JavaScript patterns* — Template literals, `async`/`await`,
    structured logging
 -  *Performance matters* — Especially for console logging

### Choose winston when…

 -  *Complex enterprise logging* — Mature ecosystem with many plugins
 -  *Legacy Node.js applications* — Well-established patterns and
    extensive documentation
 -  *File logging performance* — Optimized for high-volume file writing

### Choose Pino when…

 -  *Smallest possible bundle* — 3.1KB if bundle size is critical
 -  *JSON-first logging* — Structured logging is the primary requirement
 -  *Node.js-only applications* — No multi-runtime requirements

### Choose bunyan when…

 -  *Simple JSON logging* — Straightforward structured logging needs
 -  *Legacy compatibility* — Existing bunyan infrastructure

### Choose log4js when…

 -  *Java developers* — Familiar log4j-style configuration
 -  *Complex appender needs* — Sophisticated logging routing requirements

### Choose Signale when…

 -  *CLI applications* — Beautiful terminal output with minimal setup
 -  *Development tools* — Pretty console output for developer tools


Why LogTape matters
-------------------

LogTape represents a new generation of logging libraries designed for modern
JavaScript development:

 1. *Library-first design*: The only logger built specifically for library
    authors, enabling a healthier ecosystem where libraries don't impose
    logging dependencies on applications.

 2. *Universal runtime support*: Write once, run everywhere—from Node.js
    servers to Deno scripts to browser applications to edge functions.

 3. *Zero dependencies*: Eliminate supply chain risks, reduce bundle size,
    and simplify maintenance.

 4. *Performance leadership*: Consistently outperforms other libraries,
    especially for console logging across all runtimes.

 5. *Developer experience*: TypeScript-first design with intuitive APIs
    like template literals and hierarchical categories.

 6. *Modern architecture*: Built from the ground up for `async`/`await`,
    ESM, and modern JavaScript patterns.

For new projects, especially libraries or applications targeting multiple
runtimes, LogTape is the recommended choice.  For existing applications with
complex winston configurations, evaluate whether LogTape's benefits justify
the migration effort.

The library-first design philosophy makes LogTape particularly valuable for
the JavaScript ecosystem, as it enables library authors to provide logging
capabilities without imposing dependencies or configuration requirements on
their users.  This creates a better experience for everyone in the ecosystem.

<!-- cSpell: ignore Bundlephobia Signale myapp -->
