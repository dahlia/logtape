Installation
============

LogTape is available on [JSR] and [npm].  You can install LogTape for various
JavaScript runtimes and package managers:

:::code-group

~~~~ sh [Deno]
deno add @logtape/logtape
~~~~

~~~~ sh [npm]
npm add @logtape/logtape
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/logtape
~~~~

~~~~ sh [Yarn]
yarn add @logtape/logtape
~~~~

~~~~ sh [Bun]
bun add @logtape/logtape
~~~~

:::

> [!NOTE]
> Although JSR supports Node.js and Bun, we recommend to install LogTape from
> JSR only for Deno.  For Node.js and Bun, we recommend to install LogTape from
> npm.

In case you want to install an unstable version of LogTape:

:::code-group

~~~~ sh [npm]
npm add @logtape/logtape@dev
~~~~

~~~~ sh [pnpm]
pnpm add @logtape/logtape@dev
~~~~

~~~~ sh [Yarn]
yarn add @logtape/logtape@dev
~~~~

~~~~ sh [Bun]
bun add @logtape/logtape@dev
~~~~

:::

> [!NOTE]
> Although JSR supports unstable releases, there is currently no way to install
> the *latest* unstable version of a package using `deno add`; instead, you need
> to specify the specific version number of the unstable release:
>
> ~~~~ sh
> deno add @logtape/logtape@1.2.3-dev.4  # Replace 1.2.3-dev.4 with the actual version number
> ~~~~

[JSR]: https://jsr.io/@logtape/logtape
[npm]: https://www.npmjs.com/package/@logtape/logtape