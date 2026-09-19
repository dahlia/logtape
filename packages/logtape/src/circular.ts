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
 * for `undefined`, functions, and symbols.  The return type says so, unlike
 * the built-in's own declaration, so that every caller has to pick its own
 * fallback for those values.
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
): string | undefined {
  try {
    return JSON.stringify(value, replacer, space);
  } catch {
    return JSON.stringify(value, createCircularReplacer(replacer), space);
  }
}

/**
 * A circular reference recorded by {@link createCircularKeyReplacer}: the
 * location of the replaced value, as the property keys leading to it from the
 * serialized root, and the depth of the ancestor it points back to, `0` being
 * the root itself.
 */
type Reference = readonly [location: readonly string[], depth: number];

/**
 * Creates a {@link JSON.stringify} replacer which renders circular references
 * as the string `"[Circular]"`, like {@link createCircularReplacer}, and
 * additionally appends every reference it replaces to the given table.
 *
 * The replacer is stateful; create a new one for every {@link JSON.stringify}
 * call.
 *
 * @param references The table to append the replaced references to, in the
 *                   order they are encountered.
 * @returns A replacer function to pass to {@link JSON.stringify}.
 */
function createCircularKeyReplacer(references: Reference[]): JsonReplacer {
  const holders: unknown[] = [];
  const keys: string[] = [];
  return function (this: unknown, key: string, value: unknown): unknown {
    if (typeof value !== "object" || value === null) return value;
    // Unwind to the value which holds the one being serialized now; whatever
    // remains on the stack is an ancestor of it.
    while (holders.length > 0 && holders[holders.length - 1] !== this) {
      holders.pop();
      keys.pop();
    }
    for (let i = 0; i < holders.length; i++) {
      if (holders[i] === value) {
        // keys[0] is the empty key JSON.stringify() passes for the root, so
        // the location of the value being visited is the rest of the stack
        // followed by the current key.
        references.push([[...keys.slice(1), key], i]);
        return "[Circular]";
      }
    }
    holders.push(value);
    keys.push(key);
    return value;
  };
}

/**
 * Serializes a value into a string suitable for use as an identity key, the
 * way {@link JSON.stringify} does, except that a value which contains
 * a circular reference is encoded instead of throwing a `TypeError`.
 *
 * Unlike {@link stringifyWithoutCycles}, which renders a circular reference as
 * the string `"[Circular]"` and is meant for output a human reads, this keeps
 * the references apart from the data.  A key decides identity, so rendering
 * every reference as the same marker would not do: it loses which ancestor
 * a reference points back to, so `a.p.q = a` and `a.p.q = a.p` would come out
 * alike, and it cannot be told apart from a value which happens to spell the
 * marker itself.  Any marker is forgeable by ordinary data, so the references
 * are recorded out of band instead.
 *
 * A value which contains a circular reference is therefore encoded as
 * `` `~${JSON.stringify([body, references])}` ``, where `body` is the ordinary
 * serialization with every circular reference replaced by `"[Circular]"`, and
 * `references` is a table of the references which were actually replaced, each
 * the location of the replaced value paired with the depth of the ancestor it
 * points back to.  The locations tell a replaced reference from a value which
 * merely spells the marker, since ordinary data at a location is simply not in
 * the table, and the depths tell apart references which point at different
 * ancestors.  The `~` prefix keeps such a key in a namespace of its own:
 * {@link JSON.stringify} output can begin with `{`, `[`, `"`, `-`, a digit,
 * `t`, `f`, or `n`, but never `~`.
 *
 * What the key distinguishes is therefore what {@link JSON.stringify}
 * distinguishes (property order, dropped `undefined` properties, and a value
 * reached twice as a sibling expanded twice), plus the location and target of
 * every circular reference.  It does not preserve the whole reference graph:
 * one self-referencing object held under two properties and two separate
 * identically shaped ones are equal keys, just as two siblings pointing at one
 * shared object and two equal copies of it already are.
 *
 * The plain {@link JSON.stringify} call is attempted first and the replacer is
 * installed only if it throws, so values without cycles (by far the common
 * case) cost exactly what they cost before.  The price is that a value which
 * does contain one is traversed twice, so the second traversal may repeat the
 * getters and `toJSON()` methods the first one reached before it failed; a
 * getter which returns something different every time makes the key unstable,
 * as it would with any structural key.  The encoding is applied only if the
 * second traversal actually replaced a reference, so a value which failed the
 * first attempt for some other reason keeps the key it would otherwise have
 * had.  If the second attempt fails as well, its error is thrown; values
 * {@link JSON.stringify} cannot serialize at all, such as `BigInt`s, therefore
 * keep failing as before.
 *
 * Like {@link JSON.stringify}, this returns `undefined` rather than a string
 * for `undefined`, functions, and symbols.  The return type says so, unlike
 * the built-in's own declaration, so that every caller has to pick its own
 * fallback for those values.
 *
 * @param value The value to serialize.
 * @returns A string which is equal for two values exactly when they are
 *          equivalent in the sense described above.
 */
export function stringifyKeyWithoutCycles(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    // Fall through to the encoding below.
  }
  const references: Reference[] = [];
  const body: string | undefined = JSON.stringify(
    value,
    createCircularKeyReplacer(references),
  );
  if (body === undefined || references.length < 1) return body;
  return `~${JSON.stringify([body, references])}`;
}
