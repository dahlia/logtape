/**
 * Deno Lint plugin for LogTape lint rules.
 *
 * > [!NOTE]
 * > The Deno Lint plugin API is currently experimental (unstable).
 * > This plugin requires Deno 2.2.0 or later with the `--unstable-lint` flag
 * > or the `"unstable": ["lint"]` option in your `deno.json`.
 *
 * Add this plugin to your `deno.json`:
 * ```json
 * {
 *   "lint": {
 *     "plugins": ["jsr:@logtape/lint/deno"],
 *     "rules": {
 *       "include": [
 *         "logtape/no-message-interpolation",
 *         "logtape/prefer-lazy-evaluation",
 *         "logtape/no-unawaited-log",
 *         "logtape/require-meta-sink"
 *       ]
 *     }
 *   }
 * }
 * ```
 *
 * The rule detection logic is shared with the ESLint rules via `../core/ast.ts`;
 * only the scope tracking (which the Deno Lint API does not provide a manager
 * for) and the report/fix wiring are implemented here.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any

import {
  canInsertAwait,
  configNeedsMetaSink,
  containsAwaitOrYield,
  isAsyncFunctionExpr,
  isLogPromiseHandled,
  isLogtapeImportSource,
  isPromiseReturningCallback,
  LOG_METHODS,
  logMethodName,
  propsHaveEagerCall,
  selectLazyPropsObject,
  unwrapTypeAssertion,
} from "../core/ast.ts";

// Collect every identifier name bound by a (possibly destructured) binding
// target: a plain parameter, an object/array pattern, a default, or a rest.
function extractIdentifiers(node: any, names: Set<string>): void {
  if (!node) return;
  if (node.type === "Identifier") {
    names.add(node.name);
  } else if (node.type === "ObjectPattern") {
    for (const prop of node.properties ?? []) {
      if (prop.type === "Property") {
        extractIdentifiers(prop.value, names);
      } else if (prop.type === "RestElement") {
        extractIdentifiers(prop.argument, names);
      }
    }
  } else if (node.type === "ArrayPattern") {
    for (const elem of node.elements ?? []) {
      extractIdentifiers(elem, names);
    }
  } else if (node.type === "AssignmentPattern") {
    extractIdentifiers(node.left, names);
  } else if (node.type === "RestElement") {
    extractIdentifiers(node.argument, names);
  } else if (node.type === "TSParameterProperty") {
    // A constructor parameter property (`constructor(private logger: Logger)`)
    // wraps the actual binding under `.parameter`.
    extractIdentifiers(node.parameter, names);
  }
}

/**
 * Creates a scope tracker for LogTape logger variable bindings.
 *
 * The Deno Lint plugin API does not expose a scope manager, so this hand-rolls
 * one with a scope stack (Map<name, isLogger>) to correctly handle:
 * - Function parameters that shadow logger names (tracked as false)
 * - Local variables that re-declare logger names with non-logger values
 * - Block scoping via BlockStatement enter/exit
 *
 * Returns a `visitors` object to spread into a rule's visitor map, plus the
 * scope-aware predicates the rule's `CallExpression` handler needs.
 */
function makeLoggerScope(): {
  visitors: Record<string, (node: any) => void>;
  isLogtapeCallee: (callee: any) => boolean;
  isAsyncFunctionName: (name: string) => boolean;
  lazyNames: Set<string>;
  effectiveLazyNames: () => Set<string>;
} {
  const getterNames = new Set<string>();
  // Local names of `lazy` imported from @logtape/logtape; a lazy() value is
  // already deferred and must not be treated as an eager call.
  const lazyNames = new Set<string>();
  // Each Map entry: true = logger binding, false = shadowing non-logger
  const scopeStack: Array<Map<string, boolean>> = [new Map()];
  // Tracks scopes where a getter name is shadowed by a parameter or local
  const shadowedGetterStack: Array<Set<string>> = [new Set()];
  // Tracks scopes where an imported `lazy` name is shadowed by a local binding
  const shadowedLazyStack: Array<Set<string>> = [new Set()];
  // Per-scope promise-callback bindings: true = bound to a function that yields
  // a promise (async, or non-async but syntactically promise-returning), false
  // = bound to something else (a parameter, plain sync local, etc.) that
  // shadows an outer binding.  Lookups stop at the nearest binding, so an outer
  // name does not leak into an inner scope that rebinds it.
  const asyncFnStack: Array<Map<string, boolean>> = [new Map()];

  function pushScope() {
    scopeStack.push(new Map());
    shadowedGetterStack.push(new Set());
    shadowedLazyStack.push(new Set());
    asyncFnStack.push(new Map());
  }

  function popScope() {
    if (scopeStack.length > 1) scopeStack.pop();
    if (shadowedGetterStack.length > 1) shadowedGetterStack.pop();
    if (shadowedLazyStack.length > 1) shadowedLazyStack.pop();
    if (asyncFnStack.length > 1) asyncFnStack.pop();
  }

  function isLoggerName(name: string): boolean {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return scopeStack[i].get(name)!;
    }
    return false;
  }

  // Whether `name` resolves to a binding that yields a promise (an async
  // function or a non-async promise-returning one) in the current scope chain.
  function isAsyncFunctionName(name: string): boolean {
    for (let i = asyncFnStack.length - 1; i >= 0; i--) {
      if (asyncFnStack[i].has(name)) return asyncFnStack[i].get(name)!;
    }
    return false;
  }

  function isGetterShadowed(name: string): boolean {
    for (let i = shadowedGetterStack.length - 1; i >= 0; i--) {
      if (shadowedGetterStack[i].has(name)) return true;
    }
    return false;
  }

  function isLazyShadowed(name: string): boolean {
    for (let i = shadowedLazyStack.length - 1; i >= 0; i--) {
      if (shadowedLazyStack[i].has(name)) return true;
    }
    return false;
  }

  // Record that `name`, a local binding in the current scope, shadows the
  // imported getLogger and/or lazy.  Names are recorded unconditionally rather
  // than gated on getterNames/lazyNames: this also runs during the Program
  // pre-scan, before the ImportDeclaration visitor has populated those sets, so
  // gating would miss a top-level shadow.  Recording extra names is harmless,
  // since the stacks are only ever queried for the imported getLogger/lazy
  // names.
  function recordImportShadow(name: string) {
    shadowedGetterStack[shadowedGetterStack.length - 1].add(name);
    shadowedLazyStack[shadowedLazyStack.length - 1].add(name);
  }

  // The subset of lazyNames not shadowed by a local binding in the current
  // scope chain, so a shadowed `lazy(...)` is treated as an ordinary eager
  // call rather than LogTape's deferred wrapper.
  function effectiveLazyNames(): Set<string> {
    if (lazyNames.size === 0) return lazyNames;
    const result = new Set<string>();
    for (const name of lazyNames) {
      if (!isLazyShadowed(name)) result.add(name);
    }
    return result;
  }

  function handleFunctionEnter(node: any) {
    // A named function declaration binds its name in the ENCLOSING scope, so
    // record getter shadowing and promise-returning-ness there before pushing
    // the new scope: `async function props() {}`, or a non-async
    // `function props() { return p.then(...) }`, makes `props` a promise
    // callback.
    if (
      node.type === "FunctionDeclaration" &&
      node.id?.type === "Identifier"
    ) {
      recordImportShadow(node.id.name);
      // A function declaration named like a logger shadows it: it is a
      // function, never a LogTape logger.
      scopeStack[scopeStack.length - 1].set(node.id.name, false);
      asyncFnStack[asyncFnStack.length - 1].set(
        node.id.name,
        node.async === true || isPromiseReturningCallback(node),
      );
    }
    pushScope();
    const names = new Set<string>();
    // A named function expression binds its own name inside its body, shadowing
    // any outer binding of that name (a logger, getLogger, etc.).
    if (node.type === "FunctionExpression" && node.id?.type === "Identifier") {
      names.add(node.id.name);
    }
    for (const param of node.params ?? []) {
      extractIdentifiers(param, names);
    }
    for (const name of names) {
      scopeStack[scopeStack.length - 1].set(name, false);
      recordImportShadow(name);
      // A parameter rebinds the name, shadowing any outer async-callback
      // binding so it does not leak into the function body.
      asyncFnStack[asyncFnStack.length - 1].set(name, false);
    }
  }

  // Function declarations are hoisted to the top of their block, so a local
  // `function getLogger() {}` shadows the import for the whole block, including
  // statements that appear before it.  Pre-scan the block's direct statements
  // on entry and record those shadows before any statement is visited.
  function handleBlockEnter(node: any) {
    pushScope();
    for (const stmt of node.body ?? []) {
      if (
        stmt?.type === "FunctionDeclaration" && stmt.id?.type === "Identifier"
      ) {
        recordImportShadow(stmt.id.name);
        // A hoisted function declaration named like a logger shadows it for the
        // whole block, including earlier statements; it is never a logger.
        scopeStack[scopeStack.length - 1].set(stmt.id.name, false);
        // Hoist promise-returning-ness too, so a callback referencing a
        // function declared later in the block is still recognized.
        asyncFnStack[asyncFnStack.length - 1].set(
          stmt.id.name,
          stmt.async === true || isPromiseReturningCallback(stmt),
        );
      }
    }
  }

  // A catch parameter binds names in the catch scope, the same as function
  // parameters; record them as non-logger bindings so a `catch (logger) {}`
  // does not resolve to an outer LogTape logger.
  function handleCatchEnter(node: any) {
    pushScope();
    if (!node.param) return;
    const names = new Set<string>();
    extractIdentifiers(node.param, names);
    for (const name of names) {
      scopeStack[scopeStack.length - 1].set(name, false);
      recordImportShadow(name);
      // A catch parameter rebinds the name, shadowing any outer async binding.
      asyncFnStack[asyncFnStack.length - 1].set(name, false);
    }
  }

  // Is `node` an expression that evaluates to a LogTape logger?  Handles
  // direct getLogger(...) calls (unless the getter name is shadowed),
  // identifiers already bound to a logger in scope, and contextual or child
  // loggers produced by chaining Logger.with(...) or Logger.getChild(...).
  function isLoggerExpr(node: any, depth = 0): boolean {
    if (depth > 16 || !node) return false;
    // getLogger(...) — direct call to the (unshadowed) imported getter.
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      getterNames.has(node.callee.name) &&
      !isGetterShadowed(node.callee.name)
    ) return true;
    // logger.with(...) / logger.getChild(...) — these return a Logger, so the
    // whole call expression is itself a logger expression.
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property?.type === "Identifier" &&
      (node.callee.property.name === "with" ||
        node.callee.property.name === "getChild")
    ) {
      return isLoggerExpr(node.callee.object, depth + 1);
    }
    // An identifier already bound to a logger in the current scope chain.
    if (node.type === "Identifier") return isLoggerName(node.name);
    return false;
  }

  function isLogtapeCallee(callee: any): boolean {
    if (!callee || callee.type !== "MemberExpression") return false;
    // The object may be a logger identifier, an inline getLogger(...) call, or
    // a contextual/child logger chain such as getLogger("app").with({ ... }).
    return isLoggerExpr(callee.object);
  }

  return {
    visitors: {
      ImportDeclaration(node: any) {
        if (!isLogtapeImportSource(node.source?.value)) return;
        for (const spec of node.specifiers ?? []) {
          if (spec.type !== "ImportSpecifier") continue;
          if (spec.imported?.name === "getLogger") {
            getterNames.add(spec.local?.name);
          } else if (spec.imported?.name === "lazy") {
            lazyNames.add(spec.local?.name);
          }
        }
      },
      VariableDeclarator(node: any) {
        if (node.id?.type === "Identifier") {
          const name = node.id.name;
          const init = node.init;
          const isLogger = isLoggerExpr(init);
          if (isLogger) {
            scopeStack[scopeStack.length - 1].set(name, true);
          } else if (isLoggerName(name)) {
            // Explicit non-logger assignment shadows the outer logger binding
            scopeStack[scopeStack.length - 1].set(name, false);
          }
          // A local declaration shadows an imported getLogger or lazy, so a
          // later inline getLogger()/lazy() in this scope is the local binding,
          // not the import.
          recordImportShadow(name);
          // Record whether this local is bound to a function literal that
          // yields a promise (async, or non-async but promise-returning) so a
          // lazy callback passed by reference is detected; any other binding
          // shadows an outer promise-callback binding of the same name.
          asyncFnStack[asyncFnStack.length - 1].set(
            name,
            isAsyncFunctionExpr(init) || isPromiseReturningCallback(init),
          );
        } else {
          // Destructured declaration (e.g. const { logger } = obj): shadow any
          // matching names to avoid false positives.
          const names = new Set<string>();
          extractIdentifiers(node.id, names);
          for (const name of names) {
            if (isLoggerName(name)) {
              scopeStack[scopeStack.length - 1].set(name, false);
            }
            // A destructured getLogger/lazy name is likewise a local,
            // non-import binding.
            recordImportShadow(name);
            // A destructured binding is not a known async function and shadows
            // any outer async binding of the same name.
            asyncFnStack[asyncFnStack.length - 1].set(name, false);
          }
        }
      },
      FunctionDeclaration: handleFunctionEnter,
      "FunctionDeclaration:exit": popScope,
      FunctionExpression: handleFunctionEnter,
      "FunctionExpression:exit": popScope,
      ArrowFunctionExpression: handleFunctionEnter,
      "ArrowFunctionExpression:exit": popScope,
      // Program is a block-like scope: pre-scan it too so a top-level function
      // declared below a callback that references it is still hoisted.
      Program: handleBlockEnter,
      "Program:exit": popScope,
      BlockStatement: handleBlockEnter,
      "BlockStatement:exit": popScope,
      // A TypeScript namespace body (TSModuleBlock) is a lexical scope whose
      // statements are not wrapped in a block statement, so track it like a
      // block.  A class static block needs no separate handling: its body is
      // itself a BlockStatement, already covered above.
      TSModuleBlock: handleBlockEnter,
      "TSModuleBlock:exit": popScope,
      ForStatement: pushScope,
      "ForStatement:exit": popScope,
      ForInStatement: pushScope,
      "ForInStatement:exit": popScope,
      ForOfStatement: pushScope,
      "ForOfStatement:exit": popScope,
      // A switch block is a single lexical scope for its let/const
      // declarations, so push/pop one for it like a block.
      SwitchStatement: pushScope,
      "SwitchStatement:exit": popScope,
      CatchClause: handleCatchEnter,
      "CatchClause:exit": popScope,
    },
    isLogtapeCallee,
    isAsyncFunctionName,
    lazyNames,
    effectiveLazyNames,
  };
}

/**
 * Deno Lint plugin providing LogTape lint rules.
 *
 * > [!WARNING]
 * > The Deno Lint plugin API is experimental.  This plugin may break between
 * > Deno releases while the API is stabilised.
 */
const logtapePlugin: { name: string; rules: Record<string, unknown> } = {
  name: "logtape",

  rules: {
    /** Disallow template literal interpolation in log message arguments. */
    "no-message-interpolation": {
      create(ctx: any) {
        const scope = makeLoggerScope();
        return {
          ...scope.visitors,
          CallExpression(node: any) {
            if (!scope.isLogtapeCallee(node.callee)) return;
            const methodName = logMethodName(node.callee);
            if (!methodName || !LOG_METHODS.has(methodName)) return;
            const firstArg = unwrapTypeAssertion(node.arguments?.[0]);
            if (!firstArg || firstArg.type !== "TemplateLiteral") return;
            if (!firstArg.expressions?.length) return;
            ctx.report({
              node: firstArg,
              message:
                "Avoid using template literal interpolation in log messages. " +
                'Use a message template string with structured properties instead: logger.info("User {userId} logged in.", { userId }).',
            });
          },
        };
      },
    },

    /** Prefer lazy evaluation callbacks over eager property objects. */
    "prefer-lazy-evaluation": {
      create(ctx: any) {
        const scope = makeLoggerScope();
        return {
          ...scope.visitors,
          CallExpression(node: any) {
            if (!scope.isLogtapeCallee(node.callee)) return;
            const methodName = logMethodName(node.callee);
            if (!methodName || !LOG_METHODS.has(methodName)) return;
            // The eager properties object is the second argument in the
            // message+properties form, logger.debug("msg", { ... }), or the
            // first argument in the properties-only form, logger.debug({ ... }).
            const selected = selectLazyPropsObject(node.arguments);
            if (!selected) return;
            const { propsObject, fixTarget, propertiesOnly } = selected;
            // Use the lazy names that still resolve to the import in this
            // scope, so a shadowed local `lazy(...)` is treated as eager.
            if (!propsHaveEagerCall(propsObject, scope.effectiveLazyNames())) {
              return;
            }
            const hasAsyncSyntax = containsAwaitOrYield(propsObject);
            ctx.report({
              node: propsObject,
              message:
                "Wrap the properties object in a lazy callback to avoid unnecessary computation: " +
                'logger.debug("msg", () => ({ ... })).',
              // Wrap the whole argument (fixTarget), including any `as const` /
              // `satisfies` wrapper, so the assertion ends up inside the
              // callback instead of dangling on it.
              fix: hasAsyncSyntax ? undefined : (fixer: any) => {
                const sourceCode = ctx.sourceCode ?? ctx.getSourceCode?.();
                // Only slice by range when the source is a raw string and the
                // node actually carries a range; otherwise fall back to
                // getText so a missing range cannot throw.
                const text = typeof sourceCode === "string" && fixTarget.range
                  ? sourceCode.slice(fixTarget.range[0], fixTarget.range[1])
                  : sourceCode?.getText?.(fixTarget);
                if (!text) return null;
                // The properties-only overload needs the "{*}" message inserted
                // so the lazy callback is still read as properties.
                return fixer.replaceText(
                  fixTarget,
                  propertiesOnly ? `"{*}", () => (${text})` : `() => (${text})`,
                );
              },
            });
          },
        };
      },
    },

    /** Require await on log calls that use async lazy callbacks. */
    "no-unawaited-log": {
      create(ctx: any) {
        const scope = makeLoggerScope();
        return {
          ...scope.visitors,
          CallExpression(node: any) {
            if (!scope.isLogtapeCallee(node.callee)) return;
            const methodName = logMethodName(node.callee);
            if (!methodName || !LOG_METHODS.has(methodName)) return;
            const secondArg = unwrapTypeAssertion(node.arguments?.[1]);
            if (!secondArg) return;
            const isAsyncCallback = isAsyncFunctionExpr(secondArg) ||
              isPromiseReturningCallback(secondArg) ||
              (secondArg.type === "Identifier" &&
                scope.isAsyncFunctionName(secondArg.name));
            if (!isAsyncCallback) return;
            // Walk the ancestor chain to check if the promise is handled
            // (awaited, returned, chained with .then(), or in Promise.all()).
            if (isLogPromiseHandled(node)) return;
            ctx.report({
              node,
              message:
                "Async lazy callbacks must be awaited to ensure the log is flushed: " +
                'await logger.debug("msg", async () => ({ ... })).',
              // Only autofix a standalone statement.  Inserting `await` where
              // the call's value is used would change a Promise<void> into void
              // and can break code that uses that promise.
              fix: canInsertAwait(node)
                ? (fixer: any) => fixer.insertTextBefore(node, "await ")
                : undefined,
            });
          },
        };
      },
    },

    /** Require a meta sink in configure() / configureSync() calls. */
    "require-meta-sink": {
      create(ctx: any) {
        const configFns = new Set<string>();
        // Tracks scopes where a configure/configureSync name is shadowed
        const shadowedConfigScopes: Array<Set<string>> = [new Set()];

        function pushConfigScope() {
          shadowedConfigScopes.push(new Set());
        }

        function popConfigScope() {
          if (shadowedConfigScopes.length > 1) shadowedConfigScopes.pop();
        }

        function isConfigShadowed(name: string): boolean {
          for (let i = shadowedConfigScopes.length - 1; i >= 0; i--) {
            if (shadowedConfigScopes[i].has(name)) return true;
          }
          return false;
        }

        function handleFnEnter(node: any) {
          // A named function declaration binds its name in the ENCLOSING scope,
          // so a local `function configure()` shadows the import; record that
          // before pushing the new scope.
          if (
            node.type === "FunctionDeclaration" &&
            node.id?.type === "Identifier" &&
            configFns.has(node.id.name)
          ) {
            shadowedConfigScopes[shadowedConfigScopes.length - 1].add(
              node.id.name,
            );
          }
          pushConfigScope();
          const names = new Set<string>();
          // A named function expression binds its own name inside its body,
          // shadowing an imported configure/configureSync of the same name.
          if (
            node.type === "FunctionExpression" && node.id?.type === "Identifier"
          ) {
            names.add(node.id.name);
          }
          for (const param of node.params ?? []) {
            extractIdentifiers(param, names);
          }
          for (const name of names) {
            if (configFns.has(name)) {
              shadowedConfigScopes[shadowedConfigScopes.length - 1].add(name);
            }
          }
        }

        // Function declarations are hoisted to the top of their block, so a
        // local `function configure() {}` shadows the import for the whole
        // block, including earlier statements.  Pre-scan the block's direct
        // statements on entry and record those shadows first.
        //
        // The name is recorded unconditionally rather than gated on configFns:
        // this handler also runs for the Program node, which is entered before
        // the top-level ImportDeclaration populates configFns, so gating would
        // miss a top-level shadow.  Recording extra names is harmless because
        // isConfigShadowed is only consulted for names already known to be
        // imported configure/configureSync, and each name is scoped to its
        // block via push/popConfigScope.
        function handleBlockEnter(node: any) {
          pushConfigScope();
          for (const stmt of node.body ?? []) {
            if (
              stmt?.type === "FunctionDeclaration" &&
              stmt.id?.type === "Identifier"
            ) {
              shadowedConfigScopes[shadowedConfigScopes.length - 1].add(
                stmt.id.name,
              );
            }
          }
        }

        // A catch parameter named like an imported configure function shadows
        // it within the catch scope, so record it before visiting the body.
        function handleCatchEnter(node: any) {
          pushConfigScope();
          if (!node.param) return;
          const names = new Set<string>();
          extractIdentifiers(node.param, names);
          for (const name of names) {
            if (configFns.has(name)) {
              shadowedConfigScopes[shadowedConfigScopes.length - 1].add(name);
            }
          }
        }

        return {
          ImportDeclaration(node: any) {
            if (!isLogtapeImportSource(node.source?.value)) return;
            for (const specifier of node.specifiers ?? []) {
              if (specifier.type !== "ImportSpecifier") continue;
              const imported = specifier.imported?.name;
              if (
                imported === "configure" || imported === "configureSync"
              ) {
                configFns.add(specifier.local?.name);
              }
            }
          },
          FunctionDeclaration: handleFnEnter,
          "FunctionDeclaration:exit": popConfigScope,
          FunctionExpression: handleFnEnter,
          "FunctionExpression:exit": popConfigScope,
          ArrowFunctionExpression: handleFnEnter,
          "ArrowFunctionExpression:exit": popConfigScope,
          // Program is pre-scanned too so a top-level `function configure()`
          // declared below its call still shadows the import.
          Program: handleBlockEnter,
          "Program:exit": popConfigScope,
          BlockStatement: handleBlockEnter,
          "BlockStatement:exit": popConfigScope,
          // A TypeScript namespace body (TSModuleBlock) is a lexical scope
          // whose statements are not wrapped in a block statement.  A class
          // static block needs no separate handling: its body is itself a
          // BlockStatement, already covered above.
          TSModuleBlock: handleBlockEnter,
          "TSModuleBlock:exit": popConfigScope,
          // A switch block is a single lexical scope for its let/const
          // declarations, so push/pop one for it like a block.
          SwitchStatement: pushConfigScope,
          "SwitchStatement:exit": popConfigScope,
          CatchClause: handleCatchEnter,
          "CatchClause:exit": popConfigScope,
          VariableDeclarator(node: any) {
            // A local declaration shadows any imported configure/configureSync
            // with the same name, so we must not flag it as a LogTape call.
            const names = new Set<string>();
            extractIdentifiers(node.id, names);
            for (const name of names) {
              if (configFns.has(name)) {
                shadowedConfigScopes[shadowedConfigScopes.length - 1].add(name);
              }
            }
          },
          CallExpression(node: any) {
            if (configFns.size === 0) return;
            const { callee } = node;
            const calleeName = callee.type === "Identifier"
              ? callee.name
              : null;
            if (!calleeName || !configFns.has(calleeName)) return;
            if (isConfigShadowed(calleeName)) return;
            // Unwrap a TypeScript type assertion (e.g. configure({ ... } as T)).
            const configArg = unwrapTypeAssertion(node.arguments?.[0]);
            if (configNeedsMetaSink(configArg)) {
              ctx.report({
                node,
                message:
                  'Add a dedicated sink for the meta logger (category: ["logtape"] or ["logtape", "meta"]) ' +
                  "to handle LogTape's own diagnostic messages.",
              });
            }
          },
        };
      },
    },
  },
};

export default logtapePlugin;
