Contexts
========

*Contexts are available since LogTape 0.5.0.*

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
