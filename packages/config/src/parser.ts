import type { ParsedModuleReference } from "./types.ts";

/**
 * Parses a module reference string.
 *
 * Formats:
 * - `#shorthand()` - Shorthand with factory
 * - `#shorthand` - Shorthand without factory
 * - `module#export()` - Module with named export factory
 * - `module#export` - Module with named export
 * - `module()` - Module with default export factory
 * - `module` - Module with default export
 *
 * @param reference The module reference string
 * @returns Parsed module reference
 * @since 2.0.0
 */
export function parseModuleReference(reference: string): ParsedModuleReference {
  const isShorthand = reference.startsWith("#");
  const isFactory = reference.endsWith("()");
  const cleanRef = isFactory ? reference.slice(0, -2) : reference;

  if (isShorthand) {
    return {
      isShorthand: true,
      shorthandName: cleanRef.slice(1),
      isFactory,
    };
  }

  const hashIndex = cleanRef.indexOf("#");
  if (hashIndex !== -1) {
    return {
      isShorthand: false,
      modulePath: cleanRef.slice(0, hashIndex),
      exportName: cleanRef.slice(hashIndex + 1),
      isFactory,
    };
  }

  return {
    isShorthand: false,
    modulePath: cleanRef,
    exportName: "default",
    isFactory,
  };
}
