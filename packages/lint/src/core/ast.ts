/**
 * Shared, host-agnostic AST analysis used by both the ESLint rules
 * (`../rules/`) and the Deno Lint plugin (`../deno/plugin.ts`).
 *
 * Every function here works on plain ESTree-shaped AST nodes and depends only
 * on `node.type` / `node.parent` style traversal, so the same logic runs under
 * ESLint, Oxlint, and Deno Lint.  Divergences between the host ASTs (e.g. Deno
 * exposing `TemplateElement.cooked` directly where ESTree nests it under
 * `value.cooked`) are absorbed here with `??` fallbacks, so an edge case is
 * fixed once rather than in two drifting copies.
 *
 * This module must not import from `eslint`, not even types: the Deno plugin
 * imports it and must stay loadable without the ESLint package present.
 *
 * @module
 */

// The lint AST is untyped and differs across hosts, so these helpers operate
// on `any` nodes by design.
// deno-lint-ignore-file no-explicit-any

/**
 * Log method names that the LogTape lint rules check.
 */
export const LOG_METHODS: Set<string> = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "warning",
  "error",
  "fatal",
]);

/**
 * AST node types that introduce their own function scope.
 */
export const ASYNC_FUNCTION_TYPES: Set<string> = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

/**
 * Maximum depth for the recursive AST scans.  The AST is finite, so this is a
 * safety net against pathological nesting rather than an expected limit; it is
 * generous enough to cover deeply nested log property objects (complex API
 * payloads, ORM entities) without false negatives.
 */
const MAX_RECURSION_DEPTH = 100;

/**
 * Whether an import source refers to the LogTape core package.  Accepts the
 * bare specifier (`@logtape/logtape`) as well as direct Deno-style `jsr:` and
 * `npm:` specifiers with an optional version suffix (e.g.
 * `jsr:@logtape/logtape` or `npm:@logtape/logtape@^1.0.0`).
 */
export function isLogtapeImportSource(source: unknown): boolean {
  return typeof source === "string" &&
    /^(?:(?:jsr|npm):)?@logtape\/logtape(?:@[^/]+)?$/.test(source);
}

/**
 * Unwrap TypeScript type-assertion wrappers around an expression (`x as T`,
 * `<T>x`, `x satisfies T`, `x!`) so the rules analyze the underlying node.
 * Each wrapper exposes the inner node as `.expression`.  Returns the node
 * unchanged when it is not such a wrapper.
 */
export function unwrapTypeAssertion(node: any): any {
  while (
    node &&
    (node.type === "TSAsExpression" ||
      node.type === "TSTypeAssertion" ||
      node.type === "TSSatisfiesExpression" ||
      node.type === "TSNonNullExpression")
  ) {
    node = node.expression;
  }
  return node;
}

/**
 * Resolve the log method name from a member-expression callee
 * (`logger.debug` -> `"debug"`), supporting computed string-literal access
 * (`logger["debug"]`).  Returns `null` for a computed non-literal property or a
 * non-member callee.
 */
export function logMethodName(callee: any): string | null {
  if (!callee || callee.type !== "MemberExpression") return null;
  if (!callee.computed) return callee.property?.name ?? null;
  // A computed key must be a string literal; a numeric literal (logger[0]) is
  // not a method name and must not be returned as one.
  return callee.property?.type === "Literal" &&
      typeof callee.property.value === "string"
    ? callee.property.value
    : null;
}

/**
 * Recursively check whether an AST node contains an eagerly evaluated call
 * anywhere in its subtree.  Only inspects own-enumerable child nodes, skipping
 * metadata fields.  A LogTape `lazy(...)` call (whose local names are in
 * `lazyNames`) is already deferred, so it is not counted as eager; its
 * arguments are still inspected, so `lazy(expensive())` is caught while
 * `lazy(() => expensive())` is not.
 */
export function containsCallExpression(
  node: any,
  lazyNames: Set<string>,
  depth = 0,
): boolean {
  if (depth > MAX_RECURSION_DEPTH || !node || typeof node !== "object") {
    return false;
  }
  const isLazyCall = node.type === "CallExpression" &&
    node.callee?.type === "Identifier" && lazyNames.has(node.callee.name);
  if (
    !isLazyCall && (
      node.type === "CallExpression" ||
      node.type === "OptionalCallExpression" ||
      node.type === "NewExpression" ||
      node.type === "TaggedTemplateExpression" ||
      node.type === "ImportExpression"
    )
  ) {
    return true;
  }
  // Don't recurse into function bodies — calls inside them are deferred,
  // not eagerly evaluated at the call site.
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    return false;
  }
  // Enumerate with for-in, not Object.keys: Deno's lint AST exposes child
  // nodes as enumerable getters on the prototype (Object.keys returns []),
  // while ESTree exposes them as own properties; for-in covers both.  `parent`
  // is non-enumerable in Deno and skipped below for ESTree.
  for (const key in node) {
    if (
      key === "type" || key === "start" || key === "end" ||
      key === "loc" || key === "parent" || key === "range"
    ) {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (
          typeof item === "object" && item !== null &&
          containsCallExpression(item, lazyNames, depth + 1)
        ) return true;
      }
    } else if (typeof child === "object" && child !== null) {
      if (containsCallExpression(child, lazyNames, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Recursively check whether a node contains an `AwaitExpression` or
 * `YieldExpression` in the same function scope.  Does not descend into nested
 * function bodies.
 */
export function containsAwaitOrYield(node: any, depth = 0): boolean {
  if (depth > MAX_RECURSION_DEPTH || !node || typeof node !== "object") {
    return false;
  }
  if (node.type === "AwaitExpression" || node.type === "YieldExpression") {
    return true;
  }
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    return false;
  }
  // Enumerate with for-in, not Object.keys: Deno's lint AST exposes child
  // nodes as enumerable getters on the prototype (Object.keys returns []),
  // while ESTree exposes them as own properties; for-in covers both.  `parent`
  // is non-enumerable in Deno and skipped below for ESTree.
  for (const key in node) {
    if (
      key === "type" || key === "start" || key === "end" ||
      key === "loc" || key === "parent" || key === "range"
    ) {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (
          typeof item === "object" && item !== null &&
          containsAwaitOrYield(item, depth + 1)
        ) return true;
      }
    } else if (typeof child === "object" && child !== null) {
      if (containsAwaitOrYield(child, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * From a log call's argument list, select the eager properties object and note
 * whether it came from the properties-only overload.  The properties object is
 * the second argument in the message+properties form
 * (`logger.debug("msg", { ... })`) or the first argument in the
 * properties-only form (`logger.debug({ ... })`).  TypeScript type assertions
 * (e.g. `{ ... } as const`) are unwrapped first.  Returns `null` when neither
 * argument is an object literal.
 *
 * `propsObject` is the unwrapped object (for detection and the report
 * location); `fixTarget` is the original, still-wrapped argument node, so the
 * autofix replaces the whole `{ ... } as const` rather than leaving the
 * assertion dangling on the new callback.  When the argument is not wrapped the
 * two are the same node.
 */
export function selectLazyPropsObject(
  args: any,
): { propsObject: any; fixTarget: any; propertiesOnly: boolean } | null {
  const firstRaw = args?.[0];
  const secondRaw = args?.[1];
  const firstArg = unwrapTypeAssertion(firstRaw);
  const secondArg = unwrapTypeAssertion(secondRaw);
  if (firstArg && firstArg.type === "ObjectExpression") {
    return { propsObject: firstArg, fixTarget: firstRaw, propertiesOnly: true };
  }
  if (secondArg && secondArg.type === "ObjectExpression") {
    return {
      propsObject: secondArg,
      fixTarget: secondRaw,
      propertiesOnly: false,
    };
  }
  return null;
}

/**
 * Whether any property (or spread) of a properties object contains an eager
 * call that would benefit from lazy evaluation.
 */
export function propsHaveEagerCall(
  propsObject: any,
  lazyNames: Set<string>,
): boolean {
  return propsObject.properties?.some(
    (prop: any) =>
      (prop.type === "Property" &&
        (containsCallExpression(prop.value, lazyNames) ||
          (prop.computed &&
            containsCallExpression(prop.key, lazyNames)))) ||
      (prop.type === "SpreadElement" &&
        containsCallExpression(prop.argument, lazyNames)),
  ) ?? false;
}

/**
 * Whether `node` is an async function literal (arrow or function expression).
 */
export function isAsyncFunctionExpr(node: any): boolean {
  return (node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionExpression") && node.async === true;
}

/**
 * Walk up the parent chain to find the nearest enclosing function.  Returns
 * `null` if the top of the tree is reached without finding one.
 */
export function findEnclosingFunction(node: any): any {
  let current = node.parent;
  while (current) {
    if (ASYNC_FUNCTION_TYPES.has(current.type)) return current;
    current = current.parent;
  }
  return null;
}

/**
 * Whether `fn` is a function passed directly as a call argument (e.g. an array
 * `.map()`/`.forEach()` callback).  Such a function's return value is decided
 * by the receiving call, so a promise it returns may be awaited or discarded.
 */
export function isCallArgumentFunction(fn: any): boolean {
  const parent = fn?.parent;
  return parent?.type === "CallExpression" &&
    parent.callee !== fn &&
    (parent.arguments?.includes(fn) ?? false);
}

/**
 * Array iteration methods that ignore or coerce their callback's return value,
 * so a promise returned from the callback is dropped.
 */
const DISCARDING_ARRAY_METHODS: Set<string> = new Set([
  "forEach",
  "filter",
  "find",
  "findLast",
  "findIndex",
  "findLastIndex",
  "some",
  "every",
]);

/**
 * Global "fire and forget" functions that ignore their callback's return value
 * entirely, so a promise returned from the callback is never awaited.
 */
const FIRE_AND_FORGET_GLOBALS: Set<string> = new Set([
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
]);

/**
 * Whether `fn` is a callback argument to a call that ignores or coerces its
 * callback's return value: an array method like `forEach`/`filter`/`some`, or a
 * fire-and-forget global like `setTimeout`/`queueMicrotask`.  Such a call does
 * not propagate the callback's promise, so an async log returned from it is
 * dropped and the walk must stop there rather than continue to an outer
 * await/return.
 */
export function isDiscardedCallbackArgument(fn: any): boolean {
  const parent = fn?.parent;
  if (!parent || parent.type !== "CallExpression") return false;
  if (parent.callee === fn) return false;
  if (!(parent.arguments?.includes(fn) ?? false)) return false;
  const callee = parent.callee;
  // setTimeout(() => ...), queueMicrotask(() => ...), etc.
  if (
    callee?.type === "Identifier" && FIRE_AND_FORGET_GLOBALS.has(callee.name)
  ) {
    return true;
  }
  // items.forEach(() => ...) or items["forEach"](() => ...), etc.
  // logMethodName resolves both the plain and computed string-literal forms.
  const methodName = logMethodName(callee);
  return methodName !== null && DISCARDING_ARRAY_METHODS.has(methodName);
}

/**
 * Whether `node` is the result of a `map()`/`flatMap()` call.  Such a call
 * returns an array of the callback's return values, so awaiting or returning it
 * does not await the element promises; only a Promise combinator
 * (`Promise.all`/`allSettled`) awaits those.
 */
export function isMapResult(node: any): boolean {
  return node?.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property?.type === "Identifier" &&
    (node.callee.property.name === "map" ||
      node.callee.property.name === "flatMap");
}

/**
 * Array methods that return a new array holding the same elements, so a
 * `map()`/`flatMap()` result chained through them is still an array of the
 * original promises (e.g. `arr.map(cb).filter(Boolean)`).  Methods that unwrap
 * to a single element (`find`, `at`) or transform the elements (`map`,
 * `reduce`) are deliberately excluded.
 */
const ELEMENT_PRESERVING_ARRAY_METHODS: Set<string> = new Set([
  "filter",
  "slice",
  "concat",
  "flat",
  "reverse",
  "sort",
  "toSorted",
  "toReversed",
  "with",
]);

/**
 * Whether `node` evaluates to an array of the promises produced by a
 * `map()`/`flatMap()`, either directly or chained through element-preserving
 * array methods (`arr.map(cb).filter(...).slice(...)`).  Awaiting or returning
 * such an array awaits the array, not the element promises.
 */
export function isMapResultChain(node: any, depth = 0): boolean {
  if (depth > MAX_RECURSION_DEPTH || !node) return false;
  if (isMapResult(node)) return true;
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property?.type === "Identifier" &&
    ELEMENT_PRESERVING_ARRAY_METHODS.has(node.callee.property.name)
  ) {
    return isMapResultChain(node.callee.object, depth + 1);
  }
  return false;
}

/**
 * Whether `node` is an expression that is syntactically a promise.  Recognizes
 * `x.then(...)` / `.catch(...)` / `.finally(...)`, `new Promise(...)`, and
 * `Promise.resolve/reject/all/allSettled/race/any(...)`.  This cannot see a
 * promise returned by an opaque call (e.g. `fetchData()` whose return type is a
 * promise), which a syntactic lint rule has no type information for.
 */
export function isPromiseReturningExpr(node: any): boolean {
  if (!node) return false;
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" && !node.callee.computed &&
    node.callee.property?.type === "Identifier"
  ) {
    const name = node.callee.property.name;
    if (name === "then" || name === "catch" || name === "finally") return true;
    if (
      node.callee.object?.type === "Identifier" &&
      node.callee.object.name === "Promise"
    ) return true;
  }
  if (
    node.type === "NewExpression" && node.callee?.type === "Identifier" &&
    node.callee.name === "Promise"
  ) return true;
  return false;
}

/**
 * Whether a block contains a `return <promise>` statement, without descending
 * into nested functions (whose returns belong to them, not to the block's
 * function).
 */
export function blockReturnsPromise(node: any, depth = 0): boolean {
  if (depth > MAX_RECURSION_DEPTH || !node || typeof node !== "object") {
    return false;
  }
  if (node.type === "ReturnStatement") {
    return isPromiseReturningExpr(node.argument);
  }
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    return false;
  }
  // Enumerate with for-in, not Object.keys: Deno's lint AST exposes child
  // nodes as enumerable getters on the prototype (Object.keys returns []),
  // while ESTree exposes them as own properties; for-in covers both.  `parent`
  // is non-enumerable in Deno and skipped below for ESTree.
  for (const key in node) {
    if (
      key === "type" || key === "start" || key === "end" ||
      key === "loc" || key === "parent" || key === "range"
    ) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (
          typeof item === "object" && item !== null &&
          blockReturnsPromise(item, depth + 1)
        ) return true;
      }
    } else if (typeof child === "object" && child !== null) {
      if (blockReturnsPromise(child, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Whether `fn` is a function (arrow, function expression, or function
 * declaration) whose body returns a syntactically promise-typed value, even
 * though it is not declared `async`.  LogTape awaits any promise the lazy
 * callback returns, e.g. `() => fetchData().then((data) => ({ data }))`, so a
 * non-async helper resolved by reference needs the same handling as an inline
 * one.
 */
export function isPromiseReturningCallback(fn: any): boolean {
  if (
    fn?.type !== "ArrowFunctionExpression" &&
    fn?.type !== "FunctionExpression" &&
    fn?.type !== "FunctionDeclaration"
  ) {
    return false;
  }
  const body = fn.body;
  // Concise arrow body: `() => promise`.
  if (body && body.type !== "BlockStatement") {
    return isPromiseReturningExpr(body);
  }
  return blockReturnsPromise(body);
}

/**
 * Whether `arrayNode` is the argument array of a Promise combinator that awaits
 * every element, i.e. `Promise.all([...])` or `Promise.allSettled([...])`.
 * Those consume all element promises, so a log promise inside the array is
 * still awaited when the combinator is awaited.  `Promise.race`/`Promise.any`
 * are excluded: they can settle on another promise before the log promise
 * resolves, so the log write is not guaranteed to flush.  A bare array literal,
 * by contrast, does not preserve promise semantics at all.
 */
export function isPromiseCombinatorArrayArg(arrayNode: any): boolean {
  const parent = arrayNode.parent;
  if (!parent || parent.type !== "CallExpression") return false;
  if (!(parent.arguments?.includes(arrayNode) ?? false)) return false;
  const callee = parent.callee;
  return callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.object?.type === "Identifier" &&
    callee.object.name === "Promise" &&
    callee.property?.type === "Identifier" &&
    ["all", "allSettled"].includes(callee.property.name);
}

/**
 * Walk the ancestor chain of a log call to decide whether the promise it
 * returns is awaited, returned, or otherwise propagated to a caller that can
 * await it.  Returns `true` when the promise is handled and the call therefore
 * needs no `await`.
 *
 * Handled: the call is awaited, returned from a non-discarding function, the
 * concise body of a non-discarding arrow, or chained with
 * `.then`/`.catch`/`.finally`, or it sits inside `Promise.all`/`allSettled`.
 * Not handled (the walk stops and returns `false`): the promise is wrapped in
 * an object/array literal, awaiting a `map()`/`flatMap()` array (which awaits
 * the array, not its element promises), dropped by a discarding callback
 * (`forEach` etc.), or it reaches a statement boundary unconsumed.
 */
export function isLogPromiseHandled(node: any): boolean {
  let current: any = node;
  while (current) {
    const ancestor: any = current.parent;
    if (!ancestor) break;
    if (ancestor.type === "AwaitExpression") {
      // Awaiting a map()/flatMap() result (or such a result chained through
      // array methods) awaits the array, not the element promises inside it;
      // only a Promise combinator does.
      if (isMapResultChain(current)) break;
      return true;
    }
    // A return makes the promise the enclosing function's return value.  If
    // that function is a discarded call argument (e.g. a forEach()/map()
    // callback), keep walking from it so the outer call decides whether the
    // promise is awaited or discarded; if it is a normal or stored function,
    // trust its caller and treat it as propagated.
    if (ancestor.type === "ReturnStatement") {
      // Returning a map()/flatMap() result (or one chained through array
      // methods) propagates the array, not the element promises.
      if (isMapResultChain(current)) break;
      const fn = findEnclosingFunction(ancestor);
      if (fn && isCallArgumentFunction(fn)) {
        // A discarder (forEach etc.) drops the returned promise, so the walk
        // must stop rather than reach an outer await/return.
        if (isDiscardedCallbackArgument(fn)) break;
        current = fn;
        continue;
      }
      return true;
    }
    // Concise arrow body: `() => logger.debug(...)` makes the promise the
    // arrow's return value, the same as a return statement.  Apply the same
    // rule: keep walking when the arrow is a non-discarding callback, otherwise
    // treat it as propagated to an unknown caller (handled).
    if (
      ancestor.type === "ArrowFunctionExpression" &&
      ancestor.body === current
    ) {
      if (!isCallArgumentFunction(ancestor)) return true;
      // A discarder (forEach etc.) drops the promise; stop the walk.
      if (isDiscardedCallbackArgument(ancestor)) break;
      // Otherwise fall through and keep walking from the arrow itself.
    }
    // .then()/.catch()/.finally() must be actual non-computed calls.  Computed
    // accesses like obj[then]() use a variable, not the method.
    if (ancestor.type === "MemberExpression") {
      const prop = ancestor.property;
      const isPromiseMethod = !ancestor.computed
        ? prop?.type === "Identifier" &&
          ["then", "catch", "finally"].includes(prop.name)
        : prop?.type === "Literal" &&
          ["then", "catch", "finally"].includes(prop.value);
      if (isPromiseMethod) {
        const grandAncestor: any = ancestor.parent;
        if (
          grandAncestor?.type === "CallExpression" &&
          grandAncestor.callee === ancestor
        ) {
          return true;
        }
      }
    }
    // An array or object literal wraps the promise; awaiting or returning the
    // container does not await or propagate the promise itself.  The one
    // exception is an array passed to a Promise combinator (Promise.all etc.),
    // which consumes its elements.
    if (ancestor.type === "ObjectExpression") break;
    if (ancestor.type === "ArrayExpression") {
      // Break for a bare array.  For a Promise.all/allSettled array, continue
      // only when the element we came through is itself a promise: if it is a
      // map()/flatMap() result (an array of promises), the combinator awaits
      // that array, not its inner promises, so the log promise stays unhandled.
      if (!isPromiseCombinatorArrayArg(ancestor) || isMapResultChain(current)) {
        break;
      }
    }
    // A sequence (comma) operator yields only its last operand; a log call in
    // an earlier position is evaluated for its side effect and its promise is
    // dropped.
    if (
      ancestor.type === "SequenceExpression" &&
      ancestor.expressions?.[ancestor.expressions.length - 1] !== current
    ) {
      break;
    }
    // A unary or binary operator consumes the promise as a plain value
    // (coercion, negation, etc.), so the awaited result is never the log
    // promise itself.
    if (
      ancestor.type === "UnaryExpression" ||
      ancestor.type === "BinaryExpression"
    ) {
      break;
    }
    // Stop at statement boundaries.
    if (
      ancestor.type === "ExpressionStatement" ||
      ancestor.type === "VariableDeclarator" ||
      ancestor.type === "AssignmentExpression"
    ) {
      break;
    }
    current = ancestor;
  }
  return false;
}

/**
 * Whether `await ` can be safely inserted before a log call as an autofix.
 * Only a standalone statement inside an async function qualifies: inserting
 * `await` where the call's value is used (assigned, passed as an argument,
 * returned) would change a `Promise<void>` into `void` and can break code that
 * uses that promise.
 */
export function canInsertAwait(node: any): boolean {
  const enclosingFn = findEnclosingFunction(node);
  return enclosingFn != null && enclosingFn.async === true &&
    node.parent?.type === "ExpressionStatement";
}

/**
 * Resolve the static name of an object property key, or `null` when the key is
 * computed from a non-literal expression (e.g. `[someVar]`).  A plain key
 * (`loggers`), a string-literal key (`"loggers"`), and a computed
 * string-literal key (`["loggers"]`) all resolve to their name, but a computed
 * identifier key like `[loggers]` (a variable) does not.
 */
export function staticKeyName(prop: any): string | null {
  if (!prop.computed) {
    if (typeof prop.key?.name === "string") return prop.key.name;
    if (typeof prop.key?.value === "string") return prop.key.value;
    return null;
  }
  // A computed key must be a string literal; a numeric literal ({ [0]: ... })
  // is not a static name.
  return prop.key?.type === "Literal" && typeof prop.key.value === "string"
    ? prop.key.value
    : null;
}

/**
 * Whether an AST node is the string `value`, written either as a plain string
 * literal or as a template literal with no interpolations (a backtick constant
 * such as `` `logtape` ``).  Deno's `TemplateElement` exposes `cooked`
 * directly; ESTree nests it under `value.cooked`, so accept either shape.
 */
export function isStringLiteral(node: any, value: string): boolean {
  if (node?.type === "Literal") return node.value === value;
  if (node?.type === "TemplateLiteral") {
    const cooked = node.quasis?.[0]?.value?.cooked ?? node.quasis?.[0]?.cooked;
    return node.expressions?.length === 0 &&
      node.quasis?.length === 1 &&
      cooked === value;
  }
  return false;
}

/**
 * Whether an AST node is the array literal `["logtape"]` or
 * `["logtape", "meta"]`.
 */
export function isLogtapeMetaArray(node: any): boolean {
  if (node?.type !== "ArrayExpression") return false;
  const elems = node.elements;
  if (!isStringLiteral(elems[0], "logtape")) return false;
  if (elems.length === 1) return true;
  return elems.length === 2 && isStringLiteral(elems[1], "meta");
}

/**
 * Whether a logger entry covers the meta category with at least one non-empty
 * sinks list.  Only the array form (`["logtape"]` or `["logtape", "meta"]`)
 * configures the meta logger: core's `configureInternal()` meta check inspects
 * the category as an array, so a bare string `category: "logtape"` leaves the
 * meta logger unconfigured and must not satisfy the rule.
 */
export function isMetaLoggerEntry(entry: any): boolean {
  if (!entry || entry.type !== "ObjectExpression") return false;

  let categoryNode: any = null;
  let sinksNode: any = null;

  for (const prop of entry.properties) {
    if (prop.type !== "Property") continue;
    const keyName = staticKeyName(prop);
    // Unwrap a type assertion on the value (e.g. `["logtape", "meta"] as
    // const`) so an asserted category or sinks array is still recognized.
    if (keyName === "category") categoryNode = unwrapTypeAssertion(prop.value);
    if (keyName === "sinks") sinksNode = unwrapTypeAssertion(prop.value);
  }

  if (!categoryNode) return false;
  if (!isLogtapeMetaArray(categoryNode)) return false;

  if (!sinksNode) return false;
  // Non-literal (e.g. variable reference): assume non-empty to avoid false
  // positives.
  if (sinksNode.type !== "ArrayExpression") return true;
  return sinksNode.elements.length > 0;
}

/**
 * Whether a `configure()`/`configureSync()` argument lacks a dedicated meta
 * logger sink and so should be reported.  Returns `false` (no report) when the
 * argument is not an object literal, uses spread elements that may supply the
 * meta logger, or already has a logger entry for the meta category.
 */
export function configNeedsMetaSink(configArg: any): boolean {
  if (!configArg || configArg.type !== "ObjectExpression") return false;

  const properties = configArg.properties ?? [];
  const loggersProperty = properties.find(
    (p: any) => p.type === "Property" && staticKeyName(p) === "loggers",
  );
  const hasSpread = properties.some((p: any) => p.type === "SpreadElement");
  if (!loggersProperty) return !hasSpread;

  const loggersValue = unwrapTypeAssertion(loggersProperty.value);
  if (loggersValue.type !== "ArrayExpression") return false;

  const hasLoggerSpread = loggersValue.elements?.some(
    (el: any) => el?.type === "SpreadElement",
  );
  if (hasLoggerSpread) return false;

  return !loggersValue.elements?.some(isMetaLoggerEntry);
}
