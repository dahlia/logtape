/**
 * A replacer function in the shape {@link JSON.stringify} accepts.
 */
export type JsonReplacer = (
  this: unknown,
  key: string,
  value: unknown,
) => unknown;

/**
 * Creates a {@link JSON.stringify} replacer which renders circular references
 * as the string `"[Circular]"` instead of letting {@link JSON.stringify} throw
 * a `TypeError`.
 *
 * The returned replacer keeps a stack of the values which are currently being
 * serialized, so a value that merely appears more than once, such as the same
 * object held by two sibling properties, is still serialized in full.  Only a
 * value which contains itself is replaced.
 *
 * The replacer is stateful; create a new one for every {@link JSON.stringify}
 * call.
 *
 * Cycles are detected as the replacer sees them, which is *after* a `toJSON()`
 * method has run.  A `toJSON()` method which allocates a fresh object referring
 * back to its owner on every call therefore still recurses without bound, just
 * as it does with a plain {@link JSON.stringify} call.
 *
 * @param inner An optional replacer to compose with.  It runs first, and the
 *              value it returns is what gets serialized.  Cycles are detected
 *              in both the original and the returned values, so a replacer
 *              which allocates a new object for every visit (as the error
 *              serializer does) cannot hide a cycle.
 * @returns A replacer function to pass to {@link JSON.stringify}.
 */
export function createCircularReplacer(inner?: JsonReplacer): JsonReplacer {
  const sources: unknown[] = [];
  const results: unknown[] = [];
  return function (this: unknown, key: string, value: unknown): unknown {
    const result = inner === undefined ? value : inner.call(this, key, value);
    if (typeof result !== "object" || result === null) return result;
    // Unwind to the value which holds the one being serialized now; whatever
    // remains on the stack is an ancestor of it.
    while (results.length > 0 && results[results.length - 1] !== this) {
      results.pop();
      sources.pop();
    }
    for (let i = 0; i < results.length; i++) {
      if (results[i] === result || sources[i] === value) return "[Circular]";
    }
    sources.push(value);
    results.push(result);
    return result;
  };
}

/**
 * Serializes a value the way {@link JSON.stringify} does, except that circular
 * references are rendered as the string `"[Circular]"` instead of throwing
 * a `TypeError`.
 *
 * The plain {@link JSON.stringify} call is attempted first and the cycle-safe
 * replacer is installed only if it throws, so values without cycles (by far the
 * common case) cost exactly what they cost before.  The price is that a value
 * which does contain a cycle is traversed twice, so its getters and `toJSON()`
 * methods run twice.  If the second attempt fails as well, its error is thrown;
 * values {@link JSON.stringify} cannot serialize at all, such as `BigInt`s,
 * therefore keep failing as before.
 *
 * Like {@link JSON.stringify}, this returns `undefined` rather than a string
 * for `undefined`, functions, and symbols, and its return type follows the
 * same convention as the built-in's.
 *
 * @param value The value to serialize.
 * @param replacer An optional replacer to apply, as in {@link JSON.stringify}.
 * @param space An optional indentation, as in {@link JSON.stringify}.
 * @returns The JSON representation of the value.
 */
export function stringifyWithoutCycles(
  value: unknown,
  replacer?: JsonReplacer,
  space?: string | number,
): string {
  try {
    return JSON.stringify(value, replacer, space);
  } catch {
    return JSON.stringify(value, createCircularReplacer(replacer), space);
  }
}
