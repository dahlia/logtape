Contexts
========

Explicit contexts
-----------------

*Explicit contexts are available since LogTape 0.5.0.*

LogTape provides a context system to reuse the same properties across log
messages.  A context is a key-value map.  You can set a context for a logger
and log messages `~Logger.with()` the context.  Here's an example of setting
a context for a logger:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
// ---cut-before---
const logger = getLogger(["my-app", "my-module"]);
const ctx = logger.with({ userId: 1234, requestId: "abc" });
ctx.info `This log message will have the context (userId & requestId).`;
ctx.warn("Context can be used inside message template: {userId}, {requestId}.");
~~~~

The context is inherited by child loggers.  Here's an example of setting a
context for a parent logger and logging messages with a child logger:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
// ---cut-before---
const logger = getLogger(["my-app"]);
const parentCtx = logger.with({ userId: 1234, requestId: "abc" });
const childCtx = parentCtx.getChild(["my-module"]);
childCtx.debug("This log message will have the context: {userId} {requestId}.");
~~~~

Contexts are particularly useful when you want to do
[structured logging](./struct.md).


Implicit contexts
-----------------

*Implicit contexts are available since LogTape 0.7.0.*

Implicit contexts are a way to set a context for every single log message in
a subroutine and its all subroutines.  In other words, implicit contexts are
invasive to the call stack.  Or you can think of it as a set of properties
which works like environment variables in a process.

Implicit contexts are useful when you want to trace a request or a session
across multiple log messages made by different loggers in different modules.


### Settings

> [!CAUTION]
> In order to use implicit context, your JavaScript runtime must support
> context-local states (like Node.js's [`node:async_hooks`] module).  If your
> JavaScript runtime doesn't support context-local states, LogTape will silently
> ignore implicit contexts and log messages will not have implicit contexts.
>
> As of October 2024, Node.js, Deno, and Bun support implicit contexts.
> Web browsers don't support implicit contexts yet.
>
> See also [TC39 Async Context proposal] for web browsers.

To enable implicit contexts, you need to set a `~Config.contextLocalStorage`
option in the `configure()` function.  In Node.js, Deno, and Bun, you can use
[`AsyncLocalStorage`] from the [`node:async_hooks`] module as a context local
storage:

~~~~ typescript twoslash
// @noErrors: 2307
import { type ContextLocalStorage } from "@logtape/logtape";
class AsyncLocalStorage<T> implements ContextLocalStorage<T> {
  getStore(): T | undefined {
    return undefined;
  }
  run<R>(store: T, callback: () => R): R {
    return callback();
  }
}
// ---cut-before---
import { AsyncLocalStorage } from "node:async_hooks";
import { configure, getLogger } from "@logtape/logtape";

await configure({
  // ... other settings ...
  // ---cut-start---
  sinks: {},
  loggers: [],
  // ---cut-end---
  contextLocalStorage: new AsyncLocalStorage(),
});
~~~~

[`node:async_hooks`]: https://nodejs.org/api/async_context.html
[TC39 Async Context proposal]: https://tc39.es/proposal-async-context/
[`AsyncLocalStorage`]: https://nodejs.org/api/async_context.html#class-asynclocalstorage


### Basic usage

Once you set a context local storage, you can use implicit contexts in your
code.  Here's an example of using implicit contexts:

~~~~ typescript twoslash
import { getLogger, withContext } from "@logtape/logtape";

function functionA() {
  // Note that you don't need to pass the context explicitly:
  getLogger("a").info(
    "This log message will have the implicit context: {requestId}."
  );
}

function handleRequest(requestId: string) {
  // Implicit contexts can be set by `withContext()` function:
  withContext({ requestId }, () => {
    functionA();
  });
}
~~~~

In the above example, the `handleRequest()` function sets the `requestId`
context and calls `functionA()`.  The `functionA()` logs a message with the
implicit context `requestId` even though the `requestId` is not passed to the
`getLogger()` function.

> [!TIP]
> Even if some asynchronous operations are interleaved, implicit contexts
> are correctly inherited by all subroutines and asynchronous operations.
> In other words, implicit contexts are more than just a global variable.

### Nesting

Implicit contexts can be nested.  Here's an example of nesting implicit
contexts:

~~~~ typescript twoslash
import { getLogger, withContext } from "@logtape/logtape";

function functionA() {
  getLogger("a").info(
    "This log message will have the implicit context: {requestId}/{userId}."
  );
}

function functionB() {
  getLogger("b").info(
    "This log message will have the implicit context: {requestId}."
  );
}

function handleRequest(requestId: string) {
  withContext({ requestId, signed: false }, () => {
    functionB();
    handleUser(1234);
  });
}

function handleUser(userId: number) {
  // Note that the `signed` context is overridden:
  withContext({ userId, signed: true }, () => {
    functionA();
  });
}
~~~~

In the above example, `functionA()` and `functionB()` log messages with the
implicit context `requestId`.  The `handleRequest()` function sets the
`requestId` context and calls `functionB()` and `handleUser()`.

The `handleUser()` function sets the `userId` context and calls `functionA()`.
The `functionA()` logs a message with the implicit contexts `requestId` and
`userId`.

Note that the `signed` context is set in the `handleRequest()` function and
overridden in the `handleUser()` function.  In the `functionA()`, the `signed`
context is `true` and in the `functionB()`, the `signed` context is `false`.


Priorities
----------

When you set an implicit context with the same key multiple times, the last one
(or the innermost one) wins.

When you set an explicit context with the same key as an implicit context,
the explicit context wins.

When you set a property with the same key as an implicit or explicit context,
the property wins.

Here's an example of the priority:

~~~~ typescript twoslash
import { getLogger, withContext } from "@logtape/logtape";

const logger = getLogger("my-app");

withContext({ foo: 1, bar: 2, baz: 3 }, () => {
  const context = logger.with({ bar: 4, baz: 5 });
  context.info(
    "This log message will have the context: {foo}, {bar}, {baz}.",
    { baz: 6 },
  );
});
~~~~

The above example logs the following message:

~~~~
This log message will have the context: 1, 4, 6.
~~~~
