/**
 * Host-independent analysis of the property names a message may reference.
 * Keep the scan and first-segment parsing aligned with parseMessageTemplate()
 * and parseNextSegment() in the core logger.  Values are never evaluated here.
 * @module
 */

/**
 * Find distinct property keys not referenced by a static message template.
 * Ambiguous direct and nested lookups both count as references: whether the
 * direct value is undefined cannot be determined from the property names.
 */
export function getUnreferencedKeys(
  template: string,
  keys: readonly string[],
): readonly string[] {
  const remaining = new Set(keys);
  const supplied = new Set(keys);
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "{") {
      if (template[i + 1] === "{") {
        i++;
        continue;
      }
      const closeIndex = template.indexOf("}", i + 1);
      if (closeIndex === -1) continue;
      const key = template.slice(i + 1, closeIndex);
      const trimmed = key.trim();
      if (trimmed === "*") {
        if (supplied.has(key)) remaining.delete(key);
        else if (supplied.has("*")) remaining.delete("*");
        else return [];
      } else {
        remaining.delete(key);
        remaining.delete(trimmed);
        const root = nestedRoot(trimmed);
        if (root !== null) remaining.delete(root);
      }
      i = closeIndex;
    } else if (template[i] === "}" && template[i + 1] === "}") {
      i++;
    }
  }
  return [...remaining];
}

function nestedRoot(path: string): string | null {
  if (
    !(path.includes(".") || path.includes("[") || path.includes("?.")) ||
    path.length === 0 ||
    path.endsWith(".")
  )
    return null;
  const root = firstSegment(path, path.startsWith("?.") ? 2 : 0);
  // Unquoted numeric bracket segments index arrays, not the properties bag.
  // Dot and quoted-bracket segments stay strings, even for a name like "0".
  if (
    typeof root !== "string" ||
    root === "__proto__" ||
    root === "prototype" ||
    root === "constructor"
  )
    return null;
  return root;
}

/** Parse only the first segment, with the core logger's escape semantics. */
function firstSegment(path: string, fromIndex: number): string | number | null {
  const len = path.length;
  let i = fromIndex;
  if (i >= len) return null;
  if (path[i] !== "[") {
    const start = i;
    while (
      i < len &&
      path[i] !== "." &&
      path[i] !== "[" &&
      path[i] !== "?" &&
      path[i] !== "]"
    )
      i++;
    return i === start ? null : path.slice(start, i);
  }
  i++;
  if (i >= len) return null;
  if (path[i] !== '"' && path[i] !== "'") {
    const start = i;
    while (i < len && path[i] !== "]" && path[i] !== "'" && path[i] !== '"')
      i++;
    if (i >= len || i === start) return null;
    const text = path.slice(start, i);
    const number = Number(text);
    return Number.isNaN(number) ? text : number;
  }
  const quote = path[i++];
  let segment = "";
  while (i < len && path[i] !== quote) {
    if (path[i] !== "\\") {
      segment += path[i++];
      continue;
    }
    i++;
    if (i >= len) return null;
    const escaped = path[i];
    switch (escaped) {
      case "n":
        segment += "\n";
        break;
      case "t":
        segment += "\t";
        break;
      case "r":
        segment += "\r";
        break;
      case "b":
        segment += "\b";
        break;
      case "f":
        segment += "\f";
        break;
      case "v":
        segment += "\v";
        break;
      case "0":
        segment += "\0";
        break;
      case "u": {
        // Match the runtime's permissive parseInt, including partial hex.
        const codePoint =
          i + 4 < len ? Number.parseInt(path.slice(i + 1, i + 5), 16) : NaN;
        if (Number.isNaN(codePoint)) segment += escaped;
        else {
          segment += String.fromCharCode(codePoint);
          i += 4;
        }
        break;
      }
      default:
        segment += escaped;
    }
    i++;
  }
  return i >= len ? null : segment;
}
