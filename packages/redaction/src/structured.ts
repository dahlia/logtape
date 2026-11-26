const mapForEach = Map.prototype.forEach;
const setForEach = Set.prototype.forEach;
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

export function copyStructured(
  value: object,
  visited: Map<object, object>,
  transform: (value: unknown) => unknown,
  transformField: TransformField,
  transformMapKey: boolean,
): object | undefined {
  const prototype = errorPrototype(value);
  if (prototype != null) {
    // Do not construct a native Error here. Inspecting or removing its
    // generated stack can execute application code on some runtimes.
    const copy: Error = Object.create(prototype);
    errorCopies.add(copy);
    visited.set(value, copy);
    const diagnostics = ["name", "message", "cause", "errors"];
    // Read known data descriptors individually. Do not enumerate
    // non-enumerable keys or request the stack descriptor.
    for (const key of new Set([...diagnostics, ...Object.keys(value)])) {
      if (
        key === "stack" || key === "toJSON" || key === "toString" ||
        key === "valueOf"
      ) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor == null || !("value" in descriptor) ||
        typeof descriptor.value === "function"
      ) continue;
      let result: unknown;
      try {
        result = transformField(key, descriptor.value);
      } catch {
        // Do not pass the original diagnostic or the failure to a sink.
        continue;
      }
      if (result === omit) continue;
      // Native renderers may coerce these diagnostics to strings.
      if ((key === "name" || key === "message") && typeof result !== "string") {
        continue;
      }
      defineField(copy, key, result, !diagnostics.includes(key));
    }
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map();
    visited.set(value, copy);
    mapForEach.call(value, (member, key) => {
      const result = typeof key === "string"
        ? transformField(key, member)
        : transform(member);
      if (result !== omit) {
        const outputKey = !transformMapKey && typeof key === "string"
          ? key
          : transform(key);
        copy.set(outputKey, result);
      }
    });
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    visited.set(value, copy);
    setForEach.call(value, (member) => copy.add(transform(member)));
    return copy;
  }
  return undefined;
}
