/**
 * Host-independent analysis of LogTape message templates.
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
  for (const [open, close] of messageSlots(template)) {
    const key = template.slice(open + 1, close);
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
  }
  return [...remaining];
}

function* messageSlots(
  template: string,
): Generator<readonly [open: number, close: number]> {
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "{") {
      if (template[i + 1] === "{") {
        i++;
        continue;
      }
      const close = template.indexOf("}", i + 1);
      if (close === -1) return;
      yield [i, close];
      i = close;
    } else if (template[i] === "}" && template[i + 1] === "}") {
      i++;
    }
  }
}

/** Whether one static message slot is immediately enclosed in matching quotes. */
export function hasQuotedMessageSlot(template: string): boolean {
  for (const [open, close] of messageSlots(template)) {
    if (matchingQuotes(template[open - 1], template[close + 1])) return true;
  }
  return false;
}

/** Whether one interpolation has matching quotes in its adjacent text chunks. */
export function hasQuotedInterpolation(
  chunks: readonly (string | null)[],
): boolean {
  for (let i = 1; i < chunks.length; i++) {
    if (matchingQuotes(chunks[i - 1]?.at(-1), chunks[i]?.[0])) return true;
  }
  return false;
}

function matchingQuotes(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (left === "'" || left === '"') && right === left;
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
