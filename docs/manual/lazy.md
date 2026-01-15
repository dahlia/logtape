Lazy evaluation
===============

LogTape provides several mechanisms for lazy evaluation—deferring the
evaluation of values until they're actually needed for logging.  This feature
serves two critical purposes: *performance optimization* and *dynamic value
tracking*.


Why lazy evaluation?
--------------------

Lazy evaluation is useful in two key scenarios:

Performance optimization
:   Avoid expensive computations when logs are
    disabled.  For example, if you're logging detailed debug information that
    requires serializing large objects or performing complex calculations,
    you don't want to pay that cost when debug logging is turned off.

Dynamic values
:   Capture values at logging time rather than logger
    creation time.  This is essential when you need to log values that change
    over time, such as user session data that gets loaded after logger
    initialization.


Dynamic context with `lazy()`
-----------------------------

*The `lazy()` function is available since LogTape 2.0.0.*

The `lazy()` function allows you to defer the evaluation of context values
until logging time.  This is particularly useful for dynamic or mutable
context that changes over the lifetime of your application.

### The problem: static context

Consider this common pattern in single-page applications:

~~~~ typescript twoslash
// @noErrors: 2304 2322
interface User { }
/** A hypothetical function to load user data asynchronously. */
async function loadUser(): Promise<User> {
  return {};
}
// ---cut-before---
import { getLogger } from "@logtape/logtape";

let currentUser: User | null = null;

// Logger is created early, before user data is available
const rootLogger = getLogger("app").with({
  user: currentUser  // This captures null immediately
});

const featureLogger = rootLogger.getChild("feature");

// Later, user data is loaded
currentUser = await loadUser();

// But logs still show user: null because context was captured earlier
featureLogger.info("User action");  // user: null (not what we want!)
~~~~

The problem is that `with()` captures the *current value* of `currentUser`
at the time it's called.  Child loggers inherit that captured value, so they
never see the updated user data.

### The solution: lazy context

Use `lazy()` to defer value evaluation until logging time:

~~~~ typescript twoslash
// @noErrors: 2304 2322
interface User {
  /** The unique identifier for the user. */
  id: string;
  /** Whether the user has administrative privileges. */
  isAdmin: boolean;
}
/** A hypothetical function to load user data asynchronously. */
async function loadUser(): Promise<User> {
  return { id: "", isAdmin: true };
}
// ---cut-before---
import { getLogger, lazy } from "@logtape/logtape";

let currentUser: User | null = null;

// lazy() wraps a function that will be called at logging time
const rootLogger = getLogger("app").with({
  user: lazy(() => currentUser
    ? { id: currentUser.id, isAdmin: currentUser.isAdmin }
    : null
  )
});

const featureLogger = rootLogger.getChild("feature");

// No user yet
featureLogger.info("Initialization");  // user: null

// User data loads
currentUser = await loadUser();

// Now logs reflect the current user
featureLogger.info("User action");  // user: { id: 1, isAdmin: true }

// User data changes
currentUser.isAdmin = false;

// Logs always show the latest value
featureLogger.info("Another action");  // user: { id: 1, isAdmin: false }
~~~~

The `lazy()` wrapper defers evaluation—the callback is invoked at logging
time, not at `with()` time.  Since child loggers inherit the `lazy()` wrapper
itself (not its resolved value), they always get the latest value.

### Real-world patterns

#### Request correlation IDs

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";

let currentRequestId: string | null = null;

const logger = getLogger("api").with({
  requestId: lazy(() => currentRequestId)
});

function handleRequest(req: Request) {
  currentRequestId = crypto.randomUUID();
  // All logs in this request will include the same requestId
  logger.info("Processing request");
  // ...
  currentRequestId = null;
}
~~~~

#### Environment-dependent values

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";

const logger = getLogger("app").with({
  // Always log the current environment, even if it changes at runtime
  environment: lazy(() => process.env.NODE_ENV),
  // Log the current memory usage
  memoryUsage: lazy(() => process.memoryUsage().heapUsed)
});
~~~~


Performance optimization with `lazy()`
--------------------------------------

Beyond dynamic values, `lazy()` is also useful for avoiding expensive
computations when logs are disabled:

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const largeObject: unknown = {};
// ---cut---
logger.debug("Query result", {
  // This serialization only happens if debug logging is enabled
  data: lazy(() => JSON.stringify(largeObject))
});
~~~~

Without `lazy()`, `JSON.stringify()` would run even when debug logging is
disabled, wasting CPU cycles.  With `lazy()`, the serialization only happens
if the log message is actually going to be recorded.

### When to use lazy() for performance

Consider using `lazy()` when:

 -  Serializing large objects or arrays
 -  Performing expensive string formatting
 -  Computing derived values that require significant processing
 -  Accessing properties that might throw exceptions

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const items: unknown[] = [];
const obj: { expensiveOperation(): string } = { expensiveOperation: () => "" };
// ---cut---
logger.debug("Processing batch", {
  itemCount: items.length,
  // Only format items if debug logging is enabled
  itemDetails: lazy(() => items.map(item => formatItem(item))),
  // Only call expensive method if needed
  metadata: lazy(() => obj.expensiveOperation())
});
~~~~


Async lazy evaluation
---------------------

*Async lazy evaluation is available since LogTape 2.0.0.*

For asynchronous operations like database queries or API calls, you can pass
async functions directly as property values in structured logging:

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const userId: number = 0;
declare function fetchUserDetails(id: number): Promise<unknown>;
// ---cut---
await logger.debug("User activity", {
  // This async function only executes if debug logging is enabled
  userDetails: async () => await fetchUserDetails(userId)
});
~~~~

Note that async lazy evaluation requires using `await` with the log method,
and it only works with property values in structured logging—you cannot use
async functions in template literals.

For more details on async lazy evaluation, see *[Structured logging]* docs.

[Structured logging]: ./struct.md#async-lazy-evaluation


Conditional logging with `~Logger.isEnabledFor()`
-------------------------------------------------

*This API is available since LogTape 2.0.0.*

When you need to conditionally execute multiple log statements or perform
setup work only when logging is enabled, use the `~Logger.isEnabledFor()`
method:

~~~~ typescript twoslash
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["my-app"]);

if (logger.isEnabledFor("debug")) {
  // All of this only runs if debug logging is enabled
  const snapshot = captureComplexState();
  const analysis = analyzeState(snapshot);
  const report = generateReport(analysis);

  logger.debug("State analysis: {report}", { report });
  logger.debug("Raw snapshot: {snapshot}", { snapshot });
}

function captureComplexState() { return {}; }
function analyzeState(s: unknown) { return {}; }
function generateReport(a: unknown) { return ""; }
~~~~

The `~Logger.isEnabledFor()` method is more efficient than `lazy()` for
multiple log statements because it avoids the overhead of function calls.
However, for single property values, `lazy()` provides a cleaner syntax.

For more details, see *[Quick start]*.

[Quick start]: ./start.md#checking-if-a-logger-is-enabled-for-a-level


Choosing the right approach
---------------------------

Use this guide to choose the appropriate lazy evaluation mechanism:

### Decision tree

1.  Is the value asynchronous (requires `await`)?
     -  *Yes*: Use async lazy evaluation (async function as property value)
     -  *No*: Continue to question 2

2.  Do you need to conditionally execute multiple log statements?
     -  *Yes*: Use `~Logger.isEnabledFor()`
     -  *No*: Continue to question 3

3.  Does the value change over time or require expensive computation?
     -  *Yes*: Use `lazy()`
     -  *No*: Use the value directly

### Comparison table

| Approach         | Use when                                           | Example                                     |
| ---------------- | -------------------------------------------------- | ------------------------------------------- |
| Direct value     | Value is cheap to compute and static               | `{ count: items.length }`                   |
| `lazy()`         | Synchronous expensive computation or dynamic value | `{ data: lazy(() => JSON.stringify(obj)) }` |
| Async function   | Asynchronous operation needed                      | `{ user: async () => fetchUser(id) }`       |
| `isEnabledFor()` | Multiple log statements or setup work              | `if (logger.isEnabledFor("debug")) { ... }` |


Performance considerations
--------------------------

### Overhead of lazy evaluation

Lazy evaluation introduces minimal overhead:

 -  `lazy()` wraps a function call, adding negligible overhead (~nanoseconds)
 -  The main benefit comes from *avoiding* expensive operations, not from
    the wrapper itself
 -  Async lazy evaluation has slightly higher overhead due to promise handling

### Common anti-patterns

Avoid these patterns that defeat the purpose of lazy evaluation:

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const obj: unknown = {};
// ---cut---
// ❌ BAD: Computing the value before passing it to lazy()
const serialized = JSON.stringify(obj);  // [!code error]
logger.debug("Data", { data: lazy(() => serialized) });
~~~~

~~~~ typescript twoslash
import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const obj: unknown = {};
// ---cut---
// ✅ GOOD: Let lazy() defer the computation
logger.debug("Data", { data: lazy(() => JSON.stringify(obj)) });
~~~~

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const value: unknown = "";
// ---cut---
// ❌ BAD: Using lazy() for cheap operations
logger.debug("Count", { count: lazy(() => value) });  // [!code error]
~~~~

~~~~ typescript twoslash
// @noErrors: 2304 2322
import { getLogger, lazy } from "@logtape/logtape";
const logger = getLogger(["my-app"]);
const value: unknown = "";
// ---cut---
// ✅ GOOD: Use direct values for cheap operations
logger.debug("Count", { count: value });
~~~~


See also
--------

 -  *[Contexts]*: Detailed information about logger contexts and the `with()`
    method
 -  *[Structured logging]*: More about structured logging and async lazy
    evaluation
 -  *[Quick start]*: Introduction to `isEnabledFor()` method

[Contexts]: ./contexts.md
