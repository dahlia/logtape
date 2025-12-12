<!-- deno-fmt-ignore-file -->

@logtape/express
================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/express* is an [Express] middleware adapter that provides HTTP
request logging using [LogTape] as the backend, as an alternative to [Morgan].

[JSR]: https://jsr.io/@logtape/express
[JSR badge]: https://jsr.io/badges/@logtape/express
[npm]: https://www.npmjs.com/package/@logtape/express
[npm badge]: https://img.shields.io/npm/v/@logtape/express?logo=npm
[LogTape]: https://logtape.org/
[Express]: https://expressjs.com/
[Morgan]: https://github.com/expressjs/morgan


Installation
------------

~~~~ sh
deno add jsr:@logtape/express  # for Deno
npm  add     @logtape/express  # for npm
pnpm add     @logtape/express  # for pnpm
yarn add     @logtape/express  # for Yarn
bun  add     @logtape/express  # for Bun
~~~~


Usage
-----

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";
import { expressLogger } from "@logtape/express";
import express from "express";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["express"], sinks: ["console"], lowestLevel: "info" }
  ],
});

const app = express();
app.use(expressLogger());

app.get("/", (req, res) => {
  res.json({ hello: "world" });
});

app.listen(3000);
~~~~


Options
-------

~~~~ typescript
app.use(expressLogger({
  category: ["myapp", "http"],  // Custom category (default: ["express"])
  level: "debug",                // Log level (default: "info")
  format: "dev",                 // Predefined format (default: "combined")
  skip: (req, res) => res.statusCode < 400,  // Skip successful requests
  immediate: false,              // Log after response (default)
}));
~~~~


Predefined Formats
------------------

- **combined**: Apache Combined Log Format with all properties (default)
- **common**: Apache Common Log Format (without referrer/userAgent)
- **dev**: Concise output for development (`GET /path 200 1.234 ms - 123`)
- **short**: Shorter format with remote address
- **tiny**: Minimal output


Custom Format Function
----------------------

~~~~ typescript
app.use(expressLogger({
  format: (req, res, responseTime) => ({
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration: responseTime,
    user: req.user?.id,
  }),
}));
~~~~


Docs
----

The docs of this package is available at
<https://logtape.org/manual/integrations#express>.
For the API references, see <https://jsr.io/@logtape/express/doc>.
