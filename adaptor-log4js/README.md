<!-- deno-fmt-ignore-file -->

@logtape/adaptor-log4js
=======================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

*@logtape/adaptor-log4js* is a [LogTape] adapter that forwards log records to
[log4js] loggers, enabling seamless integration between LogTape-enabled libraries
and applications using log4js for logging infrastructure.

[JSR]: https://jsr.io/@logtape/adaptor-log4js
[JSR badge]: https://jsr.io/badges/@logtape/adaptor-log4js
[npm]: https://www.npmjs.com/package/@logtape/adaptor-log4js
[npm badge]: https://img.shields.io/npm/v/@logtape/adaptor-log4js?logo=npm
[LogTape]: https://logtape.org/
[log4js]: https://log4js-node.github.io/log4js-node/


Installation
------------

~~~~ sh
deno add jsr:@logtape/adaptor-log4js  # for Deno
npm  add     @logtape/adaptor-log4js  # for npm
pnpm add     @logtape/adaptor-log4js  # for pnpm
yarn add     @logtape/adaptor-log4js  # for Yarn
bun  add     @logtape/adaptor-log4js  # for Bun
~~~~


Usage
-----

### Using the default log4js logger

~~~~ typescript
import { getLog4jsSink } from "@logtape/adaptor-log4js";

const sink = getLog4jsSink(); // Uses default log4js logger
~~~~

### Using a custom log4js logger

~~~~ typescript
import log4js from "log4js";
import { getLog4jsSink } from "@logtape/adaptor-log4js";

const logger = log4js.getLogger("my-app");
const sink = getLog4jsSink(logger);
~~~~

### Integration with LogTape

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getLog4jsSink } from "@logtape/adaptor-log4js";

await configure({
  sinks: {
    log4js: getLog4jsSink(),
  },
  loggers: [
    { category: "my-library", sinks: ["log4js"] }
  ]
});
~~~~


Docs
----

See the [API reference] on JSR for further details.

[API reference]: https://jsr.io/@logtape/adaptor-log4js/doc 
