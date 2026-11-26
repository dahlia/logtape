import type { RedactionTraversalContext } from "./traversal.ts";

const mapEntries = Map.prototype.entries;
const setValues = Set.prototype.values;
const errorIsError = (Error as ErrorConstructor & {
  isError?: (value: unknown) => boolean;
}).isError;
const errorCopies = new WeakSet<object>();
const errorPrototypes = [
  AggregateError.prototype,
  EvalError.prototype,
  RangeError.prototype,
  ReferenceError.prototype,
  SyntaxError.prototype,
  TypeError.prototype,
  URIError.prototype,
  Error.prototype,
];

export const omit = Symbol();

export type TransformField = (
  key: string,
  value: unknown,
) => unknown;

export function defineField(
  target: object,
  key: string,
  value: unknown,
  enumerable = true,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable,
    configurable: true,
    writable: true,
  });
}

function errorPrototype(value: object): Error | undefined {
  if (errorIsError != null && !errorIsError(value) && !errorCopies.has(value)) {
    return undefined;
  }
  return errorPrototypes.find((p) =>
    Object.prototype.isPrototypeOf.call(p, value)
  ) ??
    (errorIsError == null ? undefined : Error.prototype);
}

const diagnostics = ["name", "message", "cause", "errors"];

function* bounded<T>(
  entries: Iterable<T>,
  context: RedactionTraversalContext,
): Iterable<T> {
  let count = 0;
  for (const entry of entries) {
    if (count++ >= context.limits.maxProperties) {
      if (!context.exceededLimits.has("maxProperties")) {
        context.reportLimitExceeded("maxProperties");
      }
      return;
    }
    yield entry;
  }
}

function* errorFields(value: object): Iterable<[string, unknown]> {
  // Do not request the stack descriptor: some runtimes may format it lazily.
  for (const key of new Set([...diagnostics, ...Object.keys(value)])) {
    if (
      key === "stack" || key === "toJSON" || key === "toString" ||
      key === "valueOf"
    ) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor != null && "value" in descriptor &&
      typeof descriptor.value !== "function"
    ) yield [key, descriptor.value];
  }
}

function defineDiagnostic(copy: Error, key: string, result: unknown): void {
  if (result === omit) return;
  // Native renderers may coerce these diagnostics to strings.
  if ((key === "name" || key === "message") && typeof result !== "string") {
    return;
  }
  defineField(copy, key, result, !diagnostics.includes(key));
}

export function copyStructured(
  value: object,
  context: RedactionTraversalContext,
  transform: (value: unknown) => unknown,
  transformField: TransformField,
  transformMapKey: boolean,
): object | undefined {
  const { visited } = context;
  const prototype = errorPrototype(value);
  if (prototype != null) {
    // Do not construct a native Error here. Inspecting or removing its
    // generated stack can execute application code on some runtimes.
    const copy: Error = Object.create(prototype);
    errorCopies.add(copy);
    visited.set(value, copy);
    for (const [key, member] of bounded(errorFields(value), context)) {
      let result: unknown;
      try {
        result = transformField(key, member);
      } catch {
        // Do not pass the original diagnostic or the failure to a sink.
        continue;
      }
      defineDiagnostic(copy, key, result);
    }
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map();
    visited.set(value, copy);
    for (const [key, member] of bounded(mapEntries.call(value), context)) {
      const result = typeof key === "string"
        ? transformField(key, member)
        : transform(member);
      if (result !== omit) {
        const outputKey = !transformMapKey && typeof key === "string"
          ? key
          : transform(key);
        copy.set(outputKey, result);
      }
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    visited.set(value, copy);
    for (const member of bounded(setValues.call(value), context)) {
      copy.add(transform(member));
    }
    return copy;
  }
  return undefined;
}

export function copyStructuredAsync(
  value: object,
  context: RedactionTraversalContext,
  transform: (value: unknown) => Promise<unknown>,
  transformField: (key: string, value: unknown) => Promise<unknown>,
): Promise<object> | undefined {
  const { visited } = context;
  const prototype = errorPrototype(value);
  if (prototype != null) {
    const copy: Error = Object.create(prototype);
    errorCopies.add(copy);
    visited.set(value, copy);
    return Promise.all(
      Array.from(
        bounded(errorFields(value), context),
        async ([key, member]) =>
          [key, await transformField(key, member)] as const,
      ),
    ).then((fields) => {
      for (const [key, member] of fields) defineDiagnostic(copy, key, member);
      return copy;
    });
  }
  if (value instanceof Map) {
    const copy = new Map();
    visited.set(value, copy);
    const entries: Promise<[unknown, unknown]>[] = [];
    for (const [key, member] of bounded(mapEntries.call(value), context)) {
      entries.push(Promise.all(
        typeof key === "string"
          ? [key, transformField(key, member)]
          : [transform(key), transform(member)],
      ));
    }
    return Promise.all(entries).then((resolved) => {
      for (const [key, member] of resolved) copy.set(key, member);
      return copy;
    });
  }
  if (value instanceof Set) {
    const copy = new Set();
    visited.set(value, copy);
    const members: Promise<unknown>[] = [];
    for (const member of bounded(setValues.call(value), context)) {
      members.push(transform(member));
    }
    return Promise.all(members).then((resolved) => {
      for (const member of resolved) copy.add(member);
      return copy;
    });
  }
  return undefined;
}
