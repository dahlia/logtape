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
 * Use `jsr:@logtape/lint/deno/strict` instead to enable the opt-in
 * `logtape/no-dynamic-message` rule.
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
  classifyLogArgumentSyntax,
  classifyTypeAnnotation,
  configNeedsMetaSink,
  containsAwaitOrYield,
  ERROR_LOG_METHODS,
  isAsyncFunctionExpr,
  isLogPromiseHandled,
  isLogtapeImportSource,
  isMutableArrayLiteral,
  isPromiseReturningCallback,
  LOG_METHODS,
  type LogArgumentClassificationContext,
  type LogArgumentKind,
  logMethodName,
  messageAccessReceiver,
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

function nodeRangeKey(node: any): string | null {
  const start = node?.range?.[0];
  const end = node?.range?.[1];
  return typeof start === "number" && typeof end === "number"
    ? `${start}:${end}`
    : null;
}

function collectParameterDefaultRanges(node: any, ranges: Set<string>): void {
  if (!node) return;
  if (node.type === "AssignmentPattern") {
    const key = nodeRangeKey(node);
    if (key != null) ranges.add(key);
    collectParameterDefaultRanges(node.left, ranges);
  } else if (node.type === "TSParameterProperty") {
    collectParameterDefaultRanges(node.parameter, ranges);
  } else if (node.type === "ObjectPattern") {
    for (const property of node.properties ?? []) {
      collectParameterDefaultRanges(
        property.type === "Property" ? property.value : property.argument,
        ranges,
      );
    }
  } else if (node.type === "ArrayPattern") {
    for (const element of node.elements ?? []) {
      collectParameterDefaultRanges(element, ranges);
    }
  } else if (node.type === "RestElement") {
    collectParameterDefaultRanges(node.argument, ranges);
  }
}

function collectVarBindings(node: any, names: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectVarBindings(child, names);
    return;
  }
  if (node.type === "VariableDeclaration" && node.kind === "var") {
    for (const declaration of node.declarations ?? []) {
      extractIdentifiers(declaration.id, names);
    }
    return;
  }
  switch (node.type) {
    case "Program":
    case "BlockStatement":
    case "TSModuleBlock":
      collectVarBindings(node.body, names);
      break;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
      collectVarBindings(node.declaration, names);
      break;
    case "IfStatement":
      collectVarBindings(node.consequent, names);
      collectVarBindings(node.alternate, names);
      break;
    case "ForStatement":
      collectVarBindings(node.init, names);
      collectVarBindings(node.body, names);
      break;
    case "ForInStatement":
    case "ForOfStatement":
      collectVarBindings(node.left, names);
      collectVarBindings(node.body, names);
      break;
    case "WhileStatement":
    case "DoWhileStatement":
    case "LabeledStatement":
    case "WithStatement":
      collectVarBindings(node.body, names);
      break;
    case "SwitchStatement":
      for (const switchCase of node.cases ?? []) {
        collectVarBindings(switchCase.consequent, names);
      }
      break;
    case "TryStatement":
      collectVarBindings(node.block, names);
      collectVarBindings(node.handler?.body, names);
      collectVarBindings(node.finalizer, names);
      break;
  }
}

function classTypeParameterNames(node: any, sourceText: string): string[] {
  const parameters = node?.typeParameters?.params ?? [];
  if (parameters.length > 0) {
    return parameters.flatMap((parameter: any) => {
      const name = typeof parameter.name === "string"
        ? parameter.name
        : parameter.name?.name;
      return typeof name === "string" ? [name] : [];
    });
  }

  // Deno's serialized lint AST currently omits `typeParameters` from class
  // declarations.  Recover the leading declaration from the source slice
  // after the class name.  Anonymous default classes can start with modifiers
  // or decorators, so locate the actual `class` token.  Class expressions
  // expose the field above.
  if (node?.type !== "ClassDeclaration") return [];
  const declarationStart = node.range?.[0];
  const end = node.range?.[1];
  const start = node.id?.range?.[1] ??
    (typeof declarationStart === "number" && typeof end === "number"
      ? findAnonymousClassKeywordEnd(sourceText, declarationStart, end)
      : undefined);
  if (typeof start !== "number" || typeof end !== "number") return [];
  return parseLeadingTypeParameterNames(sourceText.slice(start, end));
}

function findAnonymousClassKeywordEnd(
  source: string,
  start: number,
  end: number,
): number | undefined {
  let index = start;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let previousToken: string | undefined;

  while (index < end) {
    index = skipTypeTrivia(source, index);
    if (index >= end) break;
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuotedTypeText(source, index, char);
      previousToken = "literal";
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/.exec(source.slice(index, end));
    if (identifier) {
      const tokenEnd = index + identifier[0].length;
      const next = skipTypeTrivia(source, tokenEnd);
      if (
        identifier[0] === "class" && braceDepth === 0 &&
        bracketDepth === 0 && parenDepth === 0 &&
        previousToken !== "." &&
        source[next] === "<"
      ) {
        return tokenEnd;
      }
      previousToken = identifier[0];
      index = tokenEnd;
      continue;
    }
    if (char === "{") braceDepth++;
    else if (char === "}") braceDepth--;
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth--;
    else if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    previousToken = char;
    index++;
  }
  return undefined;
}

function parseLeadingTypeParameterNames(source: string): string[] {
  let index = skipTypeTrivia(source, 0);
  if (source[index] !== "<") return [];
  index++;

  const names: string[] = [];
  let angleDepth = 1;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let needsName = true;

  while (index < source.length && angleDepth > 0) {
    if (needsName) {
      index = skipTypeTrivia(source, index);
      let match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
      while (match && ["const", "in", "out"].includes(match[0])) {
        index = skipTypeTrivia(source, index + match[0].length);
        match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
      }
      if (!match) return names;
      names.push(match[0]);
      index += match[0].length;
      needsName = false;
      continue;
    }

    const next = skipTypeTrivia(source, index);
    if (next !== index) {
      index = next;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuotedTypeText(source, index, char);
      continue;
    }
    if (char === "{") braceDepth++;
    else if (char === "}") braceDepth--;
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth--;
    else if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "<") angleDepth++;
    else if (char === ">" && source[index - 1] !== "=") {
      angleDepth--;
    } else if (
      char === "," && angleDepth === 1 && braceDepth === 0 &&
      bracketDepth === 0 && parenDepth === 0
    ) {
      needsName = true;
    }
    index++;
  }
  return names;
}

function constInferenceDependencyName(
  node: any,
  depth = 0,
): string | null {
  if (!node || depth > 16) return null;
  node = unwrapTypeAssertion(node);
  if (node.type === "Identifier") return node.name ?? null;
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property?.type === "Identifier" &&
    (node.callee.property.name === "with" ||
      node.callee.property.name === "getChild")
  ) {
    return constInferenceDependencyName(node.callee.object, depth + 1);
  }
  return null;
}

function skipTypeTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index++;
    } else if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline < 0 ? source.length : newline + 1;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
    } else {
      break;
    }
  }
  return index;
}

function skipQuotedTypeText(
  source: string,
  start: number,
  quote: string,
): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") index += 2;
    else if (source[index++] === quote) break;
  }
  return index;
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
function makeLoggerScope(sourceText = ""): {
  visitors: Record<string, (node: any) => void>;
  isLogtapeCallee: (callee: any) => boolean;
  isAsyncFunctionName: (name: string) => boolean;
  lazyNames: Set<string>;
  effectiveLazyNames: () => Set<string>;
  classifyLogArgument: (argument: any) => LogArgumentKind;
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
  // Per-scope first-argument classifications used by no-dynamic-message.
  // Unknown entries are retained so a local rebinding cannot leak a safe
  // classification from an outer scope.
  const argumentKindStack: Array<Map<string, LogArgumentKind>> = [new Map()];
  const typeShadowStack: Array<Set<string>> = [new Set()];
  const valueShadowStack: Array<Set<string>> = [new Set()];
  const varScopeIndices: number[] = [0];
  const variableDeclarationKindStack: string[] = [];
  const functionScopeStack: Array<{
    body: any;
    bodyScopeIndex: number | null;
    defaultRanges: Set<string>;
    activeDefaultCount: number;
    separateBodyScope: boolean;
  }> = [];
  const functionBodyBlockStack: Array<
    (typeof functionScopeStack)[number] | null
  > = [];
  const parameterDefaultStack: Array<
    (typeof functionScopeStack)[number] | null
  > = [];
  const switchScopeStack: Array<{ node: any; active: boolean }> = [];

  function pushScope() {
    scopeStack.push(new Map());
    shadowedGetterStack.push(new Set());
    shadowedLazyStack.push(new Set());
    asyncFnStack.push(new Map());
    argumentKindStack.push(new Map());
    typeShadowStack.push(new Set());
    valueShadowStack.push(new Set());
  }

  function popScope() {
    if (scopeStack.length > 1) scopeStack.pop();
    if (shadowedGetterStack.length > 1) shadowedGetterStack.pop();
    if (shadowedLazyStack.length > 1) shadowedLazyStack.pop();
    if (asyncFnStack.length > 1) asyncFnStack.pop();
    if (argumentKindStack.length > 1) argumentKindStack.pop();
    if (typeShadowStack.length > 1) typeShadowStack.pop();
    if (valueShadowStack.length > 1) valueShadowStack.pop();
  }

  function isScopeVisible(index: number): boolean {
    return !functionScopeStack.some((state) =>
      state.activeDefaultCount > 0 && state.bodyScopeIndex === index
    );
  }

  function isLoggerName(name: string): boolean {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (!isScopeVisible(i)) continue;
      if (scopeStack[i].has(name)) return scopeStack[i].get(name)!;
    }
    return false;
  }

  // Whether `name` resolves to a binding that yields a promise (an async
  // function or a non-async promise-returning one) in the current scope chain.
  function isAsyncFunctionName(name: string): boolean {
    for (let i = asyncFnStack.length - 1; i >= 0; i--) {
      if (!isScopeVisible(i)) continue;
      if (asyncFnStack[i].has(name)) return asyncFnStack[i].get(name)!;
    }
    return false;
  }

  function argumentKind(name: string): LogArgumentKind {
    for (let i = argumentKindStack.length - 1; i >= 0; i--) {
      if (!isScopeVisible(i)) continue;
      if (argumentKindStack[i].has(name)) {
        return argumentKindStack[i].get(name)!;
      }
    }
    return "unknown";
  }

  function isShadowed(stack: Array<Set<string>>, name: string): boolean {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!isScopeVisible(i)) continue;
      if (stack[i].has(name)) return true;
    }
    return false;
  }

  const classificationContext: LogArgumentClassificationContext = {
    isBuiltinTypeName: (name: string) => !isShadowed(typeShadowStack, name),
    isBuiltinValueName: (name: string) => !isShadowed(valueShadowStack, name),
  };

  function classifyLogArgument(node: any): LogArgumentKind {
    if (
      node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion" ||
      node?.type === "TSSatisfiesExpression"
    ) {
      const expression = classifyLogArgument(node.expression);
      return expression !== "unknown"
        ? expression
        : classifyTypeAnnotation(node.typeAnnotation, classificationContext);
    }
    if (node?.type === "TSNonNullExpression") {
      return classifyLogArgument(node.expression);
    }
    const direct = classifyLogArgumentSyntax(node, classificationContext);
    if (direct !== "unknown") return direct;
    return node?.type === "Identifier" ? argumentKind(node.name) : "unknown";
  }

  function classifyConstInitializer(node: any): LogArgumentKind {
    return isMutableArrayLiteral(node)
      ? "dynamic-message"
      : classifyLogArgument(node);
  }

  function annotationKind(node: any): LogArgumentKind {
    if (node?.type === "AssignmentPattern") {
      return annotationKind(node.left);
    }
    if (node?.type === "TSParameterProperty") {
      return annotationKind(node.parameter);
    }
    return classifyTypeAnnotation(node?.typeAnnotation, classificationContext);
  }

  function parameterIdentifier(node: any): any | null {
    while (
      node?.type === "AssignmentPattern" ||
      node?.type === "TSParameterProperty"
    ) {
      node = node.type === "AssignmentPattern" ? node.left : node.parameter;
    }
    return node?.type === "Identifier" ? node : null;
  }

  function isGetterShadowed(name: string): boolean {
    return isShadowed(shadowedGetterStack, name);
  }

  function isLazyShadowed(name: string): boolean {
    return isShadowed(shadowedLazyStack, name);
  }

  // Record that `name`, a local binding in the current scope, shadows the
  // imported getLogger and/or lazy.  Names are recorded unconditionally rather
  // than gated on getterNames/lazyNames: this also runs during the Program
  // pre-scan, before the ImportDeclaration visitor has populated those sets, so
  // gating would miss a top-level shadow.  Recording extra names is harmless,
  // since the stacks are only ever queried for the imported getLogger/lazy
  // names.
  function recordImportShadowAt(name: string, index: number) {
    shadowedGetterStack[index].add(name);
    shadowedLazyStack[index].add(name);
  }

  function recordImportShadow(name: string) {
    recordImportShadowAt(name, shadowedGetterStack.length - 1);
  }

  function predeclareValue(name: string, index: number): void {
    valueShadowStack[index].add(name);
    scopeStack[index].set(name, false);
    recordImportShadowAt(name, index);
    asyncFnStack[index].set(name, false);
    argumentKindStack[index].set(name, "unknown");
  }

  function predeclareType(name: string, index: number): void {
    typeShadowStack[index].add(name);
  }

  function predeclareFunction(node: any, index: number): void {
    const name = node.id?.name;
    if (typeof name !== "string") return;
    predeclareValue(name, index);
    asyncFnStack[index].set(
      name,
      node.async === true || isPromiseReturningCallback(node),
    );
    argumentKindStack[index].set(name, "callback");
  }

  function recordLogtapeImports(node: any): void {
    if (!isLogtapeImportSource(node.source?.value)) return;
    for (const specifier of node.specifiers ?? []) {
      if (specifier.type !== "ImportSpecifier") continue;
      if (specifier.imported?.name === "getLogger") {
        getterNames.add(specifier.local?.name);
      } else if (specifier.imported?.name === "lazy") {
        lazyNames.add(specifier.local?.name);
      }
    }
  }

  function predeclareStatements(statements: any[]): void {
    const index = argumentKindStack.length - 1;
    const constDeclarations: any[] = [];
    for (const statement of statements ?? []) {
      const node = statement?.declaration ?? statement;
      if (!node) continue;
      if (
        node.type === "FunctionDeclaration" ||
        node.type === "TSDeclareFunction"
      ) {
        predeclareFunction(node, index);
      } else if (
        node.type === "VariableDeclaration" && node.kind !== "var"
      ) {
        for (const declaration of node.declarations ?? []) {
          const names = new Set<string>();
          extractIdentifiers(declaration.id, names);
          for (const name of names) predeclareValue(name, index);
          if (node.kind === "const" && declaration.id?.type === "Identifier") {
            constDeclarations.push(declaration);
          }
        }
      } else if (node.type === "ClassDeclaration") {
        const name = node.id?.name;
        if (typeof name === "string") {
          predeclareValue(name, index);
          predeclareType(name, index);
        }
      } else if (
        node.type === "TSTypeAliasDeclaration" ||
        node.type === "TSInterfaceDeclaration"
      ) {
        const name = node.id?.name;
        if (typeof name === "string") predeclareType(name, index);
      } else if (node.type === "TSEnumDeclaration") {
        const name = node.id?.name;
        if (typeof name === "string") {
          predeclareValue(name, index);
          predeclareType(name, index);
        }
      } else if (node.type === "ImportDeclaration") {
        recordLogtapeImports(node);
        for (const specifier of node.specifiers ?? []) {
          const name = specifier.local?.name;
          if (typeof name !== "string") continue;
          typeShadowStack[index].add(name);
          if (
            node.importKind !== "type" && specifier.importKind !== "type"
          ) {
            valueShadowStack[index].add(name);
          }
        }
      } else if (node.type === "TSImportEqualsDeclaration") {
        const name = node.id?.name;
        if (typeof name !== "string") continue;
        typeShadowStack[index].add(name);
        if (node.importKind !== "type" && node.isTypeOnly !== true) {
          predeclareValue(name, index);
        }
      }
    }

    // Closures are visited before later declarations, so classify immutable
    // initializers during the pre-scan.  Revisit only declarations that depend
    // on a newly classified alias, keeping forward chains linear while leaving
    // cycles and dynamic initializers unknown.
    const dependents = new Map<string, any[]>();
    for (const declaration of constDeclarations) {
      const dependency = constInferenceDependencyName(declaration.init);
      if (dependency == null) continue;
      const declarations = dependents.get(dependency) ?? [];
      declarations.push(declaration);
      dependents.set(dependency, declarations);
    }
    const queue = [...constDeclarations];
    const queued = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const declaration = queue[cursor];
      queued.delete(declaration);
      const name = declaration.id.name;
      let changed = false;
      if (
        isLoggerExpr(declaration.init) &&
        scopeStack[index].get(name) !== true
      ) {
        scopeStack[index].set(name, true);
        changed = true;
      }
      const initialized = classifyConstInitializer(declaration.init);
      const annotated = annotationKind(declaration.id);
      const inferred = initialized !== "unknown" ? initialized : annotated;
      if (
        inferred !== "unknown" &&
        argumentKindStack[index].get(name) !== inferred
      ) {
        argumentKindStack[index].set(name, inferred);
        changed = true;
      }
      if (!changed) continue;
      for (const dependent of dependents.get(name) ?? []) {
        if (queued.has(dependent)) continue;
        queue.push(dependent);
        queued.add(dependent);
      }
    }
  }

  function predeclareVars(node: any): void {
    const names = new Set<string>();
    collectVarBindings(node, names);
    const index = varScopeIndices[varScopeIndices.length - 1];
    for (const name of names) predeclareValue(name, index);
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
      predeclareFunction(node, argumentKindStack.length - 1);
    }
    pushScope();
    const defaultRanges = new Set<string>();
    for (const parameter of node.params ?? []) {
      collectParameterDefaultRanges(parameter, defaultRanges);
    }
    const functionState = {
      body: node.body,
      bodyScopeIndex: null,
      defaultRanges,
      activeDefaultCount: 0,
      separateBodyScope: defaultRanges.size > 0,
    };
    functionScopeStack.push(functionState);
    if (!functionState.separateBodyScope) {
      varScopeIndices.push(argumentKindStack.length - 1);
      predeclareVars(node.body);
    }
    for (const parameter of node.typeParameters?.params ?? []) {
      const name = typeof parameter.name === "string"
        ? parameter.name
        : parameter.name?.name;
      if (typeof name === "string") {
        predeclareType(name, typeShadowStack.length - 1);
      }
    }
    const names = new Set<string>();
    const parameterKinds = new Map<string, LogArgumentKind>();
    // A named function expression binds its own name inside its body, shadowing
    // any outer binding of that name (a logger, getLogger, etc.).
    if (node.type === "FunctionExpression" && node.id?.type === "Identifier") {
      names.add(node.id.name);
      valueShadowStack[valueShadowStack.length - 1].add(node.id.name);
      argumentKindStack[argumentKindStack.length - 1].set(
        node.id.name,
        "callback",
      );
    }
    for (const param of node.params ?? []) {
      const parameterNames = new Set<string>();
      extractIdentifiers(param, parameterNames);
      const kind = parameterIdentifier(param) == null
        ? "unknown"
        : annotationKind(param);
      for (const name of parameterNames) {
        names.add(name);
        parameterKinds.set(name, kind);
      }
    }
    for (const name of names) {
      valueShadowStack[valueShadowStack.length - 1].add(name);
      scopeStack[scopeStack.length - 1].set(name, false);
      recordImportShadow(name);
      // A parameter rebinds the name, shadowing any outer async-callback
      // binding so it does not leak into the function body.
      asyncFnStack[asyncFnStack.length - 1].set(name, false);
      argumentKindStack[argumentKindStack.length - 1].set(
        name,
        parameterKinds.get(name) ?? "callback",
      );
    }
  }

  function handleFunctionExit(): void {
    const functionState = functionScopeStack.pop();
    if (
      functionState?.separateBodyScope === false &&
      varScopeIndices.length > 1
    ) {
      varScopeIndices.pop();
    }
    popScope();
  }

  function handleAssignmentPatternEnter(node: any): void {
    const key = nodeRangeKey(node);
    let matchingState = null;
    if (key != null) {
      for (let i = functionScopeStack.length - 1; i >= 0; i--) {
        if (functionScopeStack[i].defaultRanges.has(key)) {
          matchingState = functionScopeStack[i];
          matchingState.activeDefaultCount++;
          break;
        }
      }
    }
    parameterDefaultStack.push(matchingState);
  }

  function handleAssignmentPatternExit(): void {
    const state = parameterDefaultStack.pop();
    if (state != null) state.activeDefaultCount--;
  }

  function handleClassBodyEnter(node: any): void {
    pushScope();
    const index = typeShadowStack.length - 1;
    const classNode = node.parent;
    if (
      classNode?.type === "ClassExpression" &&
      classNode.id?.type === "Identifier"
    ) {
      predeclareValue(classNode.id.name, index);
      predeclareType(classNode.id.name, index);
    }
    for (const name of classTypeParameterNames(classNode, sourceText)) {
      predeclareType(name, index);
    }
  }

  // Function declarations are hoisted to the top of their block, so a local
  // `function getLogger() {}` shadows the import for the whole block, including
  // statements that appear before it.  Pre-scan the block's direct statements
  // on entry and record those shadows before any statement is visited.
  function handleBlockEnter(node: any): void {
    const functionState = functionScopeStack[functionScopeStack.length - 1];
    const isFunctionBody = functionState?.separateBodyScope === true &&
      functionState.body === node;
    pushScope();
    functionBodyBlockStack.push(isFunctionBody ? functionState : null);
    if (isFunctionBody) {
      varScopeIndices.push(argumentKindStack.length - 1);
      functionState.bodyScopeIndex = argumentKindStack.length - 1;
      predeclareVars(node);
    }
    predeclareStatements(node.body ?? []);
  }

  function handleBlockExit(): void {
    const functionState = functionBodyBlockStack.pop();
    if (functionState != null && varScopeIndices.length > 1) {
      varScopeIndices.pop();
      functionState.bodyScopeIndex = null;
    }
    popScope();
  }

  function handleVarScopedBlockEnter(node: any): void {
    pushScope();
    varScopeIndices.push(argumentKindStack.length - 1);
    const body = Array.isArray(node.body) ? node.body : node.body?.body ?? [];
    predeclareStatements(body);
    predeclareVars(node.body);
  }

  function handleVarScopedBlockExit(): void {
    if (varScopeIndices.length > 1) varScopeIndices.pop();
    popScope();
  }

  function handleProgramEnter(node: any): void {
    pushScope();
    varScopeIndices.push(argumentKindStack.length - 1);
    predeclareStatements(node.body ?? []);
    predeclareVars(node);
  }

  function handleProgramExit(): void {
    if (varScopeIndices.length > 1) varScopeIndices.pop();
    popScope();
  }

  function handleSwitchEnter(node: any): void {
    switchScopeStack.push({ node, active: false });
  }

  function handleSwitchCaseEnter(): void {
    const state = switchScopeStack[switchScopeStack.length - 1];
    if (!state || state.active) return;
    pushScope();
    const statements: any[] = [];
    for (const switchCase of state.node.cases ?? []) {
      statements.push(...(switchCase.consequent ?? []));
    }
    predeclareStatements(statements);
    state.active = true;
  }

  function handleSwitchExit(): void {
    const state = switchScopeStack.pop();
    if (state?.active) popScope();
  }

  function handleForEnter(node: any): void {
    pushScope();
    const declaration = node.type === "ForStatement" ? node.init : node.left;
    if (declaration?.type === "VariableDeclaration") {
      predeclareStatements([declaration]);
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
      valueShadowStack[valueShadowStack.length - 1].add(name);
      scopeStack[scopeStack.length - 1].set(name, false);
      recordImportShadow(name);
      // A catch parameter rebinds the name, shadowing any outer async binding.
      asyncFnStack[asyncFnStack.length - 1].set(name, false);
      argumentKindStack[argumentKindStack.length - 1].set(name, "unknown");
    }
  }

  // Is `node` an expression that evaluates to a LogTape logger?  Handles
  // direct getLogger(...) calls (unless the getter name is shadowed),
  // identifiers already bound to a logger in scope, and contextual or child
  // loggers produced by chaining Logger.with(...) or Logger.getChild(...).
  function isLoggerExpr(node: any, depth = 0): boolean {
    if (depth > 16 || !node) return false;
    node = unwrapTypeAssertion(node);
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
        recordLogtapeImports(node);
      },
      VariableDeclaration(node: any) {
        variableDeclarationKindStack.push(node.kind);
      },
      "VariableDeclaration:exit"() {
        variableDeclarationKindStack.pop();
      },
      VariableDeclarator(node: any) {
        // Deno 2.2 exposes a numeric parent reference instead of the enclosing
        // VariableDeclaration node, so recover its kind from the visitor stack.
        const declarationKind = node.parent?.kind ??
          variableDeclarationKindStack[variableDeclarationKindStack.length - 1];
        const targetIndex = declarationKind === "var"
          ? varScopeIndices[varScopeIndices.length - 1]
          : argumentKindStack.length - 1;
        if (node.id?.type === "Identifier") {
          const name = node.id.name;
          const init = node.init;
          const isLogger = isLoggerExpr(init);
          valueShadowStack[targetIndex].add(name);
          scopeStack[targetIndex].set(name, isLogger);
          // A local declaration shadows an imported getLogger or lazy, so a
          // later inline getLogger()/lazy() in this scope is the local binding,
          // not the import.
          recordImportShadowAt(name, targetIndex);
          // Record whether this local is bound to a function literal that
          // yields a promise (async, or non-async but promise-returning) so a
          // lazy callback passed by reference is detected; any other binding
          // shadows an outer promise-callback binding of the same name.
          asyncFnStack[targetIndex].set(
            name,
            isAsyncFunctionExpr(init) || isPromiseReturningCallback(init),
          );
          const annotated = annotationKind(node.id);
          const initialized = declarationKind === "const"
            ? classifyConstInitializer(init)
            : "unknown";
          const inferred = initialized !== "unknown" ? initialized : annotated;
          argumentKindStack[targetIndex].set(name, inferred);
        } else {
          // Destructured declaration (e.g. const { logger } = obj): shadow any
          // matching names to avoid false positives.
          const names = new Set<string>();
          extractIdentifiers(node.id, names);
          for (const name of names) {
            valueShadowStack[targetIndex].add(name);
            scopeStack[targetIndex].set(name, false);
            // A destructured getLogger/lazy name is likewise a local,
            // non-import binding.
            recordImportShadowAt(name, targetIndex);
            // A destructured binding is not a known async function and shadows
            // any outer async binding of the same name.
            asyncFnStack[targetIndex].set(name, false);
            argumentKindStack[targetIndex].set(
              name,
              "unknown",
            );
          }
        }
      },
      FunctionDeclaration: handleFunctionEnter,
      "FunctionDeclaration:exit": handleFunctionExit,
      FunctionExpression: handleFunctionEnter,
      "FunctionExpression:exit": handleFunctionExit,
      ArrowFunctionExpression: handleFunctionEnter,
      "ArrowFunctionExpression:exit": handleFunctionExit,
      AssignmentPattern: handleAssignmentPatternEnter,
      "AssignmentPattern:exit": handleAssignmentPatternExit,
      ClassBody: handleClassBodyEnter,
      "ClassBody:exit": popScope,
      // Program is a block-like scope: pre-scan it too so a top-level function
      // declared below a callback that references it is still hoisted.
      Program: handleProgramEnter,
      "Program:exit": handleProgramExit,
      BlockStatement: handleBlockEnter,
      "BlockStatement:exit": handleBlockExit,
      // TypeScript namespace bodies and class static blocks contain `var`
      // bindings that must not escape into the surrounding function or
      // program scope.
      TSModuleBlock: handleVarScopedBlockEnter,
      "TSModuleBlock:exit": handleVarScopedBlockExit,
      StaticBlock: handleVarScopedBlockEnter,
      "StaticBlock:exit": handleVarScopedBlockExit,
      ForStatement: handleForEnter,
      "ForStatement:exit": popScope,
      ForInStatement: handleForEnter,
      "ForInStatement:exit": popScope,
      ForOfStatement: handleForEnter,
      "ForOfStatement:exit": popScope,
      // A switch block is a single lexical scope for its let/const
      // declarations.  Its discriminant is evaluated outside that scope, so
      // activate the shared case scope only after entering the first case.
      SwitchStatement: handleSwitchEnter,
      SwitchCase: handleSwitchCaseEnter,
      "SwitchStatement:exit": handleSwitchExit,
      CatchClause: handleCatchEnter,
      "CatchClause:exit": popScope,
    },
    isLogtapeCallee,
    isAsyncFunctionName,
    lazyNames,
    effectiveLazyNames,
    classifyLogArgument,
  };
}

/**
 * Deno Lint plugin providing LogTape lint rules.
 *
 * > [!WARNING]
 * > The Deno Lint plugin API is experimental.  This plugin may break between
 * > Deno releases while the API is stabilised.
 */
export const strictPlugin: {
  name: string;
  rules: Record<string, unknown>;
} = {
  name: "logtape",

  rules: {
    /** Disallow dynamic expressions in log message arguments. */
    "no-dynamic-message": {
      create(ctx: any) {
        const scope = makeLoggerScope(ctx.sourceCode?.text ?? "");
        return {
          ...scope.visitors,
          CallExpression(node: any) {
            if (!scope.isLogtapeCallee(node.callee)) return;
            const methodName = logMethodName(node.callee);
            if (!methodName || !LOG_METHODS.has(methodName)) return;
            const firstArg = node.arguments?.[0];
            if (!firstArg) return;

            const direct = classifyLogArgumentSyntax(firstArg);
            if (direct === "interpolated-message") return;
            const kind = scope.classifyLogArgument(firstArg);
            if (
              kind === "static-message" || kind === "properties" ||
              kind === "callback" || kind === "non-message" ||
              (kind === "error" && ERROR_LOG_METHODS.has(methodName))
            ) return;

            const messageReceiver = ERROR_LOG_METHODS.has(methodName)
              ? messageAccessReceiver(firstArg)
              : null;
            const passError = messageReceiver != null &&
              scope.classifyLogArgument(messageReceiver) === "error";

            ctx.report({
              node: firstArg,
              message: passError
                ? "Pass the Error object directly instead of its message, or use a static message template with structured properties."
                : "Avoid using a dynamic expression as a log message. Use a static message template with structured properties instead.",
            });
          },
        };
      },
    },

    /** Disallow template literal interpolation in log message arguments. */
    "no-message-interpolation": {
      create(ctx: any) {
        const scope = makeLoggerScope(ctx.sourceCode?.text ?? "");
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
        const scope = makeLoggerScope(ctx.sourceCode?.text ?? "");
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
        const scope = makeLoggerScope(ctx.sourceCode?.text ?? "");
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

const logtapePlugin: { name: string; rules: Record<string, unknown> } = {
  name: strictPlugin.name,
  rules: {
    "no-message-interpolation": strictPlugin.rules["no-message-interpolation"],
    "prefer-lazy-evaluation": strictPlugin.rules["prefer-lazy-evaluation"],
    "no-unawaited-log": strictPlugin.rules["no-unawaited-log"],
    "require-meta-sink": strictPlugin.rules["require-meta-sink"],
  },
};

export default logtapePlugin;
