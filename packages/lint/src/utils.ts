import type { Rule } from "eslint";
import {
  classifyLogArgumentSyntax,
  classifyTypeAnnotation,
  isLogtapeImportSource,
  isMutableArrayLiteral,
  type LogArgumentClassificationContext,
  type LogArgumentKind,
  unwrapTypeAssertion,
} from "./core/ast.ts";

// deno-lint-ignore no-explicit-any
type AnyNode = any;

/**
 * Returns visitor hooks and a scope-aware checker for detecting LogTape log
 * method calls.  Uses ESLint's scope manager to resolve variable bindings,
 * so parameter- and local-variable shadowing are handled correctly.
 *
 * Wire the returned `ImportDeclaration` hook into your rule's visitor object,
 * then call `isLogtapeCall(node.callee, node)` inside `CallExpression`.
 */
export function createLogtapeScope(context: Rule.RuleContext): {
  ImportDeclaration(node: AnyNode): void;
  isLogtapeCall(callee: AnyNode, callNode: AnyNode): boolean;
  lazyNames: Set<string>;
  effectiveLazyNames(callNode: AnyNode): Set<string>;
  classifyLogArgument(argument: AnyNode, callNode: AnyNode): LogArgumentKind;
  resolvedFirstParameterKind(callNode: AnyNode): LogArgumentKind;
} {
  const getterNames = new Set<string>();
  // Local names of `lazy` imported from @logtape/logtape.  A lazy() value is
  // already deferred, so the eager-call rules must not treat it as eager.
  const lazyNames = new Set<string>();

  function resolveVariable(scope: AnyNode, name: string): AnyNode {
    let current = scope;
    while (current) {
      const variable = current.set?.get(name);
      if (variable) return variable;
      current = current.upper;
    }
    return null;
  }

  // Does `name`, resolved from `scope`, refer to the actual imported
  // getLogger (an ImportBinding) rather than a shadow such as a parameter?
  function resolvesToImportedGetter(name: string, scope: AnyNode): boolean {
    if (!getterNames.has(name)) return false;
    const calleeVar = resolveVariable(scope, name);
    return calleeVar?.defs?.some(
      (d: AnyNode) => d.type === "ImportBinding",
    ) ?? false;
  }

  // Is `node` an expression that evaluates to a LogTape logger?  Handles
  // direct getLogger(...) calls, identifiers bound to a logger via a variable
  // declaration, and contextual/child loggers produced by chaining
  // Logger.with(...) or Logger.getChild(...).
  function isLoggerExpression(
    node: AnyNode,
    scope: AnyNode,
    depth = 0,
  ): boolean {
    if (depth > 16 || !node) return false;
    node = unwrapTypeAssertion(node);

    // getLogger(...) — direct call to the imported getter.
    if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
      return resolvesToImportedGetter(node.callee.name, scope);
    }

    // logger.with(...) / logger.getChild(...) — contextual or child loggers,
    // which return a Logger and so are themselves logger expressions.
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property?.type === "Identifier" &&
      (node.callee.property.name === "with" ||
        node.callee.property.name === "getChild")
    ) {
      return isLoggerExpression(node.callee.object, scope, depth + 1);
    }

    // An identifier bound to a logger by a variable declaration.
    if (node.type === "Identifier") {
      const variable = resolveVariable(scope, node.name);
      if (!variable) return false;
      // Parameters have def.type === "Parameter"; only "Variable" defs from
      // VariableDeclarator nodes carry an initializer to inspect.  Resolve the
      // initializer in the variable's declaration scope (variable.scope) so a
      // logger declared in an outer scope is still recognised when a closer
      // scope shadows getLogger.
      return variable.defs?.some((def: AnyNode) => {
        if (def.type !== "Variable") return false;
        return isLoggerExpression(
          def.node?.init,
          variable.scope ?? scope,
          depth + 1,
        );
      }) ?? false;
    }

    return false;
  }

  function isLogtapeCall(callee: AnyNode, callNode: AnyNode): boolean {
    if (!callee || callee.type !== "MemberExpression") return false;

    // Use ESLint's scope manager to resolve variable bindings at the call site.
    const scope =
      // deno-lint-ignore no-explicit-any
      (context as any).sourceCode?.getScope?.(callNode) ??
        // deno-lint-ignore no-explicit-any
        (context as any).getScope?.();

    return isLoggerExpression(callee.object, scope);
  }

  // The subset of lazyNames that, at `callNode`, still resolve to the imported
  // `lazy` rather than a shadowing local binding (e.g. a parameter named
  // `lazy`).  The eager-call rules use this so a shadowed `lazy(...)` is
  // treated as an ordinary eager call, not LogTape's deferred wrapper.
  function effectiveLazyNames(callNode: AnyNode): Set<string> {
    if (lazyNames.size === 0) return lazyNames;
    const scope =
      // deno-lint-ignore no-explicit-any
      (context as any).sourceCode?.getScope?.(callNode) ??
        // deno-lint-ignore no-explicit-any
        (context as any).getScope?.();
    const result = new Set<string>();
    for (const name of lazyNames) {
      const variable = resolveVariable(scope, name);
      const isImport = variable?.defs?.some(
        (d: AnyNode) => d.type === "ImportBinding",
      ) ?? false;
      if (isImport) result.add(name);
    }
    return result;
  }

  function scopeAt(node: AnyNode): AnyNode {
    // deno-lint-ignore no-explicit-any
    return (context as any).sourceCode?.getScope?.(node) ??
      // deno-lint-ignore no-explicit-any
      (context as any).getScope?.();
  }

  function classifyLogArgument(
    argument: AnyNode,
    callNode: AnyNode,
  ): LogArgumentKind {
    return classifyArgumentInScope(
      argument,
      scopeAt(callNode),
      new Set(),
      0,
    );
  }

  function classifyArgumentInScope(
    node: AnyNode,
    scope: AnyNode,
    seen: Set<AnyNode>,
    depth: number,
  ): LogArgumentKind {
    if (!node || depth > 16) return "unknown";
    const context = classificationContext(scope);
    if (
      node.type === "TSAsExpression" || node.type === "TSTypeAssertion" ||
      node.type === "TSSatisfiesExpression"
    ) {
      const expression = classifyArgumentInScope(
        node.expression,
        scope,
        seen,
        depth + 1,
      );
      return expression !== "unknown"
        ? expression
        : classifyTypeAnnotation(node.typeAnnotation, context);
    }
    if (node.type === "TSNonNullExpression") {
      return classifyArgumentInScope(
        node.expression,
        scope,
        seen,
        depth + 1,
      );
    }
    const direct = classifyLogArgumentSyntax(node, context);
    if (direct !== "unknown") return direct;
    if (node.type !== "Identifier") return "unknown";

    const variable = resolveVariable(scope, node.name);
    if (!variable || seen.has(variable)) return "unknown";
    seen.add(variable);

    for (const def of variable.defs ?? []) {
      if (def.type === "FunctionName") return "callback";

      const binding = def.name ?? def.node?.id ?? def.node;
      const declarationContext = classificationContext(
        variable.scope ?? scope,
      );
      const annotated = classifyTypeAnnotation(
        binding?.typeAnnotation,
        declarationContext,
      );
      if (def.type === "Variable") {
        if (def.parent?.kind === "const") {
          const initialized = isMutableArrayLiteral(def.node?.init)
            ? "dynamic-message"
            : classifyArgumentInScope(
              def.node?.init,
              variable.scope ?? scope,
              seen,
              depth + 1,
            );
          if (initialized !== "unknown") return initialized;
        }
        return annotated;
      }
      if (annotated !== "unknown") return annotated;
    }
    return "unknown";
  }

  function classificationContext(
    scope: AnyNode,
  ): LogArgumentClassificationContext {
    return {
      isBuiltinTypeName: (name: string) =>
        isUnshadowedBuiltinName(scope, name, "type"),
      isBuiltinValueName: (name: string) =>
        isUnshadowedBuiltinName(scope, name, "value"),
    };
  }

  function isUnshadowedBuiltinName(
    scope: AnyNode,
    name: string,
    namespace: "type" | "value",
  ): boolean {
    const variable = resolveVariable(scope, name);
    if (!variable || (variable.defs?.length ?? 0) === 0) return true;
    const namespaceFlag = namespace === "type"
      ? variable.isTypeVariable
      : variable.isValueVariable;
    return typeof namespaceFlag === "boolean" ? !namespaceFlag : false;
  }

  function resolvedFirstParameterKind(callNode: AnyNode): LogArgumentKind {
    // Parser services are optional.  ESLint with @typescript-eslint/parser can
    // supply them, while Oxlint and ordinary ESLint parsing currently cannot.
    // deno-lint-ignore no-explicit-any
    const services = (getSourceCode(context) as any)?.parserServices;
    const program = services?.program;
    const nodeMap = services?.esTreeNodeToTSNodeMap;
    if (!program || !nodeMap) return "unknown";
    let argumentKind: LogArgumentKind = "unknown";
    try {
      const tsNode = nodeMap.get(callNode);
      if (!tsNode) return "unknown";
      const checker = program.getTypeChecker();
      const argument = tsNode.arguments?.[0];
      if (!argument) return "unknown";
      const argumentType = checker.getTypeAtLocation(argument);
      argumentKind = classifyCheckedType(
        argumentType,
        checker,
        new Set(),
      );
      if (argumentKind === "unknown") return "unknown";
      // An exact literal argument is stronger evidence than the widened
      // string parameter of the overload selected for it.
      if (argumentKind === "static-message") return argumentKind;
      const signature = checker.getResolvedSignature(tsNode);
      const parameter = signature?.getParameters?.()[0];
      if (!parameter) return argumentKind;
      const type = checker.getTypeOfSymbolAtLocation(parameter, tsNode);
      const parameterKind = classifyCheckedType(type, checker, new Set());
      // A union parameter may combine message and non-message overload shapes.
      // When that makes the signature ambiguous, keep the concrete argument
      // classification that was already proven above.
      return parameterKind === "unknown" ? argumentKind : parameterKind;
    } catch {
      // Type information is an optional enhancement.  An incomplete parser
      // service must preserve any argument type already proven by the checker.
      return argumentKind;
    }
  }

  function recordLogtapeImport(node: AnyNode): void {
    if (!isLogtapeImportSource(node.source?.value)) return;
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== "ImportSpecifier") continue;
      if (spec.imported?.name === "getLogger") {
        getterNames.add(spec.local?.name);
      } else if (spec.imported?.name === "lazy") {
        lazyNames.add(spec.local?.name);
      }
    }
  }

  for (const node of getSourceCode(context)?.ast?.body ?? []) {
    if (node.type === "ImportDeclaration") recordLogtapeImport(node);
  }

  return {
    ImportDeclaration: recordLogtapeImport,
    isLogtapeCall,
    lazyNames,
    effectiveLazyNames,
    classifyLogArgument,
    resolvedFirstParameterKind,
  };
}

function classifyCheckedType(
  type: AnyNode,
  checker: AnyNode,
  seen: Set<AnyNode>,
): LogArgumentKind {
  if (!type || seen.has(type)) return "unknown";
  seen.add(type);

  const intrinsicName = type.intrinsicName;
  if (intrinsicName === "any" || intrinsicName === "unknown") return "unknown";
  if (type.isStringLiteral?.() === true) return "static-message";
  if (
    checker.isTypeAssignableTo?.(type, checker.getStringType?.()) === true
  ) {
    return "dynamic-message";
  }
  if (checker.isArrayLikeType?.(type) === true) return "dynamic-message";
  if ((type.getCallSignatures?.().length ?? 0) > 0) return "callback";
  if (isCheckedErrorType(type, new Set())) return "error";

  if (type.isIntersection?.()) {
    const kinds = new Set<LogArgumentKind>(
      (type.types ?? []).map((part: AnyNode) =>
        classifyCheckedType(part, checker, seen)
      ),
    );
    if (kinds.has("error")) return "error";
    return kinds.size === 1 ? [...kinds][0]! : "unknown";
  }

  if (type.isUnion?.()) {
    const kinds = new Set<LogArgumentKind>(
      (type.types ?? []).map((part: AnyNode) =>
        classifyCheckedType(part, checker, seen)
      ),
    );
    return kinds.size === 1 ? [...kinds][0]! : "unknown";
  }

  if (type.isTypeParameter?.()) {
    const constraint = type.getConstraint?.();
    return constraint
      ? classifyCheckedType(constraint, checker, seen)
      : "unknown";
  }
  if (typeof type.objectFlags === "number") return "properties";
  if (typeof intrinsicName === "string") return "non-message";
  return "unknown";
}

function isCheckedErrorType(type: AnyNode, seen: Set<AnyNode>): boolean {
  if (!type || seen.has(type)) return false;
  seen.add(type);
  const symbol = type.getSymbol?.() ?? type.symbol;
  if (symbol?.getName?.() === "Error") return true;
  return (type.getBaseTypes?.() ?? []).some((base: AnyNode) =>
    isCheckedErrorType(base, seen)
  );
}

/**
 * Get the SourceCode object from a rule context (v8/v9 compatible).
 */
export function getSourceCode(
  context: Rule.RuleContext,
): Rule.RuleContext["sourceCode"] {
  // deno-lint-ignore no-explicit-any
  return (context as any).sourceCode ?? context.getSourceCode?.();
}
