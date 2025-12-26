@logtape/config
===============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package provides functionality to configure [LogTape] from plain objects,
such as those loaded from JSON or YAML files.

[JSR]: https://jsr.io/@logtape/config
[JSR badge]: https://jsr.io/badges/@logtape/config
[npm]: https://www.npmjs.com/package/@logtape/config
[npm badge]: https://img.shields.io/npm/v/@logtape/config?logo=npm
[LogTape]: https://logtape.org/


Installation
------------

The package is available on [JSR] and [npm]:

~~~~ sh
deno add jsr:@logtape/config
npm  add     @logtape/config
pnpm add     @logtape/config
yarn add     @logtape/config
bun  add     @logtape/config
~~~~


Usage
-----

You can configure LogTape using a plain object:

~~~~ typescript
import { configureFromObject } from "@logtape/config";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile("./logtape.json", "utf-8"));
await configureFromObject(config);
~~~~

For more details, see the [Configuration from objects] section in the LogTape
manual.

[Configuration from objects]: https://logtape.org/manual/config#configuration-from-objects
